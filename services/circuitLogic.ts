
import { ComponentData, Wire, ComponentType, Phase } from '../types';

export interface SimulationResult {
  energizedWires: string[];
  poweredComponents: string[];
  multimeterReadings: Record<string, string>;
  componentStates: Record<string, boolean>; // Updates for coil/trip states
  heatUpdates: Record<string, number>; // New heat values (Relays, Breakers)
  motorUpdates: Record<string, { direction: 1|-1, speed: number, temp: number, isBurnedOut: boolean, isStalled: boolean, phaseError: boolean }>; // Specific motor data
  wirePhases: Record<string, Phase[]>; // New: specific phases on each wire
  meterUpdates: Record<string, number>; // Wattage for meters
}

// Thermal constants (Sim tick is ~100ms)
const TRIP_THRESHOLD = 100;

// COOLING RATE: 
// 0.2 units per tick -> 500 ticks (50 sec) to cool from 100 to 0.
const COOLING_RATE = 0.2; 

// HEAT CALIBRATION (IEC 60947-4-1 Class 10A Approximation):
// Target:
// - 7.2x In (Stall/Start) -> 2-10s. Let's aim for ~4s (40 ticks).
//   Ratio^2 = 51.8. 
//   100 = 40 * F * 51.8 => F = 100 / 2072 ≈ 0.048.
// - 1.5x In (Overload) -> < 2 mins. Let's aim for ~90s (900 ticks).
//   Ratio^2 = 2.25.
//   100 = 900 * F * 2.25 => F = 100 / 2025 ≈ 0.049.
// Selected Factor: 0.05
const THERMAL_HEAT_FACTOR = 0.05;

// Physical Constants
const RES_WIRE = 0.05; 
const RES_CLOSED_SWITCH = 0.01; 
const RES_OPEN_SWITCH = Infinity; // Infinite resistance for open switch to prevent leakage/ghost voltages
const RES_METER_SHUNT = 0.005; // 5 mOhm internal resistance for meters

// Motor Physics Constants
// Nominal Startup time (No Load)
const MOTOR_STARTUP_TICKS_BASE = 30; 
// Nominal Deceleration time (No Load)
const MOTOR_DECEL_TICKS_BASE = 90;  
const MOTOR_HEAT_NORMAL = 0.1; // Heat gain per tick at nominal load
const MOTOR_HEAT_OVERLOAD = 1.5; // Multiplier for overload heat
const MOTOR_HEAT_PHASE_LOSS = 8.0; // Multiplier for phase loss heat (very fast)

// Complex Number Helper for AC Analysis
type Complex = { re: number, im: number };
const C = {
    add: (a: Complex, b: Complex) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a: Complex, b: Complex) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a: Complex, s: number) => ({ re: a.re * s, im: a.im * s }),
    mag: (a: Complex) => Math.sqrt(a.re * a.re + a.im * a.im),
    phase: (a: Complex) => Math.atan2(a.im, a.re) * (180 / Math.PI), // Returns degrees
    zero: { re: 0, im: 0 }
};

export const runSimulation = (
  components: ComponentData[],
  wires: Wire[],
  isSimulating: boolean 
): SimulationResult => {
  
  // 1. Snapshot current states
  const virtualStates: Record<string, boolean> = {};
  const currentHeat: Record<string, number> = {};
  const motorTemps: Record<string, number> = {};
  const motorBurnedState: Record<string, boolean> = {};
  const motorUpdates: Record<string, { direction: 1|-1, speed: number, temp: number, isBurnedOut: boolean, isStalled: boolean, phaseError: boolean }> = {};
  const meterUpdates: Record<string, number> = {}; 

  components.forEach(c => {
      virtualStates[c.id] = c.state.isOn;
      currentHeat[c.id] = c.state.accumulatedHeat || 0;
      motorTemps[c.id] = c.state.temperature || 0;
      motorBurnedState[c.id] = c.state.isBurnedOut || false;
      meterUpdates[c.id] = 0;
  });

  // 2. Build Netlist & Graph
  // Map "ComponentID:TerminalID" -> NetIndex
  const terminalToNet = new Map<string, number>();
  let netCount = 0;

  // Initialize adjacency for wire grouping
  const wireAdj: Record<string, string[]> = {};
  wires.forEach(w => {
      const u = `${w.startCompId}:${w.startTermId}`;
      const v = `${w.endCompId}:${w.endTermId}`;
      if (!wireAdj[u]) wireAdj[u] = [];
      if (!wireAdj[v]) wireAdj[v] = [];
      wireAdj[u].push(v);
      wireAdj[v].push(u);
  });

  // Assign Net IDs
  const allTerminals = new Set<string>();
  wires.forEach(w => {
      allTerminals.add(`${w.startCompId}:${w.startTermId}`);
      allTerminals.add(`${w.endCompId}:${w.endTermId}`);
  });
  // Also add source terminals even if not wired (to set potential sources)
  components.filter(c => c.type === ComponentType.SOURCE_3PH).forEach(src => {
      ['L1', 'L2', 'L3', 'N', 'PE'].forEach(t => allTerminals.add(`${src.id}:${t}`));
  });

  for (const term of allTerminals) {
      if (!terminalToNet.has(term)) {
          const queue = [term];
          terminalToNet.set(term, netCount);
          while(queue.length) {
              const t = queue.pop()!;
              const neighbors = wireAdj[t] || [];
              for(const n of neighbors) {
                  if(!terminalToNet.has(n)) {
                      terminalToNet.set(n, netCount);
                      queue.push(n);
                  }
              }
          }
          netCount++;
      }
  }

  // 3. Define Sources (Fixed Potentials)
  // Phasors: 220V RMS phase-to-neutral. 
  // L1: 0 deg, L2: -120 deg, L3: +120 deg (or -240)
  const L1_PHASOR = { re: 220, im: 0 };
  const L2_PHASOR = { re: -110, im: -190.52 }; // 220 * cos(-120), 220 * sin(-120)
  const L3_PHASOR = { re: -110, im: 190.52 };  // 220 * cos(120), 220 * sin(120)
  const N_PHASOR = { re: 0, im: 0 };

  const fixedPotentials = new Map<number, Complex>();
  const isNetEnergized = new Set<number>(); // For visual wire feedback

  if (isSimulating) {
      components.filter(c => c.type === ComponentType.SOURCE_3PH).forEach(src => {
          const phases = src.properties?.phases || 3;
          const hasN = src.properties?.hasNeutral !== false;
          
          const setFixed = (term: string, val: Complex) => {
              const key = `${src.id}:${term}`;
              if (terminalToNet.has(key)) {
                  const net = terminalToNet.get(key)!;
                  fixedPotentials.set(net, val);
                  isNetEnergized.add(net);
              }
          };

          setFixed('L1', L1_PHASOR);
          if (phases >= 2) setFixed('L2', L2_PHASOR);
          if (phases >= 3) setFixed('L3', L3_PHASOR);
          if (hasN) setFixed('N', N_PHASOR);
          setFixed('PE', N_PHASOR);
      });
  }

  // 4. Build Conductance Matrix (Graph based)
  const edges: { u: number, v: number, g: number }[] = [];

  const addEdge = (c: ComponentData, t1: string, t2: string, r_override?: number) => {
      const k1 = `${c.id}:${t1}`;
      const k2 = `${c.id}:${t2}`;
      if (terminalToNet.has(k1) && terminalToNet.has(k2)) {
          const u = terminalToNet.get(k1)!;
          const v = terminalToNet.get(k2)!;
          if (u !== v) {
              const r = r_override ?? getComponentResistance(c);
              const conductance = 1.0 / Math.max(1e-6, r);
              edges.push({ u, v, g: conductance });
          }
      }
  };

  components.forEach(c => {
      if (c.type === ComponentType.SOURCE_3PH) return; 
      
      if (c.type === ComponentType.MULTIMETER) {
          if (c.state.multimeterMode === 'AAC') addEdge(c, 'V', 'COM', RES_CLOSED_SWITCH);
          else if (c.state.multimeterMode === 'VAC') addEdge(c, 'V', 'COM', 1e7); 
          return;
      }
      
      if (c.type === ComponentType.ENERGY_METER) {
          const mType = c.properties?.meterType || '1ph';
          if (mType === '1ph') {
              addEdge(c, 'L_in', 'L_out', RES_METER_SHUNT);
              addEdge(c, 'N_in', 'N_out', RES_METER_SHUNT);
          } else {
              addEdge(c, '1', '2', RES_METER_SHUNT);
              addEdge(c, '3', '4', RES_METER_SHUNT);
              addEdge(c, '5', '6', RES_METER_SHUNT);
              addEdge(c, '7', '8', RES_METER_SHUNT);
          }
          return;
      }

      // Internal Connections
      if (c.type === ComponentType.BREAKER_3P) {
          addEdge(c, '1', '2'); addEdge(c, '3', '4'); addEdge(c, '5', '6');
      } else if (c.type === ComponentType.CONTACTOR) {
          const contactR = virtualStates[c.id] ? RES_CLOSED_SWITCH : RES_OPEN_SWITCH;
          addEdge(c, '1', '2', contactR); 
          addEdge(c, '3', '4', contactR); 
          addEdge(c, '5', '6', contactR);
          addEdge(c, '13', '14', contactR); 
          addEdge(c, 'A1', 'A2'); 
          
          const ncR = virtualStates[c.id] ? RES_OPEN_SWITCH : RES_CLOSED_SWITCH;
          addEdge(c, '15', '16', ncR); 
      } else if (c.type === ComponentType.THERMAL_RELAY) {
          addEdge(c, '1', '2', 0.05); addEdge(c, '3', '4', 0.05); addEdge(c, '5', '6', 0.05);
          if (virtualStates[c.id]) addEdge(c, '95', '96', RES_CLOSED_SWITCH); 
          else addEdge(c, '97', '98', RES_CLOSED_SWITCH); 
      } else if (c.type === ComponentType.BUTTON_NO || c.type === ComponentType.SWITCH) {
          const t1 = c.type === ComponentType.SWITCH ? '1' : '13';
          const t2 = c.type === ComponentType.SWITCH ? '2' : '14';
          addEdge(c, t1, t2);
      } else if (c.type === ComponentType.BUTTON_NC) {
          addEdge(c, '11', '12');
      } else if (c.type === ComponentType.BUTTON_UNIVERSAL) {
          const rNO = virtualStates[c.id] ? RES_CLOSED_SWITCH : RES_OPEN_SWITCH;
          const rNC = virtualStates[c.id] ? RES_OPEN_SWITCH : RES_CLOSED_SWITCH;
          addEdge(c, '11', '12', rNC); // NC
          addEdge(c, '13', '14', rNO); // NO
      } else if (c.type === ComponentType.SIGNAL_LAMP || c.type === ComponentType.INCANDESCENT_BULB) {
          addEdge(c, 'X1', 'X2');
      } else if (c.type === ComponentType.RHEOSTAT) {
          addEdge(c, '1', '2');
      } else if (c.type === ComponentType.MOTOR_3PH && !motorBurnedState[c.id]) {
          const power = c.properties?.power || 1.5; // kW
          const rpm = c.properties?.rpm || 1500;
          const load = c.properties?.loadFactor ?? 0;
          
          // No-Load Current Logic
          let k0 = 0.35; 
          if (rpm >= 2800) k0 = 0.20;
          else if (rpm < 1400) k0 = 0.50;

          // Nominal Current Formula
          const pWatts = power * 1000;
          const nominalAmps = pWatts / (Math.sqrt(3) * 380 * 0.85); 
          
          // Steady State Current
          let steadyAmps = nominalAmps * (k0 + (1 - k0) * load);
          if (load > 1.0) steadyAmps = nominalAmps * load; // Overload logic

          // Startup (Inrush) Current Logic
          // Start current = 7 * Inom
          const currentSpeed = c.state.currentSpeed || 0;
          let actualAmps = steadyAmps;

          if (isSimulating && currentSpeed < rpm) {
              const speedRatio = Math.max(0, currentSpeed / rpm);
              // Linear Interpolation: 7x down to 1x
              const startAmps = nominalAmps * 7;
              actualAmps = startAmps - (startAmps - steadyAmps) * speedRatio;
          }

          const resistance = (Math.sqrt(3) * 380) / Math.max(0.1, actualAmps);

          addEdge(c, 'U1', 'V1', resistance);
          addEdge(c, 'V1', 'W1', resistance);
          addEdge(c, 'W1', 'U1', resistance);
      } else if (c.type === ComponentType.SELECTOR) {
          const pos = c.state.selectorPosition ?? 0;
          if (pos === 1) addEdge(c, 'L', '1', RES_CLOSED_SWITCH);
          if (pos === 2) addEdge(c, 'L', '2', RES_CLOSED_SWITCH);
          if (pos === 3) addEdge(c, 'L', '3', RES_CLOSED_SWITCH);
      }
  });

  // 5. Solve Circuit
  const voltages = new Array<Complex>(netCount).fill(C.zero);
  fixedPotentials.forEach((val, netId) => {
      if (netId < netCount) voltages[netId] = val;
  });

  const adj: { target: number, g: number }[][] = Array.from({ length: netCount }, () => []);
  edges.forEach(e => {
      adj[e.u].push({ target: e.v, g: e.g });
      adj[e.v].push({ target: e.u, g: e.g });
  });

  const ITERATIONS = 500; 
  for(let iter=0; iter<ITERATIONS; iter++) {
      let maxDelta = 0;
      for(let i=0; i<netCount; i++) {
          if (fixedPotentials.has(i)) continue;
          let sumRe = 0; let sumIm = 0; let sumG = 0;
          const neighbors = adj[i];
          if (neighbors.length === 0) continue;
          for(const edge of neighbors) {
              const v = voltages[edge.target];
              sumRe += v.re * edge.g;
              sumIm += v.im * edge.g;
              sumG += edge.g;
          }
          if (sumG > 0) {
              const newRe = sumRe / sumG;
              const newIm = sumIm / sumG;
              const dRe = Math.abs(newRe - voltages[i].re);
              const dIm = Math.abs(newIm - voltages[i].im);
              if (dRe + dIm > maxDelta) maxDelta = dRe + dIm;
              voltages[i] = { re: newRe, im: newIm };
          }
      }
      if (maxDelta < 0.0001) break; 
  }

  // 6. Trace Phases
  const finalEnergizedWires = new Set<string>();
  const finalPoweredComponents = new Set<string>();
  const finalWirePhases: Record<string, Phase[]> = {};
  const netPhases = new Map<number, Set<Phase>>();
  const propagationQueue: number[] = [];

  if (isSimulating) {
      components.filter(c => c.type === ComponentType.SOURCE_3PH).forEach(src => {
          ['L1', 'L2', 'L3', 'N', 'PE'].forEach(t => {
              const key = `${src.id}:${t}`;
              if (terminalToNet.has(key)) {
                  const net = terminalToNet.get(key)!;
                  if (!netPhases.has(net)) netPhases.set(net, new Set());
                  netPhases.get(net)!.add(t as Phase);
                  propagationQueue.push(net);
              }
          });
      });
  }

  const hardAdj: number[][] = Array.from({ length: netCount }, () => []);
  edges.forEach(e => {
      if (e.g > 0.5) { 
          hardAdj[e.u].push(e.v);
          hardAdj[e.v].push(e.u);
      }
  });

  let qIdx = 0;
  while(qIdx < propagationQueue.length) {
      const u = propagationQueue[qIdx++];
      const uPhases = netPhases.get(u)!;
      const neighbors = hardAdj[u];
      for(const v of neighbors) {
          if (!netPhases.has(v)) netPhases.set(v, new Set());
          const vPhases = netPhases.get(v)!;
          let changed = false;
          for(const p of uPhases) {
              if (!vPhases.has(p)) {
                  vPhases.add(p);
                  changed = true;
              }
          }
          if (changed) propagationQueue.push(v);
      }
  }

  wires.forEach(w => {
      const startKey = `${w.startCompId}:${w.startTermId}`;
      if (terminalToNet.has(startKey)) {
          const net = terminalToNet.get(startKey)!;
          if (netPhases.has(net)) {
              const phases = Array.from(netPhases.get(net)!);
              if (phases.length > 0) {
                  finalEnergizedWires.add(w.id);
                  finalWirePhases[w.id] = phases;
              }
          }
      }
  });

  const getVoltageDiff = (c: ComponentData, t1: string, t2: string): number => {
      const k1 = `${c.id}:${t1}`;
      const k2 = `${c.id}:${t2}`;
      if (terminalToNet.has(k1) && terminalToNet.has(k2)) {
          const u = terminalToNet.get(k1)!;
          const v = terminalToNet.get(k2)!;
          const diff = C.sub(voltages[u], voltages[v]);
          return C.mag(diff);
      }
      return 0;
  };
  
  const getComplexVoltage = (c: ComponentData, t: string): Complex => {
      const k = `${c.id}:${t}`;
      if (terminalToNet.has(k)) {
          return voltages[terminalToNet.get(k)!];
      }
      return C.zero;
  }
  
  const getTerminalPhases = (c: ComponentData, t: string): Set<Phase> => {
      const k = `${c.id}:${t}`;
      if (terminalToNet.has(k)) {
          const net = terminalToNet.get(k)!;
          return netPhases.get(net) || new Set();
      }
      return new Set();
  }

  // --- COMPONENT LOGIC ---
  components.forEach(c => {
      // 7a. Lamps
      if (c.type === ComponentType.SIGNAL_LAMP || c.type === ComponentType.INCANDESCENT_BULB) {
          if (c.state.isBurnedOut) return;
          const voltage = getVoltageDiff(c, 'X1', 'X2');
          const rated = c.properties?.voltageRating || 220;
          const ratio = voltage / rated;

          if (ratio > 1.1) {
              c.state.isBurnedOut = true;
              currentHeat[c.id] = 200; 
          } else if (ratio > 0.1) {
              finalPoweredComponents.add(c.id);
              virtualStates[c.id] = true;
              let b = 0;
              if (c.type === ComponentType.INCANDESCENT_BULB) b = Math.pow(ratio, 1.6);
              else b = ratio > 0.4 ? (ratio > 0.8 ? 1 : 0.6) : 0; 
              c.state.brightness = Math.min(1.2, b);
              const power = c.properties?.power || 60;
              meterUpdates[c.id] = power * (ratio * ratio);
          } else {
              virtualStates[c.id] = false;
              c.state.brightness = 0;
          }
      }
      
      // 7z. Energy Meter
      else if (c.type === ComponentType.ENERGY_METER) {
          let totalPower = 0;
          const shunt = RES_METER_SHUNT;
          let isNeutralConnected = false;
          
          // Verify 'Voltage Coil' connection (Must connect to Source Neutral)
          if (c.properties?.meterType === '3ph') {
              const phases = getTerminalPhases(c, '7');
              if (phases.has('N')) isNeutralConnected = true;
          } else {
              const phases = getTerminalPhases(c, 'N_in');
              if (phases.has('N')) isNeutralConnected = true;
          }

          if (isNeutralConnected) {
              if (c.properties?.meterType === '3ph') {
                  const pairs = [{ in: '1', out: '2' }, { in: '3', out: '4' }, { in: '5', out: '6' }];
                  const vN = getComplexVoltage(c, '7');
                  pairs.forEach(p => {
                      const vIn = getComplexVoltage(c, p.in);
                      const vOut = getComplexVoltage(c, p.out);
                      const iRe = (vIn.re - vOut.re) / shunt;
                      const iIm = (vIn.im - vOut.im) / shunt;
                      const vPhRe = vIn.re - vN.re;
                      const vPhIm = vIn.im - vN.im;
                      totalPower += (vPhRe * iRe) + (vPhIm * iIm);
                  });
              } else {
                  const vIn = getComplexVoltage(c, 'L_in');
                  const vOut = getComplexVoltage(c, 'L_out');
                  const vN = getComplexVoltage(c, 'N_in');
                  const iRe = (vIn.re - vOut.re) / shunt;
                  const iIm = (vIn.im - vOut.im) / shunt;
                  const vPhRe = vIn.re - vN.re;
                  const vPhIm = vIn.im - vN.im;
                  totalPower = (vPhRe * iRe) + (vPhIm * iIm);
              }
          }
          meterUpdates[c.id] = Math.abs(totalPower);
      }

      // 7b. Coils
      else if (c.type === ComponentType.CONTACTOR) {
          if (c.state.isBurnedOut) {
              virtualStates[c.id] = false;
              return;
          }
          const voltage = getVoltageDiff(c, 'A1', 'A2');
          const ratedStr = c.properties?.coilVoltage || '220V';
          const rated = ratedStr === '380V' ? 380 : 220;
          if (voltage > rated * 1.2 && Math.random() < 0.1) { c.state.isBurnedOut = true; virtualStates[c.id] = false; }

          const pickUp = rated * 0.85;
          const dropOut = rated * 0.84; 
          if (c.state.isOn) { if (voltage < dropOut) virtualStates[c.id] = false; } 
          else { if (voltage > pickUp) virtualStates[c.id] = true; }
      }

      // 7c. Motor (3-Phase Physics with Inertia)
      else if (c.type === ComponentType.MOTOR_3PH) {
          if (motorBurnedState[c.id]) {
              motorUpdates[c.id] = { direction: 1, speed: 0, temp: 150, isBurnedOut: true, isStalled: false, phaseError: false };
              return;
          }
          const vUV = getVoltageDiff(c, 'U1', 'V1');
          const vVW = getVoltageDiff(c, 'V1', 'W1');
          const vWU = getVoltageDiff(c, 'W1', 'U1');
          const avgV = (vUV + vVW + vWU) / 3;
          
          let targetSpeed = 0;
          let direction: 1|-1 = (c.state.direction as 1|-1) || 1; 
          
          let phaseError = false;
          let isStalled = false;
          let heatGeneration = 0;
          let currentSpeed = c.state.currentSpeed || 0;
          const ratedSpeed = c.properties?.rpm || 1500;
          const load = c.properties?.loadFactor ?? 0;

          // Phase Analysis
          if (avgV > 50) { // Some voltage present
              // Check phase balance
              const minV = Math.min(vUV, vVW, vWU);
              const maxV = Math.max(vUV, vVW, vWU);
              
              if (minV < maxV * 0.85) { // Significant unbalance (>15%) -> Phase Loss
                   phaseError = true;
                   finalPoweredComponents.add(c.id);
                   if (currentSpeed < ratedSpeed * 0.2) {
                       targetSpeed = 0; // Stalled
                       isStalled = true;
                   } else {
                       if (load > 0.4) targetSpeed = 0; // Stall under load
                       else targetSpeed = ratedSpeed * 0.8; // Run slow/rough
                   }
                   heatGeneration = MOTOR_HEAT_PHASE_LOSS; 
              } else if (avgV > 300) { // Healthy 3-phase
                   finalPoweredComponents.add(c.id);
                   const vU = getComplexVoltage(c, 'U1');
                   const vV = getComplexVoltage(c, 'V1');
                   let diff = C.phase(vV) - C.phase(vU);
                   while (diff > 180) diff -= 360;
                   while (diff <= -180) diff += 360;
                   
                   // Only update direction if we have a valid phase sequence
                   if (diff < -90 && diff > -150) direction = 1;
                   else if (diff > 90 && diff < 150) direction = -1;
                   else { phaseError = true; isStalled = true; } 

                   if (!phaseError) {
                       // Normal Operation
                       const slip = 0.05 * load; 
                       targetSpeed = ratedSpeed * (1 - slip);
                       
                       // Overload check
                       if (load > 1.0) heatGeneration = MOTOR_HEAT_OVERLOAD * Math.pow(load, 1.25);
                       else heatGeneration = MOTOR_HEAT_NORMAL * load;
                   }
              }
          }

          // Inertia Logic (Accel/Decel) dependent on LOAD
          // Startup: Heavy load = slower start. 
          // Stop: Heavy load = faster stop (braking).
          
          const startupTicks = MOTOR_STARTUP_TICKS_BASE * (1 + load); // Load 0: 30 ticks, Load 1: 60 ticks
          const accelRate = ratedSpeed / startupTicks;
          
          const decelTicks = MOTOR_DECEL_TICKS_BASE / (1 + load * 2); // Load 0: 90 ticks, Load 1: 30 ticks
          const decelRate = ratedSpeed / decelTicks; 

          if (isSimulating) {
              if (targetSpeed > currentSpeed) {
                  currentSpeed = Math.min(targetSpeed, currentSpeed + accelRate);
              } else if (targetSpeed < currentSpeed) {
                  currentSpeed = Math.max(targetSpeed, currentSpeed - decelRate);
              }
          } else {
              currentSpeed = 0; // Instant stop if sim off
          }
          
          // Temperature Logic
          let temp = motorTemps[c.id];
          if (phaseError || isStalled) {
               temp += heatGeneration || 2.0; 
          } else {
               temp += heatGeneration;
               const cooling = (currentSpeed / ratedSpeed) * 0.15; 
               temp -= cooling; 
          }
          temp = Math.max(20, temp - 0.05); // Ambient cooling
          
          if (temp > 150) {
              motorBurnedState[c.id] = true;
              currentSpeed = 0; // Seized
          }

          // Power Calculation for Meter (Active Power)
          let activePower = 0;
          if (phaseError) activePower = (c.properties?.power || 1.5) * 1000 * 3; 
          else if (currentSpeed > 0) activePower = (c.properties?.power || 1.5) * 1000 * (0.05 + 0.95 * load);
          
          motorUpdates[c.id] = { 
              direction, 
              speed: Math.round(currentSpeed), 
              temp, 
              isBurnedOut: motorBurnedState[c.id],
              isStalled,
              phaseError
          };
      }
  });

  // 8. Protection Logic (Breakers & Relays)
  if (isSimulating) {
      components.forEach(c => {
          let isOverloaded = false;
          let heatGen = 0;
          let tripped = false;

          if (c.type === ComponentType.BREAKER_3P && virtualStates[c.id]) {
              const rated = c.properties?.currentRating || 16;
              const curve = c.properties?.breakerCurve || 'C';
              
              // Magnetic Trip Thresholds (Instant)
              let magMult = 9; 
              if (curve === 'A') magMult = 2.5; 
              if (curve === 'B') magMult = 4.0;
              if (curve === 'D') magMult = 15.0;

              const r = RES_CLOSED_SWITCH; 
              const i1 = getVoltageDiff(c, '1', '2') / r;
              const i3 = getVoltageDiff(c, '3', '4') / r;
              const i5 = getVoltageDiff(c, '5', '6') / r;
              const maxCurrent = Math.max(i1, i3, i5);
              
              if (maxCurrent > rated * magMult) { 
                  virtualStates[c.id] = false; currentHeat[c.id] = TRIP_THRESHOLD; tripped = true;
              } else if (maxCurrent > rated * 1.05) {
                  // Thermal Overload
                  isOverloaded = true;
                  const ratio = maxCurrent / rated;
                  heatGen = THERMAL_HEAT_FACTOR * Math.pow(ratio, 2);
              }
          }
          else if (c.type === ComponentType.THERMAL_RELAY) {
               if (virtualStates[c.id]) {
                   // Thermal Relay uses precise Setting
                   const setting = c.properties?.relaySetting || 1.0;
                   const r = 0.05; 
                   const i1 = getVoltageDiff(c, '1', '2') / r;
                   const i3 = getVoltageDiff(c, '3', '4') / r;
                   const i5 = getVoltageDiff(c, '5', '6') / r;
                   const maxCurrent = Math.max(i1, i3, i5);

                   // Strict 1.05 non-tripping threshold
                   if (maxCurrent > setting * 1.05) {
                       isOverloaded = true;
                       const ratio = maxCurrent / setting;
                       // Thermal relay curve
                       heatGen = THERMAL_HEAT_FACTOR * Math.pow(ratio, 2);
                   }
               }
          }

          if (!tripped) {
              let h = currentHeat[c.id] || 0;
              
              if (isOverloaded) {
                  h += heatGen;
              } else {
                  // Cooling
                  h = Math.max(0, h - COOLING_RATE); 
              }
              
              // Clamp heat
              h = Math.min(TRIP_THRESHOLD + 20, h); 
              currentHeat[c.id] = h;
              
              if (h >= TRIP_THRESHOLD) virtualStates[c.id] = false; 
          }
      });
  }

  // 9. Multimeter
  const multimeterReadings: Record<string, string> = {};
  components.filter(c => c.type === ComponentType.MULTIMETER).forEach(m => {
      const mode = m.state.multimeterMode || 'OFF';
      if (mode === 'OFF') multimeterReadings[m.id] = '';
      else if (mode === 'VAC') {
          if (isSimulating) {
              const v = getVoltageDiff(m, 'V', 'COM');
              multimeterReadings[m.id] = `${Math.round(v)} V`;
          } else multimeterReadings[m.id] = '0 V';
      } else if (mode === 'VDC') multimeterReadings[m.id] = '0 V';
      else if (mode === 'OHM') {
          const v = getVoltageDiff(m, 'V', 'COM');
          if (v > 10) {
              multimeterReadings[m.id] = 'ERR'; // Voltage present on Ohm meter
          } else {
              // Real Resistance Calculation via DC Injection (Nodal Analysis)
              const startNet = terminalToNet.get(`${m.id}:V`);
              const endNet = terminalToNet.get(`${m.id}:COM`);

              if (startNet !== undefined && endNet !== undefined) {
                  if (startNet === endNet) {
                      multimeterReadings[m.id] = '0.0 Ω'; // Shorted
                  } else {
                      // Run a mini-solver for resistance
                      // Treat startNet as 1V source, endNet as 0V source (Ground)
                      const testVoltages = new Float64Array(netCount).fill(0);
                      testVoltages[startNet] = 1.0;
                      
                      // Perform Iterations for DC
                      for(let iter=0; iter<100; iter++) {
                          for(let i=0; i<netCount; i++) {
                              if (i === startNet || i === endNet) continue; // Skip sources
                              let sumVg = 0;
                              let sumG = 0;
                              // Reuse the adjacency matrix from main loop
                              // Note: We ignore main sources (fixedPotentials) here to simulate Ohmmeter isolation
                              for(const edge of adj[i]) {
                                  sumVg += testVoltages[edge.target] * edge.g;
                                  sumG += edge.g;
                              }
                              if (sumG > 0) {
                                  testVoltages[i] = sumVg / sumG;
                              }
                          }
                      }

                      // Calculate Current flowing out of startNet
                      // I = sum((V_start - V_neighbor) * g)
                      let currentOut = 0;
                      for(const edge of adj[startNet]) {
                          currentOut += (1.0 - testVoltages[edge.target]) * edge.g;
                      }

                      if (currentOut < 1e-9) {
                          multimeterReadings[m.id] = 'OL';
                      } else {
                          const R = 1.0 / currentOut;
                          if (R < 1000) multimeterReadings[m.id] = `${R.toFixed(1)} Ω`;
                          else if (R < 1000000) multimeterReadings[m.id] = `${(R/1000).toFixed(2)} kΩ`;
                          else multimeterReadings[m.id] = `${(R/1000000).toFixed(2)} MΩ`;
                      }
                  }
              } else {
                  multimeterReadings[m.id] = 'OL';
              }
          } 
      } else if (mode === 'AAC') {
          if (isSimulating) {
              const v = getVoltageDiff(m, 'V', 'COM');
              const i = v / RES_CLOSED_SWITCH;
              if (i < 0.01) multimeterReadings[m.id] = '0.00 A';
              else multimeterReadings[m.id] = `${i.toFixed(2)} A`;
          } else multimeterReadings[m.id] = '---';
      }
  });

  return {
    energizedWires: Array.from(finalEnergizedWires),
    poweredComponents: Array.from(finalPoweredComponents),
    multimeterReadings,
    componentStates: virtualStates,
    heatUpdates: currentHeat,
    motorUpdates,
    wirePhases: finalWirePhases,
    meterUpdates
  };
};

function getComponentResistance(c: ComponentData): number {
    if (c.state.isBurnedOut) return RES_OPEN_SWITCH;

    switch(c.type) {
        case ComponentType.RHEOSTAT: 
            const max = c.properties?.maxResistance || 100;
            const setting = c.state.resistanceSetting !== undefined ? c.state.resistanceSetting : 50;
            return Math.max(0.1, (max * setting) / 100);
        case ComponentType.INCANDESCENT_BULB:
            const v = c.properties?.voltageRating || 220;
            const p = c.properties?.power || 60;
            return (v*v)/p;
        case ComponentType.SIGNAL_LAMP:
            return 8000; 
        case ComponentType.CONTACTOR:
            const coilV = c.properties?.coilVoltage === '380V' ? 380 : 220;
            // 220V coil: 6000 Ohm (~8W)
            // 380V coil: 18000 Ohm (~8W)
            return coilV === 380 ? 18000 : 6000;
        case ComponentType.BREAKER_3P:
        case ComponentType.SWITCH:
        case ComponentType.BUTTON_NO:
        case ComponentType.BUTTON_UNIVERSAL:
            return c.state.isOn ? RES_CLOSED_SWITCH : RES_OPEN_SWITCH;
        case ComponentType.BUTTON_NC:
            return c.state.isOn ? RES_OPEN_SWITCH : RES_CLOSED_SWITCH;
        case ComponentType.THERMAL_RELAY:
            return 0.05; 
        default: return 0.1;
    }
}

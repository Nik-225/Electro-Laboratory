
import React, { useRef, useEffect } from 'react';
import { ComponentData, Terminal, ComponentType } from '../types';
import { COMPONENT_TEMPLATES, RELAY_RANGES } from '../constants';
import { RotateCw, Lightbulb, Activity, Zap, Volume2, ToggleLeft, ToggleRight, MousePointerClick, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Circle, GripHorizontal, X } from 'lucide-react';

interface Props {
  data: ComponentData;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onToggleState: () => void;
  onUpdateProperty?: (id: string, key: string, value: any) => void;
  // New props for terminal interaction
  onTerminalPointerDown: (e: React.PointerEvent, compId: string, termId: string) => void;
  onTerminalPointerUp: (e: React.PointerEvent, compId: string, termId: string) => void;
}

export const ComponentNode: React.FC<Props> = ({
  data,
  isSelected,
  onPointerDown,
  onDoubleClick,
  onToggleState,
  onUpdateProperty,
  onTerminalPointerDown,
  onTerminalPointerUp
}) => {
  const template = COMPONENT_TEMPLATES[data.type];

  // --- MOTOR ANIMATION LOGIC (JS Physics based) ---
  const rotorRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const speedRef = useRef(0); // To bridge React state and Animation Frame
  const directionRef = useRef(1);

  // Sync refs with props (avoids restarting the animation loop)
  useEffect(() => {
      if (data.type === 'MOTOR_3PH') {
          speedRef.current = data.state.currentSpeed || 0;
          directionRef.current = data.state.direction || 1;
      }
  }, [data.state.currentSpeed, data.state.direction, data.type]);

  // The Animation Loop
  useEffect(() => {
      if (data.type !== 'MOTOR_3PH') return;

      let frameId: number;

      const animate = (time: number) => {
          if (lastTimeRef.current === 0) {
              lastTimeRef.current = time;
          }
          const delta = (time - lastTimeRef.current) / 1000; // Delta in seconds
          lastTimeRef.current = time;

          const rpm = speedRef.current;
          
          if (rpm > 1) { 
              // VISUAL SCALING: 
              // Real 1500 RPM = 25 Hz. On 60Hz screen -> aliasing (wagon wheel).
              // We scale visual speed by 0.3. 
              // 1500 Real -> 450 Visual (7.5 Hz). Very smooth, looks fast.
              const visualRpm = rpm * 0.3;
              
              const degChange = (visualRpm * 6) * delta * directionRef.current;
              
              angleRef.current = (angleRef.current + degChange) % 360;

              if (rotorRef.current) {
                  rotorRef.current.style.transform = `rotate(${angleRef.current}deg)`;
                  
                  // Motion Blur Simulation (Opacity Fade)
                  // At > 200 RPM, fade out distinct features
                  const blurOpacity = Math.max(0, 1 - (rpm / 500)); 
                  rotorRef.current.style.opacity = `${0.3 + (blurOpacity * 0.7)}`; // Never fully invisible
              }
          }

          frameId = requestAnimationFrame(animate);
      };

      frameId = requestAnimationFrame(animate);

      return () => {
          cancelAnimationFrame(frameId);
      };
  }, [data.type]); // Only restart if component type changes (unlikely)


  const handleWheel = (e: React.WheelEvent) => {
      if (!isSelected) return;
      if (data.type === 'MOTOR_3PH') {
          const currentLoad = data.properties?.loadFactor ?? 0;
          const delta = e.deltaY > 0 ? -0.05 : 0.05;
          const newLoad = Math.min(1.5, Math.max(0, currentLoad + delta));
          if (onUpdateProperty) onUpdateProperty(data.id, 'loadFactor', parseFloat(newLoad.toFixed(2)));
      } else if (data.type === 'RHEOSTAT') {
          const currentRes = data.state.resistanceSetting ?? 50;
          const delta = e.deltaY > 0 ? -5 : 5;
          const newRes = Math.min(100, Math.max(0, currentRes + delta));
          if (onUpdateProperty) onUpdateProperty(data.id, 'resistanceSetting', newRes);
      } else if (data.type === 'THERMAL_RELAY') {
          const rangeLabel = data.properties?.relayRange || RELAY_RANGES[0].label;
          const range = RELAY_RANGES.find(r => r.label === rangeLabel) || RELAY_RANGES[0];
          const currentSetting = data.properties?.relaySetting || range.default;
          
          // Determine step size roughly based on range spread
          const spread = range.max - range.min;
          const step = spread > 5 ? 0.5 : 0.1;
          
          const delta = e.deltaY > 0 ? -step : step;
          const newSetting = Math.min(range.max, Math.max(range.min, currentSetting + delta));
          if (onUpdateProperty) onUpdateProperty(data.id, 'relaySetting', parseFloat(newSetting.toFixed(2)));
      }
  };

  // Logic to get terminals (dynamic for Terminal Block and Source)
  const getTerminals = () => {
    if (data.type === 'TERMINAL_BLOCK') {
        const count = data.properties?.terminalCount || 4;
        const terms: Terminal[] = [];
        const centerX = template.width / 2; 
        for(let i=1; i<=count; i++) {
            terms.push({ id: `${i}`, label: `${i}`, type: 'power', x: centerX, y: (i * 20) + 20 });
        }
        return terms;
    }
    
    if (data.type === 'SOURCE_3PH') {
        const phases = data.properties?.phases || 3;
        const hasN = data.properties?.hasNeutral !== false;
        const pePos = data.properties?.groundPosition || 'right';
        const terms: Terminal[] = [];
        terms.push({ id: 'L1', label: 'L1', type: 'power', x: 20, y: 50 });
        if (phases >= 2) terms.push({ id: 'L2', label: 'L2', type: 'power', x: 50, y: 50 });
        if (phases >= 3) terms.push({ id: 'L3', label: 'L3', type: 'power', x: 80, y: 50 });
        if (hasN) {
            const lastPhaseX = phases === 1 ? 20 : phases === 2 ? 50 : 80;
            terms.push({ id: 'N', label: 'N', type: 'neutral', x: lastPhaseX + 30, y: 50 });
        }
        if (pePos === 'left') terms.push({ id: 'PE', label: 'PE', type: 'ground', x: 10, y: 30 });
        else terms.push({ id: 'PE', label: 'PE', type: 'ground', x: 130, y: 30 });
        return terms;
    }

    if (data.type === 'SELECTOR') {
        const mode = data.properties?.switchMode || '1-0-2';
        const terms: Terminal[] = [{ id: 'L', label: 'L', type: 'control', x: 45, y: 0, isInput: true }];
        if (mode === '1-2') {
            terms.push({ id: '1', label: '1', type: 'control', x: 20, y: 90 });
            terms.push({ id: '2', label: '2', type: 'control', x: 70, y: 90 });
        } else if (mode === '0-1-2' || mode === '1-0-2') {
            terms.push({ id: '1', label: '1', type: 'control', x: 20, y: 90 });
            terms.push({ id: '2', label: '2', type: 'control', x: 70, y: 90 });
        } else if (mode === '1-2-3' || mode === '0-1-2-3') {
            terms.push({ id: '1', label: '1', type: 'control', x: 20, y: 90 });
            terms.push({ id: '2', label: '2', type: 'control', x: 45, y: 90 });
            terms.push({ id: '3', label: '3', type: 'control', x: 70, y: 90 });
        }
        return terms;
    }

    if (data.type === 'ENERGY_METER') {
        const mType = data.properties?.meterType || '1ph';
        if (mType === '1ph') {
            return [
                { id: 'L_in', label: '1', type: 'power', x: 20, y: 120, isInput: true },
                { id: 'L_out', label: '2', type: 'power', x: 40, y: 120 },
                { id: 'N_in', label: '3', type: 'neutral', x: 60, y: 120, isInput: true },
                { id: 'N_out', label: '4', type: 'neutral', x: 80, y: 120 },
            ];
        } else {
            return [
                { id: '1', label: '1', type: 'power', x: 10, y: 120, isInput: true },
                { id: '2', label: '2', type: 'power', x: 20, y: 120 },
                { id: '3', label: '3', type: 'power', x: 35, y: 120, isInput: true },
                { id: '4', label: '4', type: 'power', x: 45, y: 120 },
                { id: '5', label: '5', type: 'power', x: 60, y: 120, isInput: true },
                { id: '6', label: '6', type: 'power', x: 70, y: 120 },
                { id: '7', label: '7', type: 'neutral', x: 85, y: 120, isInput: true },
                { id: '8', label: '8', type: 'neutral', x: 95, y: 120 },
            ];
        }
    }

    return template.terminals;
  };
  
  const terminals = getTerminals();
  const height = data.type === 'TERMINAL_BLOCK' ? (terminals.length * 20) + 40 : template.height;

  // Change Rheostat setting via slider
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onUpdateProperty) {
          onUpdateProperty(data.id, 'resistanceSetting', parseInt(e.target.value));
      }
  };

  // Specific visual styles
  const getComponentBody = () => {
    switch (data.type) {
      case 'SOURCE_3PH':
          return (
              <div className="flex flex-col items-center justify-center h-full bg-slate-100 relative">
                  <div className="text-xs font-bold text-slate-700">POWER</div>
                  <div className="text-[9px] text-slate-400 font-mono mt-1">380/220V</div>
              </div>
          )
      case 'MOTOR_3PH':
        const load = data.properties?.loadFactor ?? 0;
        const temp = data.state.temperature || 0;
        const rpm = data.state.currentSpeed !== undefined ? data.state.currentSpeed : (data.properties?.rpm || 1500);
        const isBurned = data.state.isBurnedOut;
        
        // Stator Colors (Status)
        let motorColorClass = 'border-gray-400 bg-gray-100';
        if (isBurned) {
            motorColorClass = 'border-gray-800 bg-gray-900';
        } else if (temp > 80) {
            motorColorClass = 'border-red-500 bg-red-300'; // High heat
        } else if (temp > 50) {
             motorColorClass = 'border-orange-400 bg-orange-200'; // Warm
        } else if (data.state.isPowered && rpm > 0) {
            motorColorClass = 'border-green-500 bg-green-100'; // Normal Running
        }

        const isMoving = rpm > 5;
        
        return (
          <div className="flex h-full w-full">
              <div className="flex flex-1 flex-col items-center justify-center relative pt-4">
                {/* Motor Housing (Stator) - Static */}
                <div 
                    className={`w-20 h-20 rounded-full border-4 relative flex items-center justify-center ${motorColorClass} transition-colors duration-300`}
                >
                  {/* The 'M' label is STATIC now */}
                  <div className={`text-2xl font-bold z-10 relative ${isBurned ? 'text-gray-500' : 'text-gray-700'}`}>M</div>
                  
                  {/* Burned Status Overlay */}
                  {isBurned && (
                       <div className="absolute w-full h-full flex items-center justify-center z-20">
                           <div className="text-[10px] font-bold text-red-500 bg-black/80 px-1 rounded border border-red-500 transform -rotate-12">BURNED</div>
                       </div>
                  )}

                  {/* Stall Status Overlay */}
                  {!isBurned && data.state.isPowered && rpm === 0 && (
                       <div className="absolute w-full h-full bg-red-500/20 rounded-full flex items-center justify-center z-20">
                           <div className="text-[8px] font-bold text-red-600 bg-white px-1 rounded">STALL</div>
                       </div>
                  )}

                  {/* Spinning Rotor Layer - Behind the M label but inside the housing */}
                  {!isBurned && (
                      <div 
                         ref={rotorRef} 
                         className="absolute inset-0 rounded-full w-full h-full pointer-events-none"
                         style={{ transformOrigin: 'center center' }}
                      >
                           {/* Distinct Markers (Cross) */}
                           <div className="absolute w-full h-full">
                                <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gray-400/50 -translate-x-1/2"></div>
                                <div className="absolute top-1/2 left-0 h-0.5 w-full bg-gray-400/50 -translate-y-1/2"></div>
                                {/* Diagonal */}
                                <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gray-400/30 -translate-x-1/2 rotate-45"></div>
                                <div className="absolute top-1/2 left-0 h-0.5 w-full bg-gray-400/30 -translate-y-1/2 rotate-45"></div>
                           </div>
                           
                           {/* Rotor Dot for orientation */}
                           <div className="absolute top-2 left-1/2 w-2 h-2 bg-gray-500 rounded-full -translate-x-1/2"></div>
                      </div>
                  )}
                </div>

                <div className="flex flex-col items-center mt-2">
                    <span className="text-[10px] font-mono text-gray-500">{data.properties?.power || 1.5} kW</span>
                    <span className="text-[9px] text-gray-400">
                        {isBurned ? 'FAIL' : `${data.state.direction === -1 ? 'REV' : 'FWD'} ${Math.round(rpm)}`}
                    </span>
                    {temp > 40 && !isBurned && <span className="text-[8px] font-bold text-orange-500 animate-pulse">{Math.round(temp)}°C</span>}
                </div>
              </div>
              <div className="w-8 h-full border-l border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-2" title="Load Factor">
                  <div className="text-[8px] font-bold text-gray-400 mb-1">Load</div>
                  <div className="h-full flex items-center">
                    <input 
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        className="h-20 w-1 accent-blue-600 -rotate-180" 
                        style={{ writingMode: 'vertical-lr', appearance: 'slider-vertical' } as unknown as React.CSSProperties}
                        value={load}
                        onChange={(e) => onUpdateProperty && onUpdateProperty(data.id, 'loadFactor', parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()} 
                        disabled={isBurned}
                    />
                  </div>
                  <div className="text-[8px] font-mono text-blue-600 mt-1">{load}x</div>
              </div>
          </div>
        );
      case 'RHEOSTAT':
          const rVal = (data.state.resistanceSetting) ?? 50; 
          return (
              <div className="flex flex-col items-center justify-center h-full bg-stone-100 relative">
                  <svg className="absolute w-full h-full opacity-20 pointer-events-none" viewBox="0 0 40 120">
                      <path d="M 20 0 L 20 10 L 5 20 L 35 30 L 5 40 L 35 50 L 5 60 L 35 70 L 5 80 L 35 90 L 5 100 L 20 110 L 20 120" fill="none" stroke="black" strokeWidth="2" />
                  </svg>
                  
                  <div className="h-[80%] flex items-center z-10">
                      <input 
                        type="range" 
                        min="0" max="100" 
                        className="h-24 w-2 accent-orange-600 -rotate-180"
                        style={{ writingMode: 'vertical-lr', appearance: 'slider-vertical' } as unknown as React.CSSProperties}
                        value={rVal}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={handleSliderChange}
                        title={`Resistance: ${rVal}%`}
                      />
                  </div>
                  <div className="text-[9px] font-mono font-bold text-orange-800">{rVal}%</div>
              </div>
          )
      case 'BREAKER_3P':
        return (
            <div className="flex flex-col items-center h-full pt-4 relative">
                <div className="w-14 h-20 bg-gray-100 border border-gray-300 rounded relative shadow-sm">
                    <div className="absolute top-0 w-px h-full left-[10px] bg-gray-300"></div>
                    <div className="absolute top-0 w-px h-full left-[28px] bg-gray-300"></div>
                    <div className="absolute top-0 w-px h-full left-[46px] bg-gray-300"></div>
                    
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full flex justify-center z-10">
                         <div 
                            className={`w-12 h-8 mt-6 rounded-sm border cursor-pointer transition-all shadow-md flex items-center justify-center ${data.state.isOn ? 'bg-green-600 -translate-y-2' : 'bg-gray-700 translate-y-2'}`}
                            onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                        >
                            <div className="w-8 h-1 bg-white/20"></div>
                        </div>
                    </div>
                </div>
                <div className="mt-2 flex flex-col items-center bg-gray-200 w-full py-1 border-t border-gray-300">
                    <span className="text-[8px] font-bold font-mono">
                        {data.properties?.breakerCurve || 'C'}{data.properties?.currentRating || 16}
                    </span>
                    <span className="text-[8px] text-gray-500">{data.state.isOn ? 'ON' : 'OFF'}</span>
                </div>
            </div>
        )
      case 'BUTTON_NO':
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <button 
                    className={`w-10 h-10 rounded-full border-4 transition-transform active:scale-95 ${data.state.isOn ? 'bg-green-600 border-green-800' : 'bg-green-500 border-green-700'}`}
                    onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                    onPointerUp={(e) => { e.stopPropagation(); onToggleState(); }}
                    onPointerLeave={(e) => { if(data.state.isOn) onToggleState(); }}
                >
                </button>
            </div>
        )
       case 'BUTTON_NC':
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <button 
                    className={`w-10 h-10 rounded-full border-4 transition-transform active:scale-95 ${data.state.isOn ? 'bg-red-600 border-red-800 shadow-inner' : 'bg-red-500 border-red-700'}`}
                    onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                    onPointerUp={(e) => { e.stopPropagation(); onToggleState(); }}
                    onPointerLeave={(e) => { if(data.state.isOn) onToggleState(); }}
                >
                    {!data.state.isOn && <div className="w-3 h-1 bg-white/50 mx-auto rounded-full"></div>}
                </button>
            </div>
        )
       case 'BUTTON_UNIVERSAL':
        const btnColor = data.properties?.color || 'black';
        const arrow = data.properties?.arrowDirection || 'none';
        
        let btnBg = 'bg-gray-800 border-black';
        let btnActive = 'bg-black border-black';
        
        if (btnColor === 'green') { btnBg = 'bg-green-500 border-green-700'; btnActive = 'bg-green-600 border-green-800'; }
        if (btnColor === 'red') { btnBg = 'bg-red-500 border-red-700'; btnActive = 'bg-red-600 border-red-800'; }
        if (btnColor === 'yellow') { btnBg = 'bg-yellow-400 border-yellow-600'; btnActive = 'bg-yellow-500 border-yellow-700'; }
        if (btnColor === 'blue') { btnBg = 'bg-blue-500 border-blue-700'; btnActive = 'bg-blue-600 border-blue-800'; }
        if (btnColor === 'white') { btnBg = 'bg-gray-200 border-gray-400'; btnActive = 'bg-gray-300 border-gray-500'; }

        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-100 border-x border-gray-300">
                <span className="text-[9px] text-gray-400 absolute top-1">Univ</span>
                <button 
                    className={`w-10 h-10 rounded-lg border-b-4 transition-all active:mt-1 active:border-b-0 active:translate-y-1 
                        ${data.state.isOn ? `${btnActive} translate-y-1 border-b-0` : btnBg}`}
                    onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                    onPointerUp={(e) => { e.stopPropagation(); onToggleState(); }}
                    onPointerLeave={(e) => { if(data.state.isOn) onToggleState(); }}
                >
                     <div className="w-6 h-6 mx-auto rounded-full border-2 border-white/30 flex items-center justify-center text-white/90">
                         {arrow === 'none' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                         {arrow === 'up' && <ArrowUp size={12} strokeWidth={3} />}
                         {arrow === 'down' && <ArrowDown size={12} strokeWidth={3} />}
                         {arrow === 'left' && <ArrowLeft size={12} strokeWidth={3} />}
                         {arrow === 'right' && <ArrowRight size={12} strokeWidth={3} />}
                     </div>
                </button>
                <div className="flex gap-2 text-[8px] mt-2 font-mono">
                    <span className={!data.state.isOn ? "text-green-600 font-bold" : "text-gray-300"}>NC</span>
                    <span className="text-gray-300">|</span>
                    <span className={data.state.isOn ? "text-green-600 font-bold" : "text-gray-300"}>NO</span>
                </div>
            </div>
        )
       case 'SWITCH':
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div 
                    className={`w-10 h-14 bg-gray-200 border border-gray-400 rounded relative cursor-pointer`}
                    onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                >
                    <div className={`absolute left-1/2 -translate-x-1/2 w-6 h-7 bg-black/80 rounded transition-all duration-200 ${data.state.isOn ? 'top-1' : 'bottom-1'}`}></div>
                </div>
                <span className="text-[9px] mt-1">{data.state.isOn ? 'ON' : 'OFF'}</span>
            </div>
        )
       case 'SELECTOR':
           const pos = data.state.selectorPosition ?? 0; 
           const sMode = data.properties?.switchMode || '1-0-2';
           
           let deg = 0;
           if (sMode === '1-2') {
               deg = pos === 0 ? -150 : 150; 
           } else if (sMode === '0-1-2' || sMode === '1-0-2') {
               if (pos === 0) deg = 0;
               else if (pos === 1) deg = -150;
               else if (pos === 2) deg = 150;
           } else if (sMode === '1-2-3') {
                if (pos === 0) deg = -150;
                if (pos === 1) deg = 180;
                if (pos === 2) deg = 150;
           } else if (sMode === '0-1-2-3') {
                if (pos === 0) deg = 0;
                if (pos === 1) deg = -150;
                if (pos === 2) deg = 180;
                if (pos === 3) deg = 150;
           }

           return (
            <div className="flex flex-col items-center justify-center h-full pb-6">
                 <div className="w-16 h-16 rounded-full border-2 border-gray-400 flex items-center justify-center bg-gray-100 relative shadow-inner">
                     <div 
                        className="w-12 h-12 rounded-full bg-black flex items-center justify-center cursor-pointer transition-transform duration-200 shadow-md z-10"
                        style={{ transform: `rotate(${deg}deg)`}}
                        onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                     >
                         <div className="w-1 h-6 bg-white mb-4 rounded-full"></div>
                         <div className="absolute top-1 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-white"></div>
                     </div>
                 </div>
                 <div className="flex justify-between w-full px-2 text-[9px] font-bold mt-1 text-gray-500 absolute bottom-1">
                     <span>{sMode}</span>
                 </div>
            </div>
           )
      case 'THERMAL_RELAY':
        const rangeLabel = data.properties?.relayRange || RELAY_RANGES[0].label;
        const range = RELAY_RANGES.find(r => r.label === rangeLabel) || RELAY_RANGES[0];
        const setting = data.properties?.relaySetting || range.default;

        return (
            <div className="flex flex-col items-center justify-center h-full relative">
                {/* Range Slider - Moved up and increased height to fix spacing */}
                <div className="mb-2 w-16 h-10 border border-gray-300 rounded bg-gray-100 flex flex-col items-center justify-center relative z-10">
                    <span className="text-[7px] text-gray-400 absolute top-1">SET (A)</span>
                    <input 
                        type="range"
                        min={range.min}
                        max={range.max}
                        step={0.05}
                        className="w-14 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-2"
                        value={setting}
                        onChange={(e) => onUpdateProperty && onUpdateProperty(data.id, 'relaySetting', parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()} 
                    />
                    <div className="text-[9px] font-mono font-bold text-blue-800 mt-1">{setting.toFixed(2)}</div>
                </div>

                {/* Test/Reset Button */}
                <button 
                     className={`cursor-pointer px-2 py-1 rounded text-[9px] border font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95 z-10 ${data.state.isOn ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-red-100 border-red-500 text-red-700'}`}
                     onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                     title={data.state.isOn ? "Test Trip" : "Reset"}
                >
                     {data.state.isOn ? 'TEST' : <RotateCw size={10} />}
                </button>
                
                <div className="text-[9px] text-gray-400 mt-1">{data.state.isOn ? 'NORMAL' : 'TRIPPED'}</div>
            </div>
        );
      case 'CONTACTOR':
          const isCoilBurned = data.state.isBurnedOut;
          return (
             <div className="flex flex-col items-center justify-center h-full pt-6 relative">
                <div className="absolute top-2 w-px h-[90%] left-5 border-l border-dashed border-gray-300"></div>
                <div className="absolute top-2 w-px h-[90%] left-[50px] border-l border-dashed border-gray-300"></div>
                <div className="absolute top-2 w-px h-[90%] left-[80px] border-l border-dashed border-gray-300"></div>

                <div className={`relative z-10 w-20 h-16 border rounded flex items-center justify-center transition-colors ${data.state.isOn ? 'bg-blue-600 border-blue-800 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-gray-200 border-gray-400'}`}>
                    <div className="w-12 h-10 bg-black/20 rounded flex items-center justify-center overflow-hidden">
                        {isCoilBurned && <div className="absolute inset-0 z-20 flex items-center justify-center text-red-500 font-bold bg-black/50">X</div>}
                        <div className={`w-8 h-6 bg-white rounded-sm transition-all duration-150 ${data.state.isOn ? 'scale-90 bg-blue-100 translate-y-1' : '-translate-y-1'}`}>
                             {data.state.isOn && <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-blue-800">I</div>}
                             {!data.state.isOn && <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-gray-400">0</div>}
                        </div>
                    </div>
                </div>
                <div className="mt-2 text-[9px] font-mono bg-white/80 px-1 rounded border border-gray-300">
                    {data.properties?.coilVoltage || '220V'}
                </div>
             </div>
          )
      case 'INCANDESCENT_BULB': {
          const isPowered = data.state.isPowered;
          const isBurnedOut = data.state.isBurnedOut;
          const brightness = data.state.brightness ?? 1;
          
          const powerScale = Math.min(1.5, Math.max(0.6, (data.properties?.power || 60) / 60));
          
          // Physics-based color shift for incandescent bulb
          let bulbColorClass = 'text-yellow-200 fill-yellow-200';
          let glowColor = 'rgba(255, 230, 0, 0.8)';
          
          if (isPowered && !isBurnedOut) {
               if (brightness < 0.4) {
                   bulbColorClass = 'text-red-500 fill-red-600';
                   glowColor = 'rgba(255, 0, 0, 0.6)';
               }
               else if (brightness < 0.7) {
                   bulbColorClass = 'text-orange-400 fill-orange-400';
                   glowColor = 'rgba(255, 165, 0, 0.7)';
               }
          }
          
          return (
              <div className="flex flex-col items-center justify-center h-full relative">
                  <Lightbulb 
                      size={48} 
                      className={`transition-all duration-300 ${isBurnedOut ? 'text-gray-800' : (isPowered ? bulbColorClass : 'text-gray-400')}`}
                      style={{ 
                          filter: isPowered && !isBurnedOut ? `drop-shadow(0 0 ${15 * powerScale * brightness}px ${glowColor})` : 'none',
                          opacity: isBurnedOut ? 0.5 : (isPowered ? Math.max(0.2, brightness) : 1)
                      }}
                  />
                  {isBurnedOut && <X className="absolute text-red-600 w-full h-full p-2" />}
                  <div className="text-[9px] mt-1 font-mono text-gray-500">{data.properties?.power}W</div>
              </div>
          )
      }
      case 'SIGNAL_LAMP': {
          const color = data.properties?.color || 'green';
          const isPowered = data.state.isPowered;
          const isBurnedOut = data.state.isBurnedOut;
          // Apply brightness logic for Signal Lamp too (dimming effect)
          const brightness = data.state.brightness ?? (isPowered ? 1 : 0);
          
          const colorMap: any = {
              green: 'bg-green-500 shadow-green-500',
              red: 'bg-red-500 shadow-red-500',
              yellow: 'bg-yellow-400 shadow-yellow-400',
              blue: 'bg-blue-500 shadow-blue-500',
              white: 'bg-white shadow-white',
              orange: 'bg-orange-500 shadow-orange-500',
              purple: 'bg-purple-500 shadow-purple-500',
          };

          const baseColor = colorMap[color] || colorMap['green'];
          const offColor = isBurnedOut ? 'bg-gray-900 border-gray-700' : 'bg-gray-800 border-gray-600';
          
          return (
              <div className="flex flex-col items-center justify-center h-full">
                  <div 
                    className={`w-12 h-12 rounded-full border-4 border-gray-400 flex items-center justify-center overflow-hidden relative shadow-inner transition-all duration-150
                        ${isPowered && !isBurnedOut ? baseColor.split(' ')[0] : offColor}`}
                    style={{
                         boxShadow: isPowered && !isBurnedOut ? `0 0 ${20 * brightness}px ${color}` : 'inset 0 2px 4px rgba(0,0,0,0.5)',
                         opacity: isPowered ? Math.max(0.4, brightness) : 1
                    }}
                  >
                      <div className="absolute top-1 left-2 w-4 h-2 bg-white/40 rounded-full blur-[1px]"></div>
                      {isBurnedOut && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-gray-500 font-bold">X</div>}
                  </div>
                  <div className="text-[9px] mt-1 text-gray-400">{isPowered ? 'ON' : 'OFF'}</div>
              </div>
          )
      }
      case 'TERMINAL_BLOCK':
           return (
               <div className="h-full w-full bg-gray-200 border-x border-gray-400 relative flex flex-col">
                    <div className="w-full h-5 bg-gray-300 border-b border-gray-400 flex items-center justify-center shrink-0" title="Terminal Block">
                        <GripHorizontal size={12} className="text-gray-500" />
                    </div>
                    <div className="flex-1 relative w-full">
                        {terminals.map(t => (
                            <div key={t.id} className="absolute w-full h-px bg-gray-400" style={{top: t.y - 20}}></div>
                        ))}
                    </div>
               </div>
           )
      case 'MULTIMETER':
          const mode = data.state.multimeterMode || 'OFF';
          let rotation = 0;
          if (mode === 'VAC') rotation = 45;
          if (mode === 'VDC') rotation = 90;
          if (mode === 'OHM') rotation = 135;
          if (mode === 'AAC') rotation = -45;

          const reading = data.state.voltageReading || '---';
          
          return (
              <div className="flex flex-col items-center h-full bg-slate-800 text-white rounded-lg shadow-xl overflow-hidden">
                  {/* Screen Area */}
                  <div className="w-full h-1/3 bg-slate-900 p-2 flex items-center justify-center relative">
                       <div className="w-full h-full bg-[#9ea792] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] rounded-sm flex items-center px-1 relative overflow-hidden">
                           
                           {/* Mode Indicators (Left Side Column) */}
                           <div className="flex flex-col justify-center h-full border-r border-black/10 pr-1 mr-1">
                               <div className="h-2 flex items-center">{mode === 'VAC' && <span className="text-[6px] font-bold text-black leading-none">AC</span>}</div>
                               <div className="h-2 flex items-center">{mode === 'VDC' && <span className="text-[6px] font-bold text-black leading-none">DC</span>}</div>
                               <div className="h-2 flex items-center">{mode === 'OHM' && <span className="text-[6px] font-bold text-black leading-none">Ω</span>}</div>
                               <div className="h-2 flex items-center">{mode === 'AAC' && <span className="text-[6px] font-bold text-black leading-none">A</span>}</div>
                               <div className="h-2 flex items-center">{mode !== 'OFF' && reading === '---' && <span className="text-[6px] font-bold text-black leading-none">H</span>}</div>
                           </div>

                           {/* Main Digital Reading (Right Aligned) */}
                           <div className="flex-1 flex items-center justify-end overflow-hidden">
                                <span className={`font-mono text-black font-bold tracking-widest whitespace-nowrap ${reading.length > 6 ? 'text-lg' : 'text-xl'}`}>
                                    {mode === 'OFF' ? '' : reading}
                                </span>
                           </div>
                       </div>
                  </div>
                  
                  {/* Knob Area */}
                  <div className="flex-1 w-full relative flex items-center justify-center bg-slate-800">
                      <span className="absolute top-2 text-[8px] font-bold text-gray-500">OFF</span>
                      <span className="absolute top-4 right-4 text-[8px] font-bold text-yellow-500 flex flex-col items-center">V<span className="text-[6px]">~</span></span>
                      <span className="absolute right-2 top-10 text-[8px] font-bold text-white flex flex-col items-center">V<span className="text-[6px]">_</span></span>
                      <span className="absolute bottom-4 right-6 text-[8px] font-bold text-green-500">Ω</span>
                      <span className="absolute top-4 left-4 text-[8px] font-bold text-red-500 flex flex-col items-center">A<span className="text-[6px]">~</span></span>

                      <div 
                        className="w-16 h-16 rounded-full bg-slate-700 border-4 border-slate-600 shadow-lg flex items-center justify-center cursor-pointer transition-transform duration-300 z-10"
                        style={{ transform: `rotate(${rotation}deg)` }}
                        onPointerDown={(e) => { e.stopPropagation(); onToggleState(); }}
                      >
                           <div className="w-1 h-6 bg-orange-500 absolute -top-1 rounded-full"></div>
                      </div>
                  </div>
              </div>
          )
      case 'ENERGY_METER': {
          // Calculate blink rate based on power. 
          // Max power approx 22kW (3 phases * 220V * 32A).
          // Let's say max flash rate is 50ms interval.
          // Power comes in Watts.
          const power = data.state.instantaneousPower || 0;
          const isPowered = power > 10; // Threshold to start blinking
          const blinkSpeed = Math.max(50, 2000 - (power / 10)); // Simple linear scaling for viz
          const kwh = (data.state.totalEnergy || 0).toFixed(1).padStart(7, '0');

          return (
              <div className="flex flex-col items-center h-full bg-gray-100 relative rounded-sm border border-gray-300 shadow-sm">
                  <div className="w-full h-1/2 bg-white border-b border-gray-300 p-2 flex flex-col justify-center items-center">
                      <div className="w-full bg-[#f0f4e0] border border-gray-400 font-mono text-lg px-2 py-1 text-right mb-1 tracking-widest">
                          {kwh}
                      </div>
                      <div className="w-full flex items-center justify-between text-[8px] text-gray-500 px-1">
                          <span>kWh</span>
                          <div 
                            className={`w-3 h-3 rounded-full border border-red-800 ${isPowered ? 'bg-red-600 animate-pulse' : 'bg-red-900'}`}
                            style={{ animationDuration: isPowered ? `${blinkSpeed}ms` : '0ms' }}
                          ></div>
                      </div>
                  </div>
                  <div className="flex-1 w-full flex items-center justify-center bg-gray-800 text-gray-400 text-[10px] flex-col">
                      <span className="font-bold text-white">{data.properties?.meterType === '3ph' ? '3-PHASE' : '1-PHASE'}</span>
                      <span className="text-[8px] opacity-60">{(power / 1000).toFixed(2)} kW</span>
                  </div>
              </div>
          )
      }
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="mt-2 text-xs opacity-50">{template.name}</div>
          </div>
        );
    }
  };

  return (
    <div
      className={`absolute select-none group transition-all duration-100 ${
        isSelected ? 'z-50' : 'z-20'
      }`}
      style={{
        left: data.x,
        top: data.y,
        width: template.width,
        height: height,
        transform: `rotate(${data.rotation}deg)`,
        touchAction: 'none' // Crucial for mobile dragging
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onWheel={handleWheel}
    >
        {/* Label moved OUTSIDE the visual container to prevent overlapping */}
        {data.type !== 'TERMINAL_BLOCK' && data.type !== 'SOURCE_3PH' && (
            <div className="absolute -top-5 left-0 w-full text-center text-[10px] font-bold text-slate-500 pointer-events-none whitespace-nowrap z-[60]">
                {data.label}
            </div>
        )}

        {/* Updated Selection Halo & Component Container Style to stand out */}
        <div className={`absolute -inset-2 rounded-xl border-2 pointer-events-none transition-all duration-200 ${isSelected ? 'border-blue-500 opacity-100 scale-105' : 'border-transparent opacity-0 group-hover:border-blue-300 group-hover:opacity-50'}`}></div>

        {/* Main Body container with styling - Enhanced shadow and contrast */}
        <div className="w-full h-full bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-200/50 rounded-lg overflow-hidden relative backdrop-blur-sm">
            {/* Component Body */}
            {getComponentBody()}
        </div>

      {/* Terminals - High Z-index to overlay everything */}
      {terminals.map((term) => (
        <div
          key={term.id}
          className={`group/term absolute w-7 h-7 rounded-full z-[1000] flex items-center justify-center cursor-crosshair`}
          style={{
            left: term.x - 14, 
            top: term.y - 14,
          }}
          onPointerDown={(e) => {
              // CRITICAL FIX: Stop propagation so component doesn't get selected
              e.stopPropagation(); 
              e.preventDefault();
              // Trigger parent logic for wiring start
              onTerminalPointerDown(e, data.id, term.id);
          }}
          onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // Trigger parent logic for wiring end
              onTerminalPointerUp(e, data.id, term.id);
          }}
        >
             {/* Visual Label for Contact Number/Type */}
             <span className="absolute -top-4 text-[8px] font-bold text-gray-500 pointer-events-none bg-white/80 px-0.5 rounded shadow-sm opacity-0 group-hover/term:opacity-100 transition-opacity whitespace-nowrap z-[1001]">
                 {term.label}
                 {term.type === 'control' && ((term.id === '13' || term.id === '14' || term.id === '97' || term.id === '98') ? ' (NO)' : (term.id === '11' || term.id === '12' || term.id === '95' || term.id === '96' || term.id === '15' || term.id === '16') ? ' (NC)' : '')}
             </span>

             {/* Visual Dot - Stronger stroke for visibility on dark backgrounds */}
             <div className={`w-3 h-3 rounded-full border-2 border-gray-700 shadow-sm transition-transform bg-white ${
                isSelected ? 'ring-2 ring-blue-500' : ''
             } ${
                term.type === 'power' ? 'bg-white' : term.type === 'control' ? 'bg-yellow-200' : term.type === 'ground' ? 'bg-green-200' : 'bg-blue-200'
             } hover:scale-150 hover:border-blue-500`}></div>
        </div>
      ))}
    </div>
  );
};

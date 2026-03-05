
import { ComponentData, ComponentType, Wire } from '../types';
import { runSimulation } from './circuitLogic';
import { COMPONENT_TEMPLATES } from '../constants';

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

// Helper to create mock components easily
const createComp = (type: ComponentType, id: string, x=0, y=0, props={}): ComponentData => ({
    id,
    type,
    x,
    y,
    rotation: 0,
    label: id,
    properties: { ...props },
    state: { 
        isOn: false, 
        isPowered: false, 
        accumulatedHeat: 0, 
        temperature: 0, 
        isBurnedOut: false,
        selectorPosition: 0 
    }
});

// Helper to create mock wires
const createWire = (id: string, start: string, startT: string, end: string, endT: string): Wire => ({
    id,
    startCompId: start,
    startTermId: startT,
    endCompId: end,
    endTermId: endT,
    color: '#000',
    isEnergized: false
});

export const runDiagnostics = (): TestResult[] => {
    const results: TestResult[] = [];
    
    // --- TEST 1: Basic Source Connectivity ---
    try {
        const source = createComp(ComponentType.SOURCE_3PH, 'src');
        const wire = createWire('w1', 'src', 'L1', 'src', 'N'); // Loop just to test processing
        const comps = [source];
        const wires = [wire];
        
        const sim = runSimulation(comps, wires, true);
        
        if (sim.poweredComponents.includes('src')) {
            results.push({ name: 'Джерело живлення', passed: true, message: 'Джерело коректно ініціалізує фази' });
        } else {
            results.push({ name: 'Джерело живлення', passed: false, message: 'Джерело не активне' });
        }
    } catch (e: any) {
        results.push({ name: 'Джерело живлення', passed: false, message: `Помилка виконання: ${e.message}` });
    }

    // --- TEST 2: Short Circuit Protection (Breaker) ---
    try {
        // Setup: Source -> Breaker -> Short (L1 to L2)
        const src = createComp(ComponentType.SOURCE_3PH, 'src');
        const qf = createComp(ComponentType.BREAKER_3P, 'qf');
        qf.state.isOn = true; // Turn breaker ON manually

        // Wires Source -> Breaker
        const w1 = createWire('w1', 'src', 'L1', 'qf', '1');
        const w2 = createWire('w2', 'src', 'L2', 'qf', '3');
        
        // Short Circuit Wires after breaker (Terminals 2 and 4)
        const wShort = createWire('wShort', 'qf', '2', 'qf', '4');

        const sim = runSimulation([src, qf], [w1, w2, wShort], true);

        // Logic check: Breaker should turn OFF (trip)
        if (sim.componentStates['qf'] === false && sim.heatUpdates['qf'] >= 100) {
            results.push({ name: 'Захист від КЗ', passed: true, message: 'Автомат вимкнувся при КЗ' });
        } else {
            results.push({ name: 'Захист від КЗ', passed: false, message: 'Автомат не зреагував на коротке замикання' });
        }
    } catch (e: any) {
        results.push({ name: 'Захист від КЗ', passed: false, message: `Помилка: ${e.message}` });
    }

    // --- TEST 3: Motor Powering (Direct Online) ---
    try {
        // Source -> Contactor -> Motor
        const src = createComp(ComponentType.SOURCE_3PH, 'src');
        const km = createComp(ComponentType.CONTACTOR, 'km');
        const m = createComp(ComponentType.MOTOR_3PH, 'm');
        
        km.state.isOn = true; // Force contactor closed

        const wires = [
            // Src -> KM
            createWire('w1', 'src', 'L1', 'km', '1'),
            createWire('w2', 'src', 'L2', 'km', '3'),
            createWire('w3', 'src', 'L3', 'km', '5'),
            // KM -> Motor
            createWire('w4', 'km', '2', 'm', 'U1'),
            createWire('w5', 'km', '4', 'm', 'V1'),
            createWire('w6', 'km', '6', 'm', 'W1'),
        ];

        const sim = runSimulation([src, km, m], wires, true);

        const motorUpd = sim.motorUpdates['m'];
        if (motorUpd && motorUpd.speed > 0 && sim.poweredComponents.includes('m')) {
            results.push({ name: 'Робота двигуна', passed: true, message: `Двигун обертається (Швидкість: ${motorUpd.speed})` });
        } else {
            results.push({ name: 'Робота двигуна', passed: false, message: 'Двигун не отримує живлення через контактор' });
        }
    } catch (e: any) {
        results.push({ name: 'Робота двигуна', passed: false, message: `Помилка: ${e.message}` });
    }

    // --- TEST 4: Control Circuit (Button Logic) ---
    try {
        // Source L1 -> Stop(NC) -> Start(NO) -> Coil A1 ... Coil A2 -> N
        // We simulate pressing Start
        const src = createComp(ComponentType.SOURCE_3PH, 'src');
        const sbStop = createComp(ComponentType.BUTTON_NC, 'stop'); // Closed by default
        const sbStart = createComp(ComponentType.BUTTON_NO, 'start');
        const km = createComp(ComponentType.CONTACTOR, 'km', 0, 0, { coilVoltage: '220V' });

        // Initial States
        sbStop.state.isOn = false; // Normal state for NC is "not pressed" (conducting)
        sbStart.state.isOn = true; // PRESSED
        km.state.isOn = false;

        const wires = [
            createWire('w1', 'src', 'L1', 'stop', '11'),
            createWire('w2', 'stop', '12', 'start', '13'),
            createWire('w3', 'start', '14', 'km', 'A1'),
            createWire('w4', 'km', 'A2', 'src', 'N'),
        ];

        // We run loop to check if Coil gets logic voltage
        // Note: runSimulation returns 'componentStates' which includes coil logic reaction
        const sim = runSimulation([src, sbStop, sbStart, km], wires, true);
        
        // Contactor logic: if voltage at A1-A2, next state should be TRUE
        // But runSimulation returns the State for the NEXT tick inside componentStates if it changed
        // Or we can check if contactorUpdate logic ran. 
        // Let's check if our logic detected the voltage internally. 
        // Since we can't inspect internal vars, we check if logic requested a state change.
        
        // In our engine, coil logic runs inside. If it decides to turn on, it updates virtualStates.
        // However, we passed km.state.isOn = false. If voltage is present, sim.componentStates['km'] should become true.
        
        if (sim.componentStates['km'] === true) {
            results.push({ name: 'Ланцюг керування', passed: true, message: 'Котушка контактора отримала сигнал на включення' });
        } else {
            results.push({ name: 'Ланцюг керування', passed: false, message: 'Сигнал не пройшов через кнопки до котушки' });
        }

    } catch (e: any) {
        results.push({ name: 'Ланцюг керування', passed: false, message: `Помилка: ${e.message}` });
    }

    // --- TEST 5: Multimeter Ohm ---
    try {
        const mult = createComp(ComponentType.MULTIMETER, 'multi');
        mult.state.multimeterMode = 'OHM';
        
        const r = createComp(ComponentType.INCANDESCENT_BULB, 'bulb'); // Use Bulb as resistance
        
        const wires = [
            createWire('w1', 'multi', 'V', 'bulb', 'X1'),
            createWire('w2', 'multi', 'COM', 'bulb', 'X2'),
        ];
        
        const sim = runSimulation([mult, r], wires, true);
        const read = sim.multimeterReadings['multi'];
        
        if (read && read.includes('Ω') && !read.includes('OL')) {
             results.push({ name: 'Мультиметр (Омметр)', passed: true, message: `Виміряно опір: ${read}` });
        } else {
             results.push({ name: 'Мультиметр (Омметр)', passed: false, message: `Некоректний вимір опору: ${read}` });
        }
    } catch (e: any) {
         results.push({ name: 'Мультиметр (Омметр)', passed: false, message: `Помилка: ${e.message}` });
    }

    return results;
};


export enum ComponentType {
  SOURCE_3PH = 'SOURCE_3PH',
  BREAKER_3P = 'BREAKER_3P',
  CONTACTOR = 'CONTACTOR',
  THERMAL_RELAY = 'THERMAL_RELAY',
  BUTTON_NO = 'BUTTON_NO',
  BUTTON_NC = 'BUTTON_NC',
  BUTTON_UNIVERSAL = 'BUTTON_UNIVERSAL',
  SWITCH = 'SWITCH',
  SELECTOR = 'SELECTOR',
  MOTOR_3PH = 'MOTOR_3PH',
  SIGNAL_LAMP = 'SIGNAL_LAMP',
  INCANDESCENT_BULB = 'INCANDESCENT_BULB',
  TERMINAL_BLOCK = 'TERMINAL_BLOCK',
  MULTIMETER = 'MULTIMETER',
  RHEOSTAT = 'RHEOSTAT',
  ENERGY_METER = 'ENERGY_METER'
}

export interface Terminal {
  id: string; // unique ID relative to component
  label: string;
  type: 'power' | 'control' | 'ground' | 'neutral';
  x: number;
  y: number;
  isInput?: boolean;
}

export type SwitchMode = '1-2' | '0-1-2' | '1-0-2' | '1-2-3' | '0-1-2-3';

export interface ComponentProperties {
  coilVoltage?: '220V' | '380V';
  color?: 'red' | 'green' | 'yellow' | 'black' | 'blue' | 'white' | 'orange' | 'purple'; 
  arrowDirection?: 'none' | 'up' | 'down' | 'left' | 'right';
  terminalCount?: number;
  currentRating?: number; // Amps for breaker
  breakerCurve?: 'A' | 'B' | 'C' | 'D'; // Tripping curve
  relayRange?: string; // e.g. "4-6 A"
  relaySetting?: number; // Actual set point value
  power?: number; // kW for motor, Watts for Lamp
  rpm?: number; // RPM for motor
  loadFactor?: number; // 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5
  
  // New Properties
  switchMode?: SwitchMode;
  voltageRating?: number; // Volts for lamp/coil
  
  // Source Properties
  phases?: 1 | 2 | 3;
  hasNeutral?: boolean;
  groundPosition?: 'left' | 'right';

  // Rheostat
  maxResistance?: number;

  // Meter
  meterType?: '1ph' | '3ph';
}

export type MultimeterMode = 'OFF' | 'VAC' | 'VDC' | 'OHM' | 'AAC';

export interface ComponentData {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: number;
  label: string;
  properties?: ComponentProperties;
  state: {
    isOn: boolean; // Mechanical state (contact position)
    isTransient?: boolean; 
    selectorPosition?: number; // Changed to number to support 0-3
    isPowered: boolean; // Visual feedback
    direction?: 1 | -1; 
    currentSpeed?: number; 
    voltageReading?: string; 
    multimeterMode?: MultimeterMode; 
    accumulatedHeat?: number; 
    temperature?: number; 
    isBurnedOut?: boolean;
    brightness?: number; // 0 to 1 for Lamps
    resistanceSetting?: number; // 0-100 for Rheostat
    
    // Energy Meter State
    totalEnergy?: number; // kWh
    instantaneousPower?: number; // Watts
  };
}

export interface Wire {
  id: string;
  startCompId: string;
  startTermId: string;
  endCompId: string;
  endTermId: string;
  color: string;
  isEnergized: boolean; // Visual feedback only
}

export interface ComponentTemplate {
  type: ComponentType;
  name: string;
  width: number;
  height: number;
  terminals: Terminal[]; 
  resizable?: boolean;
}

// Simulation Types
export type Phase = 'L1' | 'L2' | 'L3' | 'N' | 'PE';

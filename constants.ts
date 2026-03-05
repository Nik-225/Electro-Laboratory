
import { ComponentType, ComponentTemplate } from './types';

// Updated based on PT Series Datasheet (PT-03xx, PT-13xx, PT-23xx, PT-33xx)
export const RELAY_RANGES = [
    { label: '0.1-0.16 A', min: 0.1, max: 0.16, default: 0.13 },   // PT-x301
    { label: '0.16-0.25 A', min: 0.16, max: 0.25, default: 0.2 }, // PT-x302
    { label: '0.25-0.4 A', min: 0.25, max: 0.4, default: 0.32 },  // PT-x303
    { label: '0.4-0.63 A', min: 0.4, max: 0.63, default: 0.5 },   // PT-x304
    { label: '0.63-1 A', min: 0.63, max: 1, default: 0.8 },       // PT-x305
    { label: '1-1.6 A', min: 1, max: 1.6, default: 1.3 },         // PT-x306
    { label: '1.6-2.5 A', min: 1.6, max: 2.5, default: 2.0 },     // PT-x307
    { label: '2.5-4 A', min: 2.5, max: 4, default: 3.2 },         // PT-x308
    { label: '4-6 A', min: 4, max: 6, default: 5.0 },             // PT-x310
    { label: '5.5-8 A', min: 5.5, max: 8, default: 6.8 },         // PT-x312
    { label: '7-10 A', min: 7, max: 10, default: 8.5 },           // PT-x314
    { label: '9-13 A', min: 9, max: 13, default: 11.0 },          // PT-x316
    { label: '12-18 A', min: 12, max: 18, default: 15.0 },        // PT-1321
    { label: '17-25 A', min: 17, max: 25, default: 21.0 },        // PT-1322
    { label: '23-32 A', min: 23, max: 32, default: 28.0 },        // PT-2353, PT-3353
    { label: '28-36 A', min: 28, max: 36, default: 32.0 },        // PT-2355
    { label: '30-40 A', min: 30, max: 40, default: 35.0 },        // PT-3355
    { label: '37-50 A', min: 37, max: 50, default: 44.0 },        // PT-3357
    { label: '48-65 A', min: 48, max: 65, default: 57.0 },        // PT-3359
    { label: '55-70 A', min: 55, max: 70, default: 63.0 },        // PT-3361
    { label: '63-80 A', min: 63, max: 80, default: 72.0 },        // PT-3363
    { label: '80-95 A', min: 80, max: 95, default: 88.0 },        // PT-3365
];

export const COMPONENT_TEMPLATES: Record<ComponentType, ComponentTemplate> = {
  [ComponentType.SOURCE_3PH]: {
    type: ComponentType.SOURCE_3PH,
    name: 'Джерело',
    width: 140,
    height: 60,
    terminals: [
      { id: 'L1', label: 'L1', type: 'power', x: 20, y: 50 },
      { id: 'L2', label: 'L2', type: 'power', x: 50, y: 50 },
      { id: 'L3', label: 'L3', type: 'power', x: 80, y: 50 },
      { id: 'N', label: 'N', type: 'neutral', x: 110, y: 50 },
      { id: 'PE', label: 'PE', type: 'ground', x: 130, y: 30 },
    ],
  },
  [ComponentType.BREAKER_3P]: {
    type: ComponentType.BREAKER_3P,
    name: 'Автомат QF',
    width: 80, 
    height: 100,
    terminals: [
      { id: '1', label: '1', type: 'power', x: 10, y: 0, isInput: true },
      { id: '3', label: '3', type: 'power', x: 40, y: 0, isInput: true },
      { id: '5', label: '5', type: 'power', x: 70, y: 0, isInput: true },
      { id: '2', label: '2', type: 'power', x: 10, y: 100 },
      { id: '4', label: '4', type: 'power', x: 40, y: 100 },
      { id: '6', label: '6', type: 'power', x: 70, y: 100 },
    ],
  },
  [ComponentType.CONTACTOR]: {
    type: ComponentType.CONTACTOR,
    name: 'Контактор KM',
    width: 100,
    height: 140,
    terminals: [
      { id: '1', label: '1', type: 'power', x: 20, y: 0, isInput: true },
      { id: '3', label: '3', type: 'power', x: 50, y: 0, isInput: true },
      { id: '5', label: '5', type: 'power', x: 80, y: 0, isInput: true },
      { id: '2', label: '2', type: 'power', x: 20, y: 140 },
      { id: '4', label: '4', type: 'power', x: 50, y: 140 },
      { id: '6', label: '6', type: 'power', x: 80, y: 140 },
      { id: 'A1', label: 'A1', type: 'control', x: 0, y: 40, isInput: true },
      { id: 'A2', label: 'A2', type: 'control', x: 0, y: 80 },
      { id: '13', label: '13', type: 'control', x: 100, y: 20, isInput: true },
      { id: '14', label: '14', type: 'control', x: 100, y: 50 },
      { id: '15', label: '15', type: 'control', x: 100, y: 90, isInput: true },
      { id: '16', label: '16', type: 'control', x: 100, y: 120 },
    ],
  },
  [ComponentType.THERMAL_RELAY]: {
    type: ComponentType.THERMAL_RELAY,
    name: 'Теплові реле РТ',
    width: 100, 
    height: 120,
    terminals: [
        { id: '1', label: '1', type: 'power', x: 20, y: 0, isInput: true },
        { id: '3', label: '3', type: 'power', x: 50, y: 0, isInput: true },
        { id: '5', label: '5', type: 'power', x: 80, y: 0, isInput: true },
        { id: '2', label: '2', type: 'power', x: 20, y: 120 },
        { id: '4', label: '4', type: 'power', x: 50, y: 120 },
        { id: '6', label: '6', type: 'power', x: 80, y: 120 },
        { id: '95', label: '95', type: 'control', x: 0, y: 40, isInput: true },
        { id: '96', label: '96', type: 'control', x: 0, y: 80 },
        { id: '97', label: '97', type: 'control', x: 100, y: 40, isInput: true },
        { id: '98', label: '98', type: 'control', x: 100, y: 80 },
    ]
  },
  [ComponentType.BUTTON_NO]: {
    type: ComponentType.BUTTON_NO,
    name: 'Кнопка Пуск',
    width: 50,
    height: 60,
    terminals: [
        { id: '13', label: '13', type: 'control', x: 25, y: 0, isInput: true },
        { id: '14', label: '14', type: 'control', x: 25, y: 60 },
    ]
  },
  [ComponentType.BUTTON_NC]: {
    type: ComponentType.BUTTON_NC,
    name: 'Кнопка Стоп',
    width: 50,
    height: 60,
    terminals: [
        { id: '11', label: '11', type: 'control', x: 25, y: 0, isInput: true },
        { id: '12', label: '12', type: 'control', x: 25, y: 60 },
    ]
  },
  [ComponentType.BUTTON_UNIVERSAL]: {
    type: ComponentType.BUTTON_UNIVERSAL,
    name: 'Кнопка Унів.',
    width: 70,
    height: 80,
    terminals: [
        { id: '11', label: '11', type: 'control', x: 20, y: 0, isInput: true },
        { id: '12', label: '12', type: 'control', x: 20, y: 80 },
        { id: '13', label: '13', type: 'control', x: 50, y: 0, isInput: true },
        { id: '14', label: '14', type: 'control', x: 50, y: 80 },
    ]
  },
  [ComponentType.SWITCH]: {
    type: ComponentType.SWITCH,
    name: 'Вимикач SA',
    width: 50,
    height: 70,
    terminals: [
        { id: '1', label: '1', type: 'control', x: 25, y: 0, isInput: true },
        { id: '2', label: '2', type: 'control', x: 25, y: 70 },
    ]
  },
  [ComponentType.SELECTOR]: {
    type: ComponentType.SELECTOR,
    name: 'Перемикач',
    width: 90,
    height: 90,
    terminals: [
        { id: 'L', label: 'L', type: 'control', x: 45, y: 0, isInput: true },
        { id: '1', label: '1', type: 'control', x: 20, y: 90 },
        { id: '2', label: '2', type: 'control', x: 45, y: 90 },
        { id: '3', label: '3', type: 'control', x: 70, y: 90 },
    ]
  },
  [ComponentType.SIGNAL_LAMP]: {
    type: ComponentType.SIGNAL_LAMP,
    name: 'Лампа (HL)',
    width: 60,
    height: 80,
    terminals: [
      { id: 'X1', label: 'X1', type: 'control', x: 30, y: 0, isInput: true },
      { id: 'X2', label: 'X2', type: 'control', x: 30, y: 80 },
    ]
  },
  [ComponentType.INCANDESCENT_BULB]: {
    type: ComponentType.INCANDESCENT_BULB,
    name: 'Лампа розж. (EL)',
    width: 70,
    height: 90,
    terminals: [
      { id: 'X1', label: 'X1', type: 'control', x: 35, y: 0, isInput: true },
      { id: 'X2', label: 'X2', type: 'control', x: 35, y: 90 },
    ]
  },
  [ComponentType.RHEOSTAT]: {
    type: ComponentType.RHEOSTAT,
    name: 'Реостат',
    width: 40,
    height: 120,
    terminals: [
      { id: '1', label: '1', type: 'control', x: 20, y: 0, isInput: true },
      { id: '2', label: '2', type: 'control', x: 20, y: 120 },
    ]
  },
  [ComponentType.TERMINAL_BLOCK]: {
    type: ComponentType.TERMINAL_BLOCK,
    name: 'Клемник', 
    width: 26, 
    height: 100, 
    terminals: [], 
    resizable: true
  },
  [ComponentType.MULTIMETER]: {
    type: ComponentType.MULTIMETER,
    name: 'Мультиметр',
    width: 120,
    height: 180,
    terminals: [
      { id: 'V', label: 'V/Ω/A', type: 'control', x: 40, y: 170 },
      { id: 'COM', label: 'COM', type: 'ground', x: 80, y: 170 },
    ]
  },
  [ComponentType.MOTOR_3PH]: {
    type: ComponentType.MOTOR_3PH,
    name: 'Двигун 3Ф',
    width: 130, 
    height: 140,
    terminals: [
      { id: 'U1', label: 'U1', type: 'power', x: 25, y: 20, isInput: true },
      { id: 'V1', label: 'V1', type: 'power', x: 55, y: 20, isInput: true },
      { id: 'W1', label: 'W1', type: 'power', x: 85, y: 20, isInput: true },
      { id: 'PE', label: 'PE', type: 'ground', x: 115, y: 20, isInput: true },
    ],
  },
  [ComponentType.ENERGY_METER]: {
    type: ComponentType.ENERGY_METER,
    name: 'Лічильник',
    width: 100,
    height: 120,
    terminals: [
       // Dynamic based on 1ph/3ph
    ]
  }
};

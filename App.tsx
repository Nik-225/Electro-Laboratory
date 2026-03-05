
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Play, Trash2, RotateCcw, Plus, MousePointer2, X, RefreshCw, Spline, ArrowRight, Layers, Download, Upload, GripHorizontal, Volume2, VolumeX, Zap, Timer, GraduationCap, CircleDashed, Bug, AlertTriangle, Check, Palette, ChevronLeft, ChevronRight, MoreVertical, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { ComponentData, Wire, ComponentType, Terminal, MultimeterMode, SwitchMode } from './types';
import { COMPONENT_TEMPLATES, RELAY_RANGES } from './constants';
import { ComponentNode } from './components/ComponentNode';
import { runSimulation, SimulationResult } from './services/circuitLogic';
import { soundEngine } from './services/soundEngine';
import { runDiagnostics } from './services/testSuite';

const DEFAULT_WIRE_COLOR = '#374151'; // gray-700
const SELECTED_WIRE_COLOR = '#eab308'; // yellow-500

const THEMES = [
    { id: 'standard', name: 'Стандарт', bg: 'bg-slate-50', grid: 'grid-pattern', panel: 'bg-white border-gray-200', text: 'text-slate-800' },
    { id: 'blueprint', name: 'Креслення', bg: 'bg-[#1e293b]', grid: 'grid-pattern-light', panel: 'bg-[#0f172a] border-slate-700 text-blue-100', text: 'text-blue-50' }, 
    { id: 'paper', name: 'Папір', bg: 'bg-[#fefce8]', grid: 'grid-pattern-dots', panel: 'bg-[#fffbeb] border-amber-200', text: 'text-amber-900' }, 
    { id: 'dark', name: 'Темна', bg: 'bg-black', grid: 'grid-pattern-dark', panel: 'bg-zinc-900 border-zinc-700 text-zinc-300', text: 'text-zinc-200' },
    { id: 'industrial', name: 'Індустрія', bg: 'bg-zinc-300', grid: 'grid-pattern-lines', panel: 'bg-zinc-200 border-zinc-400', text: 'text-zinc-800' },
    { id: 'matrix', name: 'Матриця', bg: 'bg-black', grid: 'grid-pattern-green', panel: 'bg-black border-green-900 text-green-500', text: 'text-green-400' },
    { id: 'sunset', name: 'Захід', bg: 'bg-orange-50', grid: 'grid-pattern-warm', panel: 'bg-orange-100 border-orange-200', text: 'text-orange-900' },
];

interface VisualEffect {
    id: string;
    x: number;
    y: number;
    type: 'spark';
    timestamp: number;
}

interface SelectionBox {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
}

// Modal State Interface
interface ConfirmDialogState {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    isDangerous?: boolean; // Make button red
    action: () => void;
}

// Ghost component for mobile drag from library
interface GhostComponent {
    type: ComponentType;
    x: number;
    y: number;
}

export default function App() {
  // --- State ---
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [wireStyle, setWireStyle] = useState<'curved' | 'straight'>('curved');
  const [wireLayer, setWireLayer] = useState<'front' | 'back'>('front'); 
  const [showZones, setShowZones] = useState(false);
  const [zoom, setZoom] = useState(1);
  
  // Theme State
  const [currentThemeId, setCurrentThemeId] = useState('standard');
  const currentTheme = THEMES.find(t => t.id === currentThemeId) || THEMES[0];

  // Audio State
  const [volume, setVolume] = useState(5);
  const [isMuted, setIsMuted] = useState(false);
  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>([]);

  // Selection
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([]); // Array for multi-select
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);

  // Simulation & Exam Mode
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResults, setSimResults] = useState<SimulationResult>({ 
    energizedWires: [], 
    poweredComponents: [], 
    multimeterReadings: {}, 
    componentStates: {}, 
    heatUpdates: {}, 
    motorUpdates: {},
    wirePhases: {},
    meterUpdates: {}
  });
  
  const [isExamMode, setIsExamMode] = useState(false);
  const [examTime, setExamTime] = useState(0); // seconds

  // UI Modal State
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Mobile Header Menu

  // Wiring State
  const [drawingWire, setDrawingWire] = useState<{ startCompId: string; startTermId: string; x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Mobile/Touch States
  const [ghostComponent, setGhostComponent] = useState<GhostComponent | null>(null);
  const longPressTimer = useRef<any>(null);
  const isTouchAction = useRef(false);

  // Dragging State (Canvas)
  const [isDraggingComponents, setIsDraggingComponents] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 }); // For delta calculation

  // Properties Window State (Modified default to left)
  const [propertiesPos, setPropertiesPos] = useState({ x: 10, y: 80 });
  const [draggingPanel, setDraggingPanel] = useState(false);
  const [panelDragOffset, setPanelDragOffset] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const universalButtonTimers = useRef<Record<string, number>>({});
  
  // Refs for Simulation Loop to access latest state without resetting interval
  const componentsRef = useRef<ComponentData[]>([]);
  const wiresRef = useRef<Wire[]>([]);
  const prevComponentsRef = useRef<ComponentData[]>([]); 
  const isSimulatingRef = useRef(isSimulating);

  // Sync refs with state
  useEffect(() => {
    componentsRef.current = components;
    wiresRef.current = wires;
    isSimulatingRef.current = isSimulating;
  }, [components, wires, isSimulating]);

  // Exam Timer
  useEffect(() => {
      let timer: any;
      if (isExamMode) {
          timer = setInterval(() => {
              setExamTime(prev => prev + 1);
          }, 1000);
      }
      return () => clearInterval(timer);
  }, [isExamMode]);

  // --- Audio Handlers ---
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value);
      setVolume(v);
      soundEngine.setVolume(v);
  };

  const toggleMute = () => {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      soundEngine.setMute(newMuted);
  };

  // --- Helpers ---
  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTerminalPos = (compId: string, termId: string) => {
    const comp = components.find((c) => c.id === compId);
    if (!comp) return { x: 0, y: 0 };
    
    let termX = 0;
    let termY = 0;

    // Dynamic Terminal Logic
    if (comp.type === ComponentType.TERMINAL_BLOCK) {
        const idx = parseInt(termId);
        termX = 13;
        termY = idx * 20 + 20; 
    } else if (comp.type === ComponentType.SOURCE_3PH) {
        const phases = comp.properties?.phases || 3;
        const hasN = comp.properties?.hasNeutral !== false;
        const pePos = comp.properties?.groundPosition || 'right';
        
        if (termId === 'L1') { termX = 20; termY = 50; }
        else if (termId === 'L2') { termX = 50; termY = 50; }
        else if (termId === 'L3') { termX = 80; termY = 50; }
        else if (termId === 'N') {
             const lastPhaseX = phases === 1 ? 20 : phases === 2 ? 50 : 80;
             termX = lastPhaseX + 30; termY = 50;
        }
        else if (termId === 'PE') {
             termX = pePos === 'left' ? 10 : 130; termY = 30;
        }
    } else if (comp.type === ComponentType.SELECTOR) {
        const mode = comp.properties?.switchMode || '1-0-2';
        if (termId === 'L') { termX = 45; termY = 0; }
        else if (termId === '1') { termX = 20; termY = 90; }
        else if (termId === '2') {
            if (mode === '1-2-3' || mode === '0-1-2-3') termX = 45;
            else termX = 70;
            termY = 90; 
        }
        else if (termId === '3') { termX = 70; termY = 90; }
    } else if (comp.type === ComponentType.ENERGY_METER) {
        const mType = comp.properties?.meterType || '1ph';
        if (mType === '1ph') {
            if(termId === 'L_in') { termX = 20; termY = 120; }
            if(termId === 'L_out') { termX = 40; termY = 120; }
            if(termId === 'N_in') { termX = 60; termY = 120; }
            if(termId === 'N_out') { termX = 80; termY = 120; }
        } else {
            const idx = parseInt(termId);
            const positions = [10, 20, 35, 45, 60, 70, 85, 95];
            termX = positions[idx-1] || 0;
            termY = 120;
        }
    } else {
        const template = COMPONENT_TEMPLATES[comp.type];
        const term = template.terminals.find((t) => t.id === termId);
        if (!term) return { x: 0, y: 0 };
        termX = term.x;
        termY = term.y;
    }

    // Apply Rotation
    const template = COMPONENT_TEMPLATES[comp.type];
    const height = comp.type === ComponentType.TERMINAL_BLOCK ? ((comp.properties?.terminalCount || 4) * 20) + 40 : template.height;
    const width = template.width;

    const cx = width / 2;
    const cy = height / 2;

    const dx = termX - cx;
    const dy = termY - cy;

    const rad = (comp.rotation * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    return {
      x: comp.x + (cx + rx),
      y: comp.y + (cy + ry),
    };
  };

  // ... (Delete, Rotate, Save, Load logic remains same)
  const deleteSelection = useCallback(() => {
      let hasChanges = false;
      if (selectedCompIds.length > 0) {
          setComponents(prev => prev.filter(c => !selectedCompIds.includes(c.id)));
          setWires(prev => prev.filter(w => !selectedCompIds.includes(w.startCompId) && !selectedCompIds.includes(w.endCompId)));
          setSelectedCompIds([]);
          setIsPropertiesOpen(false);
          hasChanges = true;
      }
      if (selectedWireId) {
          setWires(prev => prev.filter(w => w.id !== selectedWireId));
          setSelectedWireId(null);
          hasChanges = true;
      }
      if (hasChanges) soundEngine.playClick();
  }, [selectedCompIds, selectedWireId]);

  const rotateSelection = useCallback(() => {
      if (selectedCompIds.length > 0) {
          setComponents(prev => prev.map(c => {
              if (selectedCompIds.includes(c.id)) {
                  const step = c.type === ComponentType.TERMINAL_BLOCK ? 45 : 90;
                  const newRot = (c.rotation + step) % 360;
                  return { ...c, rotation: newRot };
              }
              return c;
          }));
      }
  }, [selectedCompIds]);

  const handleSave = () => { /* ... existing save ... */
      try {
          const schemeData = {
              version: '1.0',
              timestamp: Date.now(),
              components,
              wires,
              settings: { wireStyle, wireLayer }
          };
          const jsonString = JSON.stringify(schemeData, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `schema_${new Date().toISOString().slice(0,10)}.json`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      } catch (err) {
          console.error("Save failed:", err);
          alert("Не вдалося зберегти схему.");
      }
  };
  const handleLoadClick = () => fileInputRef.current?.click();
  
  const sanitizeComponentState = (c: ComponentData): ComponentData => {
      return {
          ...c,
          state: {
              ...c.state,
              // Relays default to ON (Normal), others OFF
              isOn: c.type === ComponentType.THERMAL_RELAY, 
              isPowered: false,
              isTransient: false,
              accumulatedHeat: 0,
              temperature: 0,
              isBurnedOut: false,
              direction: undefined,
              voltageReading: '',
              selectorPosition: 0,
              brightness: 0,
              resistanceSetting: c.state.resistanceSetting ?? 50,
              totalEnergy: 0,
              instantaneousPower: 0,
              currentSpeed: 0 // Reset speed on start
          }
      };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { /* ... existing ... */
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const content = event.target?.result as string;
              const data = JSON.parse(content);
              if (data.components && Array.isArray(data.components)) {
                  setIsSimulating(false);
                  const safeComponents = data.components.map(sanitizeComponentState);
                  setComponents(safeComponents);
                  setWires(data.wires || []);
                  if(data.settings?.wireStyle) setWireStyle(data.settings.wireStyle);
                  if(data.settings?.wireLayer) setWireLayer(data.settings.wireLayer);
              } else {
                  alert('Невірний формат файлу схеми');
              }
          } catch (err) {
              console.error(err);
              alert('Помилка при зчитуванні файлу');
          }
          if(fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };
  const handleRunDiagnostics = () => { /* ... existing ... */
      const results = runDiagnostics();
      const passed = results.filter(r => r.passed).length;
      const total = results.length;
      const report = results.map(r => `${r.passed ? '✅' : '❌'} ${r.name}: ${r.message}`).join('\n');
      alert(`РЕЗУЛЬТАТИ ДІАГНОСТИКИ (${passed}/${total})\n\n${report}`);
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Changed: Check isPropertiesOpen to prevent accidental deletion during editing
          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (!isPropertiesOpen) {
                  deleteSelection();
              }
          }
          if (['r', 'R', 'к', 'К'].includes(e.key)) rotateSelection();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelection, rotateSelection, isPropertiesOpen]);

  useEffect(() => {
    const handleResize = () => {
        setPropertiesPos(prev => { 
            // Keep in bounds logic would be good here
            return prev; 
        });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAddComponent = (type: ComponentType, dropX?: number, dropY?: number) => {
    const template = COMPONENT_TEMPLATES[type];
    const newId = `${type}_${Date.now()}`;
    const buttonTypes = [ComponentType.BUTTON_NO, ComponentType.BUTTON_NC, ComponentType.BUTTON_UNIVERSAL];
    const isButton = buttonTypes.includes(type);
    const count = isButton
        ? components.filter(c => buttonTypes.includes(c.type)).length + 1
        : components.filter(c => c.type === type).length + 1;

    let label = template.name.split(' ')[0]; 
    if(type === ComponentType.SOURCE_3PH) label = "Power";
    if(type === ComponentType.BREAKER_3P) label = `-QF${count}`;
    if(type === ComponentType.CONTACTOR) label = `-KM${count}`;
    if(type === ComponentType.BUTTON_NO) label = `-SB${count}`;
    if(type === ComponentType.BUTTON_NC) label = `-SB${count}`; 
    if(type === ComponentType.BUTTON_UNIVERSAL) label = `-SB${count}`;
    if(type === ComponentType.SWITCH) label = `-SA${count}`;
    if(type === ComponentType.SELECTOR) label = `-SA${count+2}`;
    if(type === ComponentType.MOTOR_3PH) label = `-M${count}`;
    if(type === ComponentType.THERMAL_RELAY) label = `-KK${count}`;
    if(type === ComponentType.SIGNAL_LAMP) label = `-HL${count}`;
    if(type === ComponentType.INCANDESCENT_BULB) label = `-EL${count}`;
    if(type === ComponentType.MULTIMETER) label = `Multi`;
    if(type === ComponentType.TERMINAL_BLOCK) label = `-XT${count}`;
    if(type === ComponentType.RHEOSTAT) label = `-R${count}`;
    if(type === ComponentType.ENERGY_METER) label = `-Wh${count}`;

    const newComp: ComponentData = {
      id: newId,
      type,
      x: dropX || (100 + Math.random() * 50),
      y: dropY || (100 + Math.random() * 50),
      rotation: 0,
      label,
      state: { 
          isOn: type === ComponentType.THERMAL_RELAY, // Default ON for relay
          isPowered: false, multimeterMode: 'OFF', 
          selectorPosition: 0, accumulatedHeat: 0, temperature: 0, 
          currentSpeed: 0, resistanceSetting: 50, // Initial speed 0
          totalEnergy: 0, instantaneousPower: 0
      },
      properties: {
          coilVoltage: '220V',
          color: 'green',
          arrowDirection: 'none',
          terminalCount: 4,
          power: 1.5,
          rpm: 1500,
          currentRating: 16,
          breakerCurve: 'C',
          relayRange: '2.5-4 A', // Default matches PT-0308
          relaySetting: 3.2,
          loadFactor: 0,
          switchMode: '1-0-2',
          voltageRating: 220,
          phases: 3,
          hasNeutral: true,
          groundPosition: 'right',
          maxResistance: 100,
          meterType: '1ph',
      }
    };
    if (type === ComponentType.BUTTON_UNIVERSAL && newComp.properties) newComp.properties.color = 'black';
    if (type === ComponentType.INCANDESCENT_BULB && newComp.properties) newComp.properties.power = 60;

    setComponents([...components, newComp]);
  };

  const handleLibraryTouchStart = (e: React.TouchEvent, type: ComponentType) => {
      e.stopPropagation();
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      longPressTimer.current = setTimeout(() => {
          setGhostComponent({ type, x: startX, y: startY });
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500);
  };

  const handleGlobalTouchMove = (e: React.TouchEvent) => {
      if (ghostComponent) {
          const touch = e.touches[0];
          setGhostComponent({ ...ghostComponent, x: touch.clientX, y: touch.clientY });
          e.preventDefault(); 
      }
      else if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
  };

  const handleGlobalTouchEnd = (e: React.TouchEvent) => {
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
      if (ghostComponent) {
          const touch = e.changedTouches[0];
          if (canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              if (touch.clientX >= rect.left && touch.clientX <= rect.right && 
                  touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                      const x = (touch.clientX - rect.left) / zoom - (COMPONENT_TEMPLATES[ghostComponent.type].width / 2);
                      const y = (touch.clientY - rect.top) / zoom - (COMPONENT_TEMPLATES[ghostComponent.type].height / 2);
                      handleAddComponent(ghostComponent.type, x, y);
                  }
          }
          setGhostComponent(null);
      }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('componentType') as ComponentType;
    if (type && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoom - (COMPONENT_TEMPLATES[type].width / 2);
        const y = (e.clientY - rect.top) / zoom - (COMPONENT_TEMPLATES[type].height / 2);
        handleAddComponent(type, x, y);
    }
  };

  const handleCompPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (drawingWire) return; 
    
    if (!selectedCompIds.includes(id)) {
        setSelectedCompIds([id]);
        setIsPropertiesOpen(false); 
    }
    
    setSelectedWireId(null);
    setIsDraggingComponents(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  
  const handleCompDoubleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setIsPropertiesOpen(true);
  };

  const handleTerminalPointerDown = (e: React.PointerEvent, compId: string, termId: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Improved "Tap-Tap" wiring:
    // If we are already drawing a wire, this click completes it.
    if (drawingWire) {
        if (drawingWire.startCompId === compId && drawingWire.startTermId === termId) {
            setDrawingWire(null); // Cancel if clicking same terminal
            return;
        }
        // Complete the wire
        const newWire: Wire = {
            id: `w_${Date.now()}`,
            startCompId: drawingWire.startCompId,
            startTermId: drawingWire.startTermId,
            endCompId: compId,
            endTermId: termId,
            color: DEFAULT_WIRE_COLOR,
            isEnergized: false
        };
        setWires([...wires, newWire]);
        setDrawingWire(null);
        soundEngine.playClick();
        return;
    }

    // Otherwise, start drawing
    const pos = getTerminalPos(compId, termId);
    setDrawingWire({ startCompId: compId, startTermId: termId, x: pos.x, y: pos.y });
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
      // If we tap empty space while drawing wire, cancel wire
      if (drawingWire) {
          setDrawingWire(null);
          return;
      }
      
      if (e.target !== canvasRef.current) return;
      
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      
      setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y, active: true });
      setSelectedCompIds([]);
      setSelectedWireId(null);
      setIsPropertiesOpen(false);
      (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && longPressTimer.current && !drawingWire) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }

    if (draggingPanel) {
        const panelWidth = 288;
        let newX = e.clientX - panelDragOffset.x;
        let newY = e.clientY - panelDragOffset.y;
        
        // Boundaries
        newX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth));
        newY = Math.max(56, Math.min(newY, window.innerHeight - 40));
        
        setPropertiesPos({ x: newX, y: newY });
        return;
    }

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setMousePos({ x, y });

    if (isDraggingComponents) {
        const dx = (e.clientX - lastMousePos.x) / zoom;
        const dy = (e.clientY - lastMousePos.y) / zoom;
        setComponents(prev => prev.map(c => {
            if (selectedCompIds.includes(c.id)) {
                return { ...c, x: c.x + dx, y: c.y + dy };
            }
            return c;
        }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
        return;
    }
    
    if (selectionBox && selectionBox.active) {
        setSelectionBox({ ...selectionBox, currentX: x, currentY: y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }

    setDraggingPanel(false);
    setIsDraggingComponents(false);
    const target = e.target as Element;
    try { if (target.hasPointerCapture && target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId); } catch (err) {}
    
    if (selectionBox && selectionBox.active) {
        const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
        const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
        const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
        const y2 = Math.max(selectionBox.startY, selectionBox.currentY);
        
        const newlySelected: string[] = [];
        components.forEach(comp => {
            const tpl = COMPONENT_TEMPLATES[comp.type];
            if (comp.x < x2 && comp.x + tpl.width > x1 && comp.y < y2 && comp.y + tpl.height > y1) {
                newlySelected.push(comp.id);
            }
        });
        if (newlySelected.length > 0) {
            setSelectedCompIds(newlySelected);
            setIsPropertiesOpen(false); 
        }
        setSelectionBox(null);
    }
    
    // Note: Wiring end logic is now handled in handleTerminalPointerUp (or Down for tap-tap)
    // We don't clear drawingWire here anymore to support click-click
  };

  const handleTerminalPointerUp = (e: React.PointerEvent, compId: string, termId: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Support Drag-and-Drop wiring as well
    if (drawingWire && (drawingWire.startCompId !== compId || drawingWire.startTermId !== termId)) {
         const newWire: Wire = {
            id: `w_${Date.now()}`,
            startCompId: drawingWire.startCompId,
            startTermId: drawingWire.startTermId,
            endCompId: compId,
            endTermId: termId,
            color: DEFAULT_WIRE_COLOR,
            isEnergized: false
        };
        setWires([...wires, newWire]);
        setDrawingWire(null);
        soundEngine.playClick();
    }
  };

  const handleToggleState = (id: string) => {
    const comp = components.find(c => c.id === id);
    if (comp) {
        if ([ComponentType.BUTTON_NO, ComponentType.BUTTON_NC, ComponentType.BUTTON_UNIVERSAL, ComponentType.THERMAL_RELAY].includes(comp.type)) soundEngine.playClick();
        else if ([ComponentType.SWITCH, ComponentType.SELECTOR, ComponentType.BREAKER_3P, ComponentType.MULTIMETER].includes(comp.type)) soundEngine.playSwitch();
    }
    // ... (Universal button logic) ...
    if (comp && comp.type === ComponentType.BUTTON_UNIVERSAL) {
        const willTurnOn = !comp.state.isOn;
        if (willTurnOn) {
            if (universalButtonTimers.current[id]) clearTimeout(universalButtonTimers.current[id]);
            setComponents(prev => prev.map(c => c.id === id ? { ...c, state: { ...c.state, isOn: true, isTransient: true } } : c));
            universalButtonTimers.current[id] = setTimeout(() => {
                setComponents(prev => prev.map(c => c.id === id ? { ...c, state: { ...c.state, isTransient: false } } : c));
                delete universalButtonTimers.current[id];
            }, 300);
        } else {
            if (universalButtonTimers.current[id]) {
                clearTimeout(universalButtonTimers.current[id]);
                delete universalButtonTimers.current[id];
            }
            setComponents(prev => prev.map(c => c.id === id ? { ...c, state: { ...c.state, isOn: false, isTransient: false } } : c));
        }
        return; 
    }

    setComponents(prev => prev.map(c => {
        if (c.id === id) {
            if (c.type === ComponentType.CONTACTOR) return c;
            if (c.type === ComponentType.MULTIMETER) {
                const modes: MultimeterMode[] = ['OFF', 'VAC', 'VDC', 'OHM', 'AAC'];
                const currentIdx = modes.indexOf(c.state.multimeterMode || 'OFF');
                const nextMode = modes[(currentIdx + 1) % modes.length];
                return { ...c, state: { ...c.state, multimeterMode: nextMode }};
            }
            if (c.type === ComponentType.SELECTOR) {
                const pos = c.state.selectorPosition ?? 0;
                const mode = c.properties?.switchMode || '1-0-2';
                let maxPos = 2; 
                if (mode === '1-2') maxPos = 1;
                if (mode === '0-1-2-3') maxPos = 3;
                const nextPos = (pos + 1) % (maxPos + 1);
                return { ...c, state: { ...c.state, selectorPosition: nextPos }};
            }
            const newIsOn = !c.state.isOn;
            return { ...c, state: { ...c.state, isOn: newIsOn, accumulatedHeat: newIsOn ? 0 : c.state.accumulatedHeat }};
        }
        return c;
    }));
  };

  const performClearAll = () => { /* ... */
        soundEngine.stopAll();
        Object.values(universalButtonTimers.current).forEach(t => clearTimeout(t as number));
        universalButtonTimers.current = {};
        setComponents([]);
        setWires([]);
        setSimResults({ energizedWires: [], poweredComponents: [], multimeterReadings: {}, componentStates: {}, heatUpdates: {}, motorUpdates: {}, wirePhases: {}, meterUpdates: {} });
        setIsSimulating(false);
        setExamTime(0);
        setIsExamMode(false);
  };
  
  const performExamStart = () => {
      performClearAll();
      setIsExamMode(true);
  };

  const clearAll = (skipConfirm = false) => {
      if (skipConfirm) performClearAll();
      else {
          setConfirmDialog({
              isOpen: true,
              title: "Очистити все?",
              message: "Ви впевнені, що хочете видалити всю схему?",
              confirmLabel: "Очистити",
              isDangerous: true,
              action: () => performClearAll()
          });
      }
  };
  
  const updateProperty = (compId: string, key: string, value: any) => { /* ... */
      setComponents(prev => prev.map(c => {
          if (c.id === compId) {
              const updated = { ...c, properties: { ...c.properties, [key]: value }};
              if (key === 'resistanceSetting') return { ...c, state: { ...c.state, resistanceSetting: value }};
              if (key === 'switchMode') updated.state.selectorPosition = 0;
              if (key === 'relayRange') {
                  const r = RELAY_RANGES.find(rg => rg.label === value);
                  if (r) updated.properties!.relaySetting = r.default;
              }
              if (key === 'relaySetting') {
                   const rangeLabel = c.properties?.relayRange || RELAY_RANGES[0].label;
                   const r = RELAY_RANGES.find(rg => rg.label === rangeLabel);
                   if (r) {
                       // Enforce limits
                       value = Math.max(r.min, Math.min(r.max, value));
                       updated.properties!.relaySetting = value;
                   }
              }
              return updated;
          }
          return c;
      }));
  };
  
  const handleToggleSimulation = () => {
      if (!isSimulating) {
          soundEngine.init(); 
          setComponents(prev => prev.map(sanitizeComponentState));
      } else {
          soundEngine.stopAll();
          Object.values(universalButtonTimers.current).forEach(t => clearTimeout(t as number));
          universalButtonTimers.current = {};
      }
      setIsSimulating(!isSimulating);
  };
  
  const toggleExamMode = (e?: React.MouseEvent) => { /* ... */
      if (e) { e.stopPropagation(); e.preventDefault(); }
      if (isExamMode) {
          setConfirmDialog({
              isOpen: true,
              title: "Завершити іспит?",
              message: "Ви дійсно хочете завершити режим іспиту? Весь прогрес буде втрачено.",
              confirmLabel: "Завершити",
              isDangerous: false,
              action: () => { setIsExamMode(false); setExamTime(0); setIsSimulating(false); soundEngine.stopAll(); }
          });
      } else {
          setConfirmDialog({
              isOpen: true,
              title: "Розпочати іспит?",
              message: "Робоче поле буде повністю очищено. Таймер почне відлік часу.",
              confirmLabel: "Розпочати",
              isDangerous: true,
              action: () => performExamStart()
          });
      }
  };

  const handlePanelMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingPanel(true);
    setPanelDragOffset({
        x: e.clientX - propertiesPos.x,
        y: e.clientY - propertiesPos.y
    });
  };

  const handleZoom = (delta: number) => {
      setZoom(prev => Math.min(2, Math.max(0.5, prev + delta)));
  };

  // Derived state for UI
  const selectedComp = selectedCompIds.length === 1 ? components.find(c => c.id === selectedCompIds[0]) : null;

  // CONSTANT SIMULATION LOOP
  useEffect(() => {
    const interval = setInterval(() => {
        // Run logic always, passing isSimulating state to control voltage sources
        const results = runSimulation(componentsRef.current, wiresRef.current, isSimulatingRef.current);
        setSimResults(results);
        
        setComponents(prev => {
            const updatedComponents = prev.map(c => {
                const newState = { ...c.state };
                newState.isPowered = results.poweredComponents.includes(c.id);
                if (results.componentStates[c.id] !== undefined) newState.isOn = results.componentStates[c.id];
                if (results.heatUpdates && results.heatUpdates[c.id] !== undefined) newState.accumulatedHeat = results.heatUpdates[c.id];
                if (c.type === ComponentType.MOTOR_3PH && results.motorUpdates && results.motorUpdates[c.id]) {
                    newState.direction = results.motorUpdates[c.id].direction;
                    newState.currentSpeed = results.motorUpdates[c.id].speed;
                    newState.temperature = results.motorUpdates[c.id].temp;
                    if (results.motorUpdates[c.id].isBurnedOut) newState.isBurnedOut = true;
                }
                
                // Energy Meter Update
                if (c.type === ComponentType.ENERGY_METER) {
                    const power = results.meterUpdates?.[c.id] || 0; // Power in Watts
                    newState.instantaneousPower = power;
                    // Integrate: Power * time. Time step 100ms.
                    // 1 kWh = 1000W * 3600s = 3,600,000 Joules
                    // We add (Watts * 0.1s) Joules.
                    // kWh += (Watts * 0.1) / 3,600,000
                    const addedKwh = (power * 0.1) / 3600000;
                    newState.totalEnergy = (c.state.totalEnergy || 0) + addedKwh;
                }

                if (c.state.isBurnedOut) newState.isBurnedOut = true; 
                const refComp = componentsRef.current.find(r => r.id === c.id);
                if (refComp && refComp.state.isBurnedOut) newState.isBurnedOut = true;

                if (c.type === ComponentType.MULTIMETER) newState.voltageReading = results.multimeterReadings[c.id];
                return { ...c, state: newState };
            });

            // Handle Audio only if simulating
            if (isSimulatingRef.current) {
                const prevComps = prevComponentsRef.current;
                updatedComponents.forEach(curr => {
                    const prev = prevComps.find(p => p.id === curr.id);
                    if (!prev) return;
                    if (curr.type === ComponentType.CONTACTOR) {
                        if (curr.state.isOn && !prev.state.isOn) soundEngine.playContactor(true);
                        if (!curr.state.isOn && prev.state.isOn) soundEngine.playContactor(false);
                    }
                    if (curr.type === ComponentType.BREAKER_3P || curr.type === ComponentType.THERMAL_RELAY) {
                         if (prev.state.isOn && !curr.state.isOn) {
                             soundEngine.playBreaker(true);
                             if (curr.type === ComponentType.BREAKER_3P && (curr.state.accumulatedHeat || 0) >= 100 && (prev.state.accumulatedHeat || 0) < 90) {
                                 soundEngine.playShortCircuit();
                                 const template = COMPONENT_TEMPLATES[curr.type];
                                 setVisualEffects(ve => [...ve, { id: `eff_${Date.now()}`, x: curr.x + (template.width / 2), y: curr.y + (template.height / 2), type: 'spark', timestamp: Date.now() }]);
                             }
                         }
                    }
                    if (curr.type === ComponentType.MOTOR_3PH) {
                        // Sound logic update: check speed > 0 OR stalled/humming
                        const update = results.motorUpdates?.[curr.id];
                        const rpm = update?.speed || 0;
                        const isStalled = update?.isStalled || false;
                        const phaseError = update?.phaseError || false;
                        const load = curr.properties?.loadFactor || 0;
                        
                        const isStressed = isStalled || phaseError || load > 1.0;
                        const isRunning = rpm > 0 || isStressed; // Play sound if moving OR humming
                        
                        soundEngine.updateMotor(curr.id, isRunning, rpm, isStressed);
                    }
                });
            }
            prevComponentsRef.current = updatedComponents; 
            return updatedComponents;
        });
    }, 100);
    return () => clearInterval(interval);
  }, []); // Run effect once, depend on refs

  // Render logic...
  const renderWires = () => (
      <svg className={`absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible ${wireLayer === 'front' ? 'z-50' : 'z-0'}`}>
        <g className={drawingWire ? 'pointer-events-none' : 'pointer-events-auto'}>
        {wires.map((wire) => {
          const start = getTerminalPos(wire.startCompId, wire.startTermId);
          const end = getTerminalPos(wire.endCompId, wire.endTermId);
          const isEnergized = isSimulating && simResults.energizedWires.includes(wire.id);
          const isSelected = selectedWireId === wire.id;
          
          let energizedColor = '#ef4444'; // Default red for unknown energized state
          
          if (isEnergized) {
              const phases = simResults.wirePhases?.[wire.id] || [];
              if (phases.includes('PE')) energizedColor = '#000000'; // Black
              else if (phases.includes('L3')) energizedColor = '#ef4444'; // Red (L3/C)
              else if (phases.includes('L2')) energizedColor = '#22c55e'; // Green (L2/B)
              else if (phases.includes('L1')) energizedColor = '#eab308'; // Yellow (L1/A)
              else if (phases.includes('N')) energizedColor = '#38bdf8'; // Light Blue (Neutral)
          }

          let path = '';
          if (wireStyle === 'straight') path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
          else {
             const dist = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
             const controlOffset = Math.min(dist * 0.3, 80); 
             path = `M ${start.x} ${start.y} C ${start.x} ${start.y + controlOffset}, ${end.x} ${end.y + controlOffset}, ${end.x} ${end.y}`;
          }
          const strokeColor = isEnergized ? energizedColor : (isSelected ? SELECTED_WIRE_COLOR : wire.color);
          return (
            <g key={wire.id} className="cursor-pointer group" 
                onClick={(e) => { e.stopPropagation(); setSelectedWireId(wire.id); setSelectedCompIds([]); }}
                onPointerDown={(e) => {
                    // Middle Mouse Button Click (Button 1)
                    if (e.button === 1) {
                        e.stopPropagation();
                        e.preventDefault();
                        // Immediate delete logic
                        setWires(prev => prev.filter(w => w.id !== wire.id));
                        if(selectedWireId === wire.id) setSelectedWireId(null);
                        soundEngine.playClick();
                    }
                }}
            >
                 <path d={path} stroke="transparent" strokeWidth="12" fill="none" />
                <path d={path} stroke={strokeColor} strokeWidth={isEnergized ? 4 : (isSelected ? 5 : 3)} fill="none" strokeLinecap="round" className="transition-colors duration-200" style={{ filter: isEnergized ? `drop-shadow(0 0 4px ${energizedColor}80)` : 'none' }} />
            </g>
          );
        })}
        </g>
        {drawingWire && (
          <path d={wireStyle === 'straight' ? `M ${drawingWire.x} ${drawingWire.y} L ${mousePos.x} ${mousePos.y}` : `M ${drawingWire.x} ${drawingWire.y} C ${drawingWire.x} ${drawingWire.y + 50}, ${mousePos.x} ${mousePos.y + 50}, ${mousePos.x} ${mousePos.y}`} stroke="#9ca3af" strokeWidth="2" strokeDasharray="5,5" fill="none" className="pointer-events-none" />
        )}
      </svg>
  );

  return (
    <div 
        className={`flex h-screen w-screen flex-col ${currentTheme.bg} ${currentTheme.text} transition-colors duration-500`} 
        onPointerMove={handlePointerMove} 
        onPointerUp={handlePointerUp} 
        onPointerDown={handleCanvasPointerDown}
        onTouchMove={handleGlobalTouchMove}
        onTouchEnd={handleGlobalTouchEnd} 
        style={{ touchAction: 'none' }}
    >
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
      
      {/* Confirmation Dialog */}
      {confirmDialog && confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm text-center">
                  <div className="text-lg font-bold mb-2 text-gray-800">{confirmDialog.title}</div>
                  <div className="text-sm text-gray-600 mb-6">{confirmDialog.message}</div>
                  <div className="flex gap-2 justify-center">
                      <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 rounded bg-gray-200 text-gray-800 font-medium">Відміна</button>
                      <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} className={`px-4 py-2 rounded text-white font-medium ${confirmDialog.isDangerous ? 'bg-red-600' : 'bg-blue-600'}`}>{confirmDialog.confirmLabel}</button>
                  </div>
              </div>
          </div>
      )}

      {ghostComponent && (
          <div className="fixed z-[999] pointer-events-none opacity-80" style={{ left: ghostComponent.x, top: ghostComponent.y, transform: 'translate(-50%, -50%)' }}>
              <div className="bg-white p-2 rounded shadow-xl border-2 border-blue-500 text-xs font-bold text-black whitespace-nowrap">
                  {COMPONENT_TEMPLATES[ghostComponent.type].name}
              </div>
          </div>
      )}

      {/* Header */}
      <header className={`h-14 border-b flex items-center justify-between px-4 shadow-sm z-50 ${currentTheme.panel}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">E</div>
          <h1 className="font-bold text-lg tracking-tight hidden sm:block">ElectroLab <span className="text-blue-600 font-normal">Sim</span></h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
             {/* Toolbar items visible on large screens */}
             <div className="hidden md:flex items-center gap-2">
                {/* Zoom Controls */}
                <div className="flex items-center rounded-lg p-1 bg-black/5 mr-2">
                    <button onClick={() => handleZoom(-0.1)} className="p-1 hover:bg-black/10 rounded"><ZoomOut size={16}/></button>
                    <span className="text-xs w-8 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => handleZoom(0.1)} className="p-1 hover:bg-black/10 rounded"><ZoomIn size={16}/></button>
                </div>

                <div className={`flex items-center rounded-lg p-1 mr-2 border border-transparent hover:border-gray-200/20`}>
                    <Palette size={16} className="opacity-60 ml-2 mr-1" />
                    <select className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer opacity-80" value={currentThemeId} onChange={(e) => setCurrentThemeId(e.target.value)}>
                        {THEMES.map(t => <option key={t.id} value={t.id} className="text-black">{t.name}</option>)}
                    </select>
                </div>
                
                {/* Wire Style Controls */}
                <div className="flex items-center rounded-lg p-1 gap-1 border border-gray-200/20 bg-black/5 mr-2">
                    <button onClick={() => setWireStyle(wireStyle === 'curved' ? 'straight' : 'curved')} className="p-1.5 rounded opacity-60 hover:opacity-100" title="Тип проводів">
                        {wireStyle === 'curved' ? <Spline size={16} /> : <ArrowRight size={16} />}
                    </button>
                    <button onClick={() => setWireLayer(wireLayer === 'front' ? 'back' : 'front')} className="p-1.5 rounded opacity-60 hover:opacity-100" title="Шар проводів">
                        <Layers size={16} />
                    </button>
                </div>

                <div className="flex items-center rounded-lg p-1.5 gap-2 border border-gray-200/20 bg-black/5">
                    <button onClick={toggleMute} className={`p-1 rounded transition-colors ${isMuted ? 'text-red-500 bg-red-50/10' : 'opacity-60 hover:opacity-100'}`}>
                        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input type="range" min="0" max="10" value={volume} onChange={handleVolumeChange} className="w-20 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                </div>
                {!isExamMode && <button onClick={handleRunDiagnostics} className="p-2 rounded opacity-60 hover:opacity-100 hover:text-orange-500 transition-colors" title="Діагностика"><Bug size={18} /></button>}
                {!isExamMode && (
                    <div className="flex rounded-lg p-1 gap-1 border border-gray-200/20 bg-black/5">
                        <button onClick={handleSave} className="p-1.5 rounded opacity-60 hover:opacity-100 transition-all" title="Зберегти"><Download size={18} /></button>
                        <button onClick={handleLoadClick} className="p-1.5 rounded opacity-60 hover:opacity-100 transition-all" title="Завантажити"><Upload size={18} /></button>
                    </div>
                )}
             </div>

             {/* Sim Controls Always Visible */}
             <div className="flex items-center gap-3 bg-black/5 p-1 rounded-lg border border-gray-200/20">
                {isExamMode && <div className="flex items-center gap-2 px-2 text-blue-600 font-mono text-lg font-bold"><Timer size={18} /><span>{formatTime(examTime)}</span></div>}
                 <button onClick={(e) => toggleExamMode(e)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${isExamMode ? 'bg-blue-100 text-blue-700' : 'opacity-70 hover:opacity-100'}`} title="Режим Іспиту"><GraduationCap size={18} /><span className="hidden sm:inline">{isExamMode ? 'Завершити' : 'Іспит'}</span></button>
             </div>
             
             <button onClick={handleToggleSimulation} className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${isSimulating ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-600 text-white hover:bg-green-700 shadow-md hover:shadow-lg'}`}>{isSimulating ? <RotateCcw size={18}/> : <Play size={18}/>}<span className="hidden sm:inline">{isSimulating ? 'Стоп' : 'Старт'}</span></button>
             
             {/* Mobile Menu Toggle */}
             <div className="md:hidden relative">
                 <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded bg-black/5"><MoreVertical size={20} /></button>
                 {isMenuOpen && (
                     <div className="absolute right-0 top-12 w-48 bg-white shadow-xl rounded-lg border border-gray-200 p-2 z-[999] flex flex-col gap-2">
                         <div className="flex items-center justify-between p-2">
                             <span>Звук</span>
                             <button onClick={toggleMute}>{isMuted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button>
                         </div>
                         <div className="flex items-center justify-between p-2">
                             <span>Масштаб</span>
                             <div className="flex gap-2">
                                <button onClick={() => handleZoom(-0.1)} className="p-1 bg-gray-100 rounded"><ZoomOut size={16}/></button>
                                <button onClick={() => handleZoom(0.1)} className="p-1 bg-gray-100 rounded"><ZoomIn size={16}/></button>
                             </div>
                         </div>
                         <div className="flex items-center justify-between p-2">
                             <span>Провід</span>
                             <button onClick={() => setWireStyle(s => s === 'curved' ? 'straight' : 'curved')} className="p-1 bg-gray-100 rounded">{wireStyle === 'curved' ? 'Криві' : 'Прямі'}</button>
                         </div>
                         {!isExamMode && <button onClick={handleRunDiagnostics} className="w-full text-left p-2 hover:bg-gray-100 rounded flex gap-2"><Bug size={16}/> Діагностика</button>}
                         {!isExamMode && <button onClick={handleSave} className="w-full text-left p-2 hover:bg-gray-100 rounded flex gap-2"><Download size={16}/> Зберегти</button>}
                         {!isExamMode && <button onClick={handleLoadClick} className="w-full text-left p-2 hover:bg-gray-100 rounded flex gap-2"><Upload size={16}/> Завантажити</button>}
                         <button onClick={() => deleteSelection()} className="w-full text-left p-2 hover:bg-red-50 text-red-600 rounded flex gap-2"><Trash2 size={16}/> Видалити</button>
                         <button onClick={() => clearAll(false)} className="w-full text-left p-2 hover:bg-red-50 text-red-600 rounded flex gap-2"><RefreshCw size={16}/> Очистити все</button>
                     </div>
                 )}
             </div>
             
             <button onClick={() => deleteSelection()} className="hidden md:block p-2 opacity-60 hover:text-red-500 hover:opacity-100 transition-colors" title="Видалити"><Trash2 size={20} /></button>
             <button onClick={() => clearAll(false)} className="hidden md:block p-2 opacity-60 hover:text-red-500 hover:opacity-100 transition-colors" title="Очистити все"><RefreshCw size={20} /></button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`border-r flex flex-col z-40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] ${currentTheme.panel} transition-all duration-300 ${isSidebarOpen ? 'w-44 translate-x-0' : 'w-0 -translate-x-full overflow-hidden'} absolute md:relative h-full`}>
            <div className="p-4 border-b border-gray-200/20 flex justify-between items-center bg-gray-50/50">
                <h2 className="text-xs font-bold opacity-60 uppercase tracking-wider whitespace-nowrap">Бібліотека</h2>
                <button 
                    onClick={() => setIsSidebarOpen(false)} 
                    className="p-1 rounded hover:bg-black/5 transition-colors opacity-60 hover:opacity-100"
                    title="Згорнути"
                >
                    <ChevronLeft size={16}/>
                </button>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)] p-4">
                {Object.values(COMPONENT_TEMPLATES).map(tpl => (
                    <div 
                        key={tpl.type} 
                        className="flex items-center gap-2 p-2 rounded-lg border border-transparent hover:border-blue-500/20 hover:bg-blue-500/5 cursor-grab active:cursor-grabbing transition-all group select-none" 
                        draggable 
                        onDragStart={(e) => e.dataTransfer.setData('componentType', tpl.type)}
                        onTouchStart={(e) => handleLibraryTouchStart(e, tpl.type)}
                    >
                        <div className="w-6 h-6 rounded bg-black/5 flex items-center justify-center opacity-60 group-hover:bg-white group-hover:text-blue-500 transition-colors shrink-0"><Plus size={14} /></div>
                        <span className="text-xs font-medium truncate">{tpl.name}</span>
                    </div>
                ))}
            </div>
            <div className="mt-auto p-4 bg-black/5 border-t border-gray-200/20 text-[10px] opacity-60">
                <p className="font-semibold mb-1">Інструкція:</p>
                <ul className="list-disc pl-3 space-y-1"><li>'R' або 'к' для повороту.</li><li>Клік/Тап по клемі для початку/кінця дроту.</li><li>СКМ по дроту - видалити.</li><li>Мобільні: Утримання з меню для переносу.</li></ul>
            </div>
        </aside>
        
        {/* Toggle Sidebar Button (Visible when closed) */}
        {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="absolute left-2 top-20 z-50 bg-white p-2 rounded-full shadow-md border border-gray-200">
                <ChevronRight size={20} />
            </button>
        )}

        <main className={`flex-1 relative overflow-hidden ${currentTheme.grid} cursor-crosshair`} ref={canvasRef} onDragOver={handleDragOver} onDrop={handleDrop}>
            {/* Zoom container */}
            <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%' }}>
                {wireLayer === 'back' && renderWires()}
                {components.map((comp) => (
                    <ComponentNode 
                        key={comp.id} 
                        data={comp} 
                        isSelected={selectedCompIds.includes(comp.id)} 
                        onPointerDown={(e) => handleCompPointerDown(e, comp.id)} 
                        onDoubleClick={(e) => handleCompDoubleClick(e, comp.id)} 
                        onToggleState={() => handleToggleState(comp.id)} 
                        onUpdateProperty={updateProperty} 
                        onTerminalPointerDown={handleTerminalPointerDown}
                        onTerminalPointerUp={handleTerminalPointerUp}
                    />
                ))}
                {wireLayer === 'front' && renderWires()}
            </div>
            
            {/* Properties Panel (Left Side by default) */}
            {selectedComp && selectedCompIds.length === 1 && isPropertiesOpen && (
                <div className="absolute bg-white rounded-lg shadow-xl border border-gray-200 w-72 z-[1001] flex flex-col overflow-hidden" style={{ left: propertiesPos.x, top: propertiesPos.y }}>
                    <div className="bg-blue-600 px-3 py-2 flex justify-between items-center cursor-move text-white" onMouseDown={handlePanelMouseDown}>
                        <div className="flex items-center gap-2"><Settings size={14} /><span className="text-xs font-bold uppercase tracking-wide">Параметри</span></div>
                        <div className="flex gap-2">
                             <button onClick={(e) => { e.stopPropagation(); rotateSelection(); }} className="hover:text-blue-200" title="Повернути"><RefreshCw size={14}/></button>
                             <button onClick={(e) => { e.stopPropagation(); deleteSelection(); }} className="hover:text-red-200" title="Видалити"><Trash2 size={14}/></button>
                             <button onClick={(e) => { e.stopPropagation(); setIsPropertiesOpen(false); }} className="hover:text-blue-200" title="Закрити"><X size={14}/></button>
                        </div>
                    </div>
                    <div className="p-4 bg-gray-50 max-h-[400px] overflow-y-auto">
                         <div className="text-sm font-medium mb-3 pb-2 border-b border-gray-200 text-gray-700 flex justify-between items-center">
                             <span>{selectedComp.label}</span>
                             {/* Visual Heat Indicator for Breaker/Relay */}
                             {isSimulating && (selectedComp.type === ComponentType.BREAKER_3P || selectedComp.type === ComponentType.THERMAL_RELAY) && (
                                 <span className={`text-xs font-mono font-bold ${(selectedComp.state.accumulatedHeat || 0) > 50 ? 'text-red-600 animate-pulse' : 'text-green-600'}`}>
                                     Нагрів: {Math.round(selectedComp.state.accumulatedHeat || 0)}%
                                 </span>
                             )}
                         </div>
                         <div className="space-y-3">
                            {/* ... Existing property controls ... */}
                            {selectedComp.type === ComponentType.SOURCE_3PH && (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Фази</label>
                                        <div className="flex gap-2 bg-white p-1 rounded border">
                                            {[1, 2, 3].map(ph => ( <button key={ph} onClick={() => updateProperty(selectedComp.id, 'phases', ph)} className={`flex-1 text-xs py-1 rounded ${selectedComp.properties?.phases === ph ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500'}`}>{ph}Ф</button> ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between"><label className="text-xs text-gray-500">Нейтраль (N)</label><input type="checkbox" checked={selectedComp.properties?.hasNeutral !== false} onChange={(e) => updateProperty(selectedComp.id, 'hasNeutral', e.target.checked)} className="w-4 h-4 accent-blue-600" /></div>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Положення PE</label><select className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.groundPosition || 'right'} onChange={(e) => updateProperty(selectedComp.id, 'groundPosition', e.target.value)}><option value="left">Зліва</option><option value="right">Справа</option></select></div>
                                </>
                            )}
                            {selectedComp.type === ComponentType.ENERGY_METER && (
                                <div className="space-y-1"><label className="text-xs text-gray-500">Тип лічильника</label><select className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.meterType || '1ph'} onChange={(e) => updateProperty(selectedComp.id, 'meterType', e.target.value)}><option value="1ph">1-Фазний (4 кл)</option><option value="3ph">3-Фазний (8 кл)</option></select></div>
                            )}
                            {selectedComp.type === ComponentType.CONTACTOR && (
                                <div className="space-y-1"><label className="text-xs text-gray-500">Напруга котушки</label><select className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.coilVoltage} onChange={(e) => updateProperty(selectedComp.id, 'coilVoltage', e.target.value)}><option value="220V">220 В (L+N)</option><option value="380V">380 В (L+L)</option></select></div>
                            )}
                            {selectedComp.type === ComponentType.RHEOSTAT && (
                                <div className="space-y-1"><label className="text-xs text-gray-500">Опір (Ом)</label><input type="number" className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.maxResistance || 100} onChange={(e) => updateProperty(selectedComp.id, 'maxResistance', parseInt(e.target.value))} /></div>
                            )}
                            {selectedComp.type === ComponentType.SIGNAL_LAMP && (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Колір</label><div className="flex gap-1 flex-wrap">{['green', 'red', 'yellow', 'blue', 'white', 'orange', 'purple'].map(c => (<button key={c} onClick={() => updateProperty(selectedComp.id, 'color', c)} className={`w-5 h-5 rounded-full border ${selectedComp.properties?.color === c ? 'ring-2 ring-offset-1 ring-blue-500' : 'border-gray-300'}`} style={{ backgroundColor: c }} />))}</div></div>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Напруга (В)</label><input type="number" className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.voltageRating || 220} onChange={(e) => updateProperty(selectedComp.id, 'voltageRating', parseInt(e.target.value))} /></div>
                                </>
                            )}
                            {selectedComp.type === ComponentType.INCANDESCENT_BULB && (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Потужність (Вт)</label><input type="number" className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.power || 60} onChange={(e) => updateProperty(selectedComp.id, 'power', parseInt(e.target.value))} /></div>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Напруга (В)</label><input type="number" className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.voltageRating || 220} onChange={(e) => updateProperty(selectedComp.id, 'voltageRating', parseInt(e.target.value))} /></div>
                                </>
                            )}
                            {selectedComp.type === ComponentType.SELECTOR && (
                                <div className="space-y-1"><label className="text-xs text-gray-500">Режим</label><select className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.switchMode || '1-0-2'} onChange={(e) => updateProperty(selectedComp.id, 'switchMode', e.target.value)}><option value="1-2">1 - 2</option><option value="0-1-2">0 - 1 - 2</option><option value="1-0-2">1 - 0 - 2</option><option value="1-2-3">1 - 2 - 3</option><option value="0-1-2-3">0 - 1 - 2 - 3</option></select></div>
                            )}
                            {selectedComp.type === ComponentType.BUTTON_UNIVERSAL && (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Колір</label><div className="flex gap-1">{['black', 'green', 'red', 'yellow', 'blue', 'white'].map(c => (<button key={c} onClick={() => updateProperty(selectedComp.id, 'color', c)} className={`w-5 h-5 rounded border ${selectedComp.properties?.color === c ? 'ring-2 ring-offset-1 ring-blue-500' : 'border-gray-300'}`} style={{ backgroundColor: c }} />))}</div></div>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Стрілка</label><select className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.arrowDirection || 'none'} onChange={(e) => updateProperty(selectedComp.id, 'arrowDirection', e.target.value)}><option value="none">Немає</option><option value="up">Вгору</option><option value="down">Вниз</option><option value="left">Вліво</option><option value="right">Вправо</option></select></div>
                                </>
                            )}
                            {selectedComp.type === ComponentType.TERMINAL_BLOCK && (
                                <div className="space-y-1"><label className="text-xs text-gray-500">Кількість клем</label><input type="number" min="2" max="20" className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.terminalCount || 4} onChange={(e) => updateProperty(selectedComp.id, 'terminalCount', parseInt(e.target.value))} /></div>
                            )}
                            {selectedComp.type === ComponentType.MOTOR_3PH && (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Потужність (кВт)</label><input type="number" step="0.1" className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.power} onChange={(e) => updateProperty(selectedComp.id, 'power', parseFloat(e.target.value))} /></div>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Оберти (RPM)</label><input type="number" className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.rpm} onChange={(e) => updateProperty(selectedComp.id, 'rpm', parseInt(e.target.value))} /></div>
                                </>
                            )}
                            {selectedComp.type === ComponentType.BREAKER_3P && (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Номінал (A)</label><select className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.currentRating} onChange={(e) => updateProperty(selectedComp.id, 'currentRating', parseInt(e.target.value))}>{[6, 10, 16, 20, 25, 32, 40, 50, 63].map(v => <option key={v} value={v}>{v} A</option>)}</select></div>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Характеристика</label><select className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.breakerCurve || 'C'} onChange={(e) => updateProperty(selectedComp.id, 'breakerCurve', e.target.value)}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></div>
                                </>
                            )}
                            {selectedComp.type === ComponentType.THERMAL_RELAY && (() => {
                                const rangeLabel = selectedComp.properties?.relayRange || RELAY_RANGES[0].label;
                                const range = RELAY_RANGES.find(r => r.label === rangeLabel) || RELAY_RANGES[0];
                                return (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Діапазон</label><select className="w-full p-1 text-sm border rounded bg-white" value={rangeLabel} onChange={(e) => updateProperty(selectedComp.id, 'relayRange', e.target.value)}>{RELAY_RANGES.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}</select></div>
                                    <div className="space-y-1"><label className="text-xs text-gray-500">Налаштування (A)</label><input type="number" step="0.1" min={range.min} max={range.max} className="w-full p-1 text-sm border rounded bg-white" value={selectedComp.properties?.relaySetting} onChange={(e) => updateProperty(selectedComp.id, 'relaySetting', parseFloat(e.target.value))} /></div>
                                </>
                                )
                            })()}
                         </div>
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
}


class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private motorOscillators: Map<string, { osc: OscillatorNode[], gain: GainNode, hum: OscillatorNode, humGain: GainNode }> = new Map();
  private isMuted: boolean = false;
  private volume: number = 0.5;

  constructor() {
    try {
      // Defer initialization until interaction to satisfy browser policies
    } catch (e) {
      console.error("Audio API not supported");
    }
  }

  public init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.volume;
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(val: number) {
    // val 0 to 10
    this.volume = val / 10;
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx!.currentTime, 0.1);
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      const target = muted ? 0 : this.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx!.currentTime, 0.1);
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, startTime: number = 0) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);
    
    gain.gain.setValueAtTime(this.volume, this.ctx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(this.ctx.currentTime + startTime);
    osc.stop(this.ctx.currentTime + startTime + duration);
  }

  public playClick() {
    this.init();
    this.playTone(800, 'sine', 0.05);
  }

  public playSwitch() {
    this.init();
    this.playTone(600, 'triangle', 0.05);
    this.playTone(1200, 'sine', 0.02, 0.02);
  }

  public playContactor(close: boolean) {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    
    // Low mechanical clunk
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(close ? 150 : 120, this.ctx.currentTime);
    osc.type = 'square';
    
    gain.gain.setValueAtTime(this.volume * 0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public playBreaker(trip: boolean) {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    
    // Sharp snap
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(trip ? 2000 : 1500, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
    osc.type = 'sawtooth';
    
    gain.gain.setValueAtTime(this.volume * 0.8, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playShortCircuit() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    // White noise burst
    const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 sec
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

    noise.connect(gain);
    gain.connect(this.masterGain);
    noise.start();
  }

  public updateMotor(id: string, isRunning: boolean, rpm: number, stress: boolean = false) {
      if (!this.ctx || !this.masterGain) return;

      // If stopped and no stress (no phase error hum), silence it
      if (!isRunning && !stress) {
          if (this.motorOscillators.has(id)) {
              const m = this.motorOscillators.get(id)!;
              const now = this.ctx.currentTime;
              m.gain.gain.setTargetAtTime(0, now, 0.1);
              m.humGain.gain.setTargetAtTime(0, now, 0.1);
              m.osc.forEach(o => o.stop(now + 0.2));
              m.hum.stop(now + 0.2);
              this.motorOscillators.delete(id);
          }
          return;
      }

      // Calculate frequency based on RPM for MECHANICAL noise, not electrical frequency
      // Map 0-1500 RPM to 40Hz-400Hz (Audible range)
      const safeRpm = Math.max(rpm, 0); 
      // Base Mechanical pitch
      const baseFreq = 40 + (360 * (safeRpm / 1500)); 

      if (this.motorOscillators.has(id)) {
          // Update pitch
          const m = this.motorOscillators.get(id)!;
          m.osc[0].frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.1);
          m.osc[1].frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.1); // Harmonic
          
          // Stress Hum (100Hz vibration - Phase Loss or Stall)
          if (stress) {
               m.humGain.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.1);
          } else {
               m.humGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
          }

          // Main Motor Sound volume
          if (isRunning) {
              // Scale volume slightly with RPM so low speed isn't deafeningly loud
              const rpmVolScale = 0.3 + 0.7 * (Math.min(safeRpm, 1500) / 1500);
              m.gain.gain.setTargetAtTime(this.volume * 0.2 * rpmVolScale, this.ctx.currentTime, 0.1);
          } else {
              m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
          }

      } else {
          // Start new motor sound
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const hum = this.ctx.createOscillator();
          
          const gain = this.ctx.createGain();
          const humGain = this.ctx.createGain();

          osc1.type = 'triangle'; // Softer mechanical whir
          osc1.frequency.value = baseFreq;
          
          osc2.type = 'sine'; 
          osc2.frequency.value = baseFreq * 1.5;
          
          hum.type = 'sawtooth';
          hum.frequency.value = 100; // 100Hz electrical hum (constant)
          
          gain.gain.value = 0;
          humGain.gain.value = 0;

          if (isRunning) gain.gain.setTargetAtTime(this.volume * 0.2, this.ctx.currentTime, 0.5);
          if (stress) humGain.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.5);

          osc1.connect(gain);
          osc2.connect(gain);
          hum.connect(humGain);
          
          gain.connect(this.masterGain);
          humGain.connect(this.masterGain);

          osc1.start();
          osc2.start();
          hum.start();

          this.motorOscillators.set(id, { osc: [osc1, osc2], gain, hum, humGain });
      }
  }

  public stopAll() {
      this.motorOscillators.forEach(m => {
          m.gain.disconnect();
          m.humGain.disconnect();
          m.osc.forEach(o => o.stop());
          m.hum.stop();
      });
      this.motorOscillators.clear();
  }
}

export const soundEngine = new SoundEngine();

function createBrowserWaterContext(): AudioContext | undefined {
  return typeof window !== 'undefined' && window.AudioContext ? new AudioContext({ latencyHint: 'interactive' }) : undefined;
}

/** Original on-device water rush, valve squeal and hammer. No recording or downloaded sample. */
export class WaterAudio {
  private context?: AudioContext;
  private rush?: AudioBufferSourceNode;
  private rushGain?: GainNode;
  private filter?: BiquadFilterNode;
  private readonly sources = new Set<OscillatorNode>();
  private flow = 1;
  private disposed = false;

  constructor(private readonly createContext: () => AudioContext | undefined = createBrowserWaterContext) {}

  unlock(): void {
    if (this.disposed) return;
    if (!this.context) {
      try {
        const context = this.context = this.createContext(); if (!context) return;
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const samples = buffer.getChannelData(0); let seed = 0x57_41_54_52;
        for (let index = 0; index < samples.length; index++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; samples[index] = ((seed >>> 0) / 0xffffffff * 2 - 1) * .65; }
        this.rush = context.createBufferSource(); this.rush.buffer = buffer; this.rush.loop = true;
        this.filter = context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1400;
        this.rushGain = context.createGain(); this.rushGain.gain.value = this.flow * .045;
        this.rush.connect(this.filter); this.filter.connect(this.rushGain); this.rushGain.connect(context.destination);
        this.rush.start();
      } catch { this.dispose(); return; }
    }
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
  }

  setFlow(flow: number): void {
    this.flow = Math.max(0, Math.min(1, flow));
    if (this.context && this.rushGain) this.rushGain.gain.setTargetAtTime(this.flow * .045, this.context.currentTime, .22);
  }

  valve(): void { this.tone('sawtooth', 620, 390, .08, .013); }
  hammer(): void { this.tone('triangle', 88, 32, .4, .16); }

  private tone(type: OscillatorType, frequency: number, end: number, duration: number, volume: number): void {
    const context = this.context; if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator(), gain = context.createGain(), at = context.currentTime;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(context.destination); this.sources.add(oscillator);
    oscillator.onended = () => { this.sources.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + .01);
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    try { this.rush?.stop(); } catch {}
    this.rush?.disconnect(); this.rushGain?.disconnect(); this.filter?.disconnect();
    for (const source of this.sources) { try { source.stop(); } catch {} source.disconnect(); }
    this.sources.clear(); if (this.context) void this.context.close().catch(() => {});
    this.context = undefined; this.rush = undefined; this.rushGain = undefined; this.filter = undefined;
  }
}

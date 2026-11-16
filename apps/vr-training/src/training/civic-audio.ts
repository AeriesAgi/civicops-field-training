import { streetSoundSample } from './street-sound.js';
import { clampVolume } from './instructor-voice.js';

export type AudioCueId =
  | 'ui-tick' | 'breaker-clunk' | 'lock-click' | 'tag-rustle'
  | 'tester-live' | 'tester-dead' | 'proving-tone' | 'warning-buzz'
  | 'success-chime' | 'cert-stamp' | 'cone-thunk' | 'beacon-tick'
  | 'radio-squelch' | 'flare-pop' | 'siren-blip';
export interface AudioPosition { readonly x: number; readonly y: number; readonly z: number; }
export interface CueVoice {
  readonly waveform: OscillatorType | 'noise';
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly filter?: BiquadFilterType;
}

/** Original synthesis scores: no sampled/third-party audio and no runtime download. */
export const AUDIO_CUES = {
  'cone-thunk': [{ waveform: 'noise', start: 0, duration: .07, gain: .08, frequency: 320, filter: 'lowpass' }, { waveform: 'triangle', start: .01, duration: .12, gain: .07, frequency: 95, endFrequency: 45 }],
  'beacon-tick': [{ waveform: 'sine', start: 0, duration: .028, gain: .025, frequency: 720, endFrequency: 520 }],
  'radio-squelch': [
    { waveform: 'noise', start: 0, duration: .04, gain: .05, frequency: 1800, filter: 'bandpass' },
    { waveform: 'sine', start: .045, duration: .12, gain: .04, frequency: 940, endFrequency: 420 },
  ],
  'flare-pop': [
    { waveform: 'noise', start: 0, duration: .09, gain: .06, frequency: 1400, filter: 'bandpass' },
    { waveform: 'triangle', start: .02, duration: .16, gain: .04, frequency: 180, endFrequency: 70 },
  ],
  'siren-blip': [
    { waveform: 'sawtooth', start: 0, duration: .28, gain: .03, frequency: 620, endFrequency: 880 },
    { waveform: 'sawtooth', start: .3, duration: .28, gain: .025, frequency: 880, endFrequency: 540 },
  ],
  'ui-tick': [{ waveform: 'sine', start: 0, duration: 0.055, gain: 0.11, frequency: 1160, endFrequency: 880 }],
  'breaker-clunk': [
    { waveform: 'noise', start: 0, duration: 0.085, gain: 0.16, frequency: 760, filter: 'lowpass' },
    { waveform: 'triangle', start: 0.012, duration: 0.13, gain: 0.13, frequency: 104, endFrequency: 52 },
  ],
  'lock-click': [
    { waveform: 'noise', start: 0, duration: 0.04, gain: 0.1, frequency: 3100, filter: 'highpass' },
    { waveform: 'sine', start: 0.012, duration: 0.065, gain: 0.085, frequency: 880, endFrequency: 390 },
  ],
  'tag-rustle': [
    { waveform: 'noise', start: 0, duration: 0.13, gain: 0.055, frequency: 2600, filter: 'bandpass' },
    { waveform: 'noise', start: 0.09, duration: 0.11, gain: 0.04, frequency: 3900, filter: 'bandpass' },
  ],
  'tester-live': [{ waveform: 'sine', start: 0, duration: 0.17, gain: 0.105, frequency: 1380 }],
  'tester-dead': [
    { waveform: 'sine', start: 0, duration: 0.1, gain: 0.1, frequency: 1380 },
    { waveform: 'sine', start: 0.18, duration: 0.1, gain: 0.1, frequency: 1380 },
  ],
  'proving-tone': [{ waveform: 'sine', start: 0, duration: 0.19, gain: 0.1, frequency: 980, endFrequency: 1380 }],
  'warning-buzz': [
    { waveform: 'triangle', start: 0, duration: 0.19, gain: 0.1, frequency: 162, endFrequency: 136 },
    { waveform: 'triangle', start: 0.25, duration: 0.19, gain: 0.095, frequency: 162, endFrequency: 136 },
  ],
  'success-chime': [
    { waveform: 'sine', start: 0, duration: 0.27, gain: 0.1, frequency: 660 },
    { waveform: 'sine', start: 0.09, duration: 0.29, gain: 0.08, frequency: 880 },
    { waveform: 'sine', start: 0.21, duration: 0.34, gain: 0.065, frequency: 1320 },
  ],
  'cert-stamp': [
    { waveform: 'noise', start: 0, duration: 0.11, gain: 0.13, frequency: 580, filter: 'lowpass' },
    { waveform: 'triangle', start: 0, duration: 0.15, gain: 0.09, frequency: 132, endFrequency: 64 },
    { waveform: 'sine', start: 0.09, duration: 0.22, gain: 0.07, frequency: 1046 },
  ],
} as const satisfies Readonly<Record<AudioCueId, readonly CueVoice[]>>;

const FORWARD: AudioPosition = { x: 0, y: 0, z: -1 };
const UP: AudioPosition = { x: 0, y: 1, z: 0 };
const SILENCE = 0.0001;

export function audioCueDuration(id: AudioCueId): number {
  let duration = 0;
  for (const voice of AUDIO_CUES[id]) duration = Math.max(duration, voice.start + voice.duration);
  return duration;
}

function createBrowserContext(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const Context = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context({ latencyHint: 'interactive' }) : undefined;
}

/** Lazy context and cached noise/master. Source and panner nodes are only created on contact edges. */
export class CivicAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private volume = 0.7;
  private disposed = false;
  private roadAmbience?: GainNode;
  private rainAmbience?:GainNode;
  private rainSource?:AudioBufferSourceNode;
  private beaconLoop?: GainNode;
  private sceneHum?: GainNode;
  private sceneCrackle?: GainNode;
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private readonly activeOutputs = new Set<GainNode | PannerNode>();

  constructor(private readonly createContext: () => AudioContext | undefined = createBrowserContext) {}

  unlock(): void {
    if (this.disposed) return;
    if (!this.context) {
      try {
        this.context = this.createContext();
        if (!this.context) return;
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        let seed = 0x43_49_56_49;
        for (let index = 0; index < samples.length; index++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          samples[index] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
        }
      } catch { this.context = undefined; this.master = undefined; this.noise = undefined; return; }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  /** Original traffic wash and beacon relay tick. Buffers created once on entry. */
  startRoadAmbience(): void {
    const context = this.context;
    if (!context || !this.master || this.roadAmbience || this.disposed) return;
    for (const beacon of [false, true]) {
      const length = context.sampleRate * (beacon ? 4 : 12);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 0x524f4144, smooth = 0;
      for (let i = 0; i < samples.length; i++) {
        const seconds = i / context.sampleRate;
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        smooth += (((seed >>> 0) / 0xffffffff * 2 - 1) - smooth) * .025;
        const pulse = seconds % .8;
        samples[i] = beacon ? (pulse < .035 ? Math.sin(pulse * 720 * Math.PI * 2) * Math.exp(-pulse * 130) * .015 : 0)
          : streetSoundSample(seconds, smooth);
      }
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true; gain.gain.value = beacon ? 0 : 1;
      source.connect(gain); gain.connect(this.master); source.start();
      this.activeSources.add(source); this.activeOutputs.add(gain);
      if (beacon) this.beaconLoop = gain; else this.roadAmbience = gain;
    }
  }

  changeRainWeather(weather:'clear'|'drizzle'|'storm'):void {if(this.rainSource){this.rainSource.stop();this.rainSource.disconnect();this.activeSources.delete(this.rainSource);}if(this.rainAmbience){this.rainAmbience.disconnect();this.activeOutputs.delete(this.rainAmbience);}this.rainAmbience=undefined;this.rainSource=undefined;this.startRainAmbience(weather);}

  /** Original rain hiss and restrained thunder, no samples or external services. */
  startRainAmbience(weather:'clear'|'drizzle'|'storm'):void {
    const c=this.context;if(!c||!this.master||this.rainAmbience||weather==='clear')return;
    const b=c.createBuffer(1,c.sampleRate*12,c.sampleRate),s=b.getChannelData(0);let seed=0x5241494e,low=0;
    for(let i=0;i<s.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const noise=(seed>>>0)/0xffffffff*2-1;low+=(noise-low)*.004;const t=i/c.sampleRate;
      const thunder=weather==='storm'&&t>7&&t<10?Math.sin((t-7)*37*6.283)*Math.exp(-(t-7)*1.6)*.04:0;
      s[i]=noise*(weather==='storm'?.028:.012)+low*.12+thunder;}
    const source=c.createBufferSource(),gain=c.createGain();source.buffer=b;source.loop=true;gain.gain.value=.8;source.connect(gain);gain.connect(this.master);source.start();this.activeSources.add(source);this.activeOutputs.add(gain);this.rainAmbience=gain;this.rainSource=source;
  }

  /** Light-bar hum, flare crackle and one siren sweep. Buffers are built once, not per frame. */
  startSceneAmbience(): void {
    const context = this.context;
    if (!context || !this.master || this.sceneHum || this.disposed) return;
    const length = context.sampleRate * 4;
    const hum = context.createBuffer(1, length, context.sampleRate);
    const crackle = context.createBuffer(1, length, context.sampleRate);
    const siren = context.createBuffer(1, length, context.sampleRate);
    const humSamples = hum.getChannelData(0);
    const crackleSamples = crackle.getChannelData(0);
    const sirenSamples = siren.getChannelData(0);
    let seed = 0x5349524e;
    for (let index = 0; index < length; index += 1) {
      const seconds = index / context.sampleRate;
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      humSamples[index] = Math.sin(seconds * 96 * Math.PI * 2) * .012 + noise * .004;
      const burst = seconds % .37;
      crackleSamples[index] = burst < .02 ? noise * Math.exp(-burst * 80) * .05 : noise * .004;
      const glide = 520 + Math.sin(seconds * Math.PI * 2 / 4) * 180;
      const fade = Math.max(0, 1 - seconds / 4);
      sirenSamples[index] = Math.sin(seconds * glide * Math.PI * 2) * .02 * fade;
    }
    const connect = (buffer: AudioBuffer, loop: boolean) => {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = loop;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.master!);
      source.start();
      this.activeSources.add(source);
      this.activeOutputs.add(gain);
      return gain;
    };
    this.sceneHum = connect(hum, true);
    this.sceneCrackle = connect(crackle, true);
    connect(siren, false);
  }

  setSceneAmbience(active: boolean): void {
    if (!this.context) return;
    this.sceneHum?.gain.setTargetAtTime(active ? .7 : 0, this.context.currentTime, .2);
    this.sceneCrackle?.gain.setTargetAtTime(active ? .55 : 0, this.context.currentTime, .25);
  }

  setRoadAmbience(active: boolean, beacon: boolean): void {
    if (!this.context) return;
    this.rainAmbience?.gain.setTargetAtTime(active?.8:0,this.context.currentTime,.15);
    this.roadAmbience?.gain.setTargetAtTime(active ? 1 : 0, this.context.currentTime, .15);
    this.beaconLoop?.gain.setTargetAtTime(active && beacon ? 1 : 0, this.context.currentTime, .08);
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
  }

  /** Safe to call each frame with cached vectors; this method creates no objects or nodes. */
  setListenerPose(position: AudioPosition, forward: AudioPosition = FORWARD, up: AudioPosition = UP): void {
    const context = this.context;
    if (!context) return;
    const listener = context.listener;
    const time = context.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x, time);
      listener.positionY.setValueAtTime(position.y, time);
      listener.positionZ.setValueAtTime(position.z, time);
      listener.forwardX.setValueAtTime(forward.x, time);
      listener.forwardY.setValueAtTime(forward.y, time);
      listener.forwardZ.setValueAtTime(forward.z, time);
      listener.upX.setValueAtTime(up.x, time);
      listener.upY.setValueAtTime(up.y, time);
      listener.upZ.setValueAtTime(up.z, time);
    } else {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  play(id: AudioCueId, position?: AudioPosition): void {
    const context = this.context;
    const master = this.master;
    if (this.disposed || !context || !master || context.state !== 'running' || this.volume === 0) return;
    const output = position ? context.createPanner() : context.createGain();
    if (position) {
      const panner = output as PannerNode;
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 0.7;
      panner.maxDistance = 6;
      panner.rolloffFactor = 0.8;
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    }
    output.connect(master);
    this.activeOutputs.add(output);
    const voices: readonly CueVoice[] = AUDIO_CUES[id];
    let remaining = voices.length;
    for (const voice of voices) {
      const at = context.currentTime + voice.start;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(SILENCE, at);
      envelope.gain.exponentialRampToValueAtTime(voice.gain, at + Math.min(0.012, voice.duration * 0.2));
      envelope.gain.exponentialRampToValueAtTime(SILENCE, at + voice.duration);
      envelope.connect(output);
      let source: AudioScheduledSourceNode;
      let filter: BiquadFilterNode | undefined;
      if (voice.waveform === 'noise') {
        const bufferSource = context.createBufferSource();
        bufferSource.buffer = this.noise!;
        filter = context.createBiquadFilter();
        filter.type = voice.filter ?? 'lowpass';
        filter.frequency.setValueAtTime(voice.frequency, at);
        bufferSource.connect(filter);
        filter.connect(envelope);
        source = bufferSource;
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = voice.waveform;
        oscillator.frequency.setValueAtTime(voice.frequency, at);
        if (voice.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(voice.endFrequency, at + voice.duration);
        oscillator.connect(envelope);
        source = oscillator;
      }
      this.activeSources.add(source);
      source.onended = () => {
        source.disconnect();
        envelope.disconnect();
        filter?.disconnect();
        this.activeSources.delete(source);
        remaining--;
        if (remaining === 0) { output.disconnect(); this.activeOutputs.delete(output); }
      };
      source.start(at);
      source.stop(at + voice.duration + 0.005);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.activeSources) { try { source.stop(); } catch {} source.disconnect(); }
    for (const output of this.activeOutputs) output.disconnect();
    this.activeSources.clear();
    this.activeOutputs.clear();
    this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.noise = undefined;
  }
}

import { describe, expect, it, vi } from 'vitest';
import { AUDIO_CUES, CivicAudio, audioCueDuration, type AudioCueId } from './civic-audio.js';

function param() {
  return { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

function mockContext() {
  const gains: ReturnType<typeof gain>[] = [];
  const sources: ReturnType<typeof source>[] = [];
  function gain() { return { gain: param(), connect: vi.fn(), disconnect: vi.fn() }; }
  function source() {
    return { type: 'sine', frequency: param(), buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  }
  const panner = {
    panningModel: '', distanceModel: '', refDistance: 0, maxDistance: 0, rolloffFactor: 0,
    positionX: param(), positionY: param(), positionZ: param(), connect: vi.fn(), disconnect: vi.fn(),
  };
  const sample = new Float32Array(16);
  const listener = {
    positionX: param(), positionY: param(), positionZ: param(),
    forwardX: param(), forwardY: param(), forwardZ: param(), upX: param(), upY: param(), upZ: param(),
  };
  const context = {
    currentTime: 5, sampleRate: 16, state: 'running', destination: {}, listener,
    createGain: vi.fn(() => { const node = gain(); gains.push(node); return node; }),
    createBuffer: vi.fn(() => ({ getChannelData: () => sample })),
    createPanner: vi.fn(() => panner),
    createOscillator: vi.fn(() => { const node = source(); sources.push(node); return node; }),
    createBufferSource: vi.fn(() => { const node = source(); sources.push(node); return node; }),
    createBiquadFilter: vi.fn(() => ({ type: '', frequency: param(), connect: vi.fn(), disconnect: vi.fn() })),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
  return { context, gains, sources, panner, sample, listener, native: context as unknown as AudioContext };
}

describe('original audio cues', () => {
  it('covers every requested cue with finite restrained envelopes and distinct live/dead signals', () => {
    expect(Object.keys(AUDIO_CUES).sort()).toEqual([
      'ui-tick', 'breaker-clunk', 'lock-click', 'tag-rustle', 'tester-live', 'tester-dead',
      'proving-tone', 'warning-buzz', 'success-chime', 'cert-stamp', 'cone-thunk', 'beacon-tick',
      'radio-squelch', 'flare-pop', 'siren-blip',
    ].sort());
    for (const [id, voices] of Object.entries(AUDIO_CUES)) {
      expect(audioCueDuration(id as AudioCueId)).toBeLessThan(0.7);
      for (const voice of voices) {
        expect(voice.start).toBeGreaterThanOrEqual(0);
        expect(voice.duration).toBeGreaterThan(0);
        expect(voice.frequency).toBeGreaterThan(0);
        expect(voice.gain).toBeGreaterThan(0); expect(voice.gain).toBeLessThan(0.2);
      }
    }
    expect(AUDIO_CUES['tester-live']).toHaveLength(1);
    expect(AUDIO_CUES['tester-dead']).toHaveLength(2);
    expect(AUDIO_CUES['tester-dead'][1].start).toBeGreaterThan(AUDIO_CUES['tester-dead'][0].duration);
  });

  it('initialises once on a gesture, caches deterministic noise, and remains silent before unlock', () => {
    const mock = mockContext(); const create = vi.fn(() => mock.native); const audio = new CivicAudio(create);
    audio.play('breaker-clunk'); expect(create).not.toHaveBeenCalled();
    audio.unlock(); audio.unlock();
    expect(create).toHaveBeenCalledOnce(); expect(mock.context.createBuffer).toHaveBeenCalledOnce();
    expect(mock.sample.some((value) => value !== 0)).toBe(true);
    expect(Math.max(...mock.sample.map(Math.abs))).toBeLessThanOrEqual(1);
    const second = mockContext(); new CivicAudio(() => second.native).unlock();
    expect(second.sample).toEqual(mock.sample);
  });

  it('schedules the dead double-beep correctly at the object and disconnects finished voices', () => {
    const mock = mockContext(); const audio = new CivicAudio(() => mock.native); audio.unlock();
    audio.play('tester-dead', { x: -0.2, y: 1.1, z: -0.4 });
    expect(mock.panner).toMatchObject({ panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 0.7 });
    expect(mock.panner.positionX.value).toBe(-0.2); expect(mock.panner.positionY.value).toBe(1.1);
    expect(mock.sources).toHaveLength(2);
    expect(mock.sources[0].start).toHaveBeenCalledWith(5); expect(mock.sources[1].start).toHaveBeenCalledWith(5.18);
    expect(mock.sources[1].stop.mock.calls[0][0]).toBeCloseTo(5.285, 8);
    mock.sources[0].onended?.(); expect(mock.panner.disconnect).not.toHaveBeenCalled();
    mock.sources[1].onended?.(); expect(mock.panner.disconnect).toHaveBeenCalledOnce();
    expect(mock.sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it('controls the shared master gain and avoids allocating cue nodes when muted', () => {
    const mock = mockContext(); const audio = new CivicAudio(() => mock.native);
    audio.setVolume(2); audio.unlock(); expect(mock.gains[0].gain.value).toBe(1);
    audio.setVolume(-1); expect(mock.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 5, 0.015);
    audio.play('success-chime'); expect(mock.sources).toHaveLength(0);
    audio.setVolume(0.35); audio.play('lock-click'); expect(mock.sources).toHaveLength(2);
  });

  it('updates listener position/direction without allocating any playback nodes', () => {
    const mock = mockContext(); const audio = new CivicAudio(() => mock.native); audio.unlock();
    audio.setListenerPose({ x: 0.1, y: 1.25, z: 0.2 }, { x: 1, y: 0, z: 0 });
    expect(mock.listener.positionY.setValueAtTime).toHaveBeenCalledWith(1.25, 5);
    expect(mock.listener.forwardX.setValueAtTime).toHaveBeenCalledWith(1, 5);
    expect(mock.context.createGain).toHaveBeenCalledOnce(); expect(mock.context.createPanner).not.toHaveBeenCalled();
  });

  it('resumes a suspended context, and stops/disconnects sources on disposal', () => {
    const mock = mockContext(); mock.context.state = 'suspended';
    const audio = new CivicAudio(() => mock.native); audio.unlock(); expect(mock.context.resume).toHaveBeenCalledOnce();
    audio.play('ui-tick'); expect(mock.sources).toHaveLength(0);
    mock.context.state = 'running'; audio.play('ui-tick');
    audio.dispose(); audio.dispose(); audio.play('ui-tick');
    expect(mock.context.close).toHaveBeenCalledOnce(); expect(mock.sources).toHaveLength(1);
    expect(mock.sources[0].stop).toHaveBeenCalledTimes(2); expect(mock.sources[0].disconnect).toHaveBeenCalledOnce();
  });

  it('tolerates unavailable browser audio and context initialisation failures', () => {
    expect(() => { const audio = new CivicAudio(() => undefined); audio.unlock(); audio.play('ui-tick'); audio.dispose(); }).not.toThrow();
    expect(() => new CivicAudio(() => { throw new Error('unsupported'); }).unlock()).not.toThrow();
  });
});


describe('shared Roads synthesis', () => {
  it('builds ambience once, gates beacon separately and stops all loops', () => {
    const mock = mockContext(); const audio = new CivicAudio(() => mock.native);
    audio.unlock(); audio.startRoadAmbience(); audio.startRoadAmbience();
    expect(mock.context.createBufferSource).toHaveBeenCalledTimes(2);
    audio.setRoadAmbience(true, true);
    expect(mock.gains[mock.gains.length-1]?.gain.setTargetAtTime).toHaveBeenCalledWith(1, 5, .08);
    audio.setRoadAmbience(false, false); audio.dispose();
    expect(mock.sources.every(source => source.stop.mock.calls.length === 1)).toBe(true);
  });
});

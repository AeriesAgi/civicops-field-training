import { describe, expect, it, vi } from 'vitest';
import { WaterAudio } from './water-audio.js';

function context() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const gains: ReturnType<typeof gain>[] = [], sources: ReturnType<typeof source>[] = [];
  const gain = () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() });
  const source = () => ({ buffer: undefined, loop: false, type: 'sine', frequency: param(), onended: null as (() => void) | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  const fake = {
    sampleRate: 8, currentTime: 0, state: 'running', destination: {},
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => { const value = source(); sources.push(value); return value; },
    createOscillator: () => { const value = source(); sources.push(value); return value; },
    createBiquadFilter: () => ({ type: '', frequency: param(), connect: vi.fn(), disconnect: vi.fn() }),
    createGain: () => { const value = gain(); gains.push(value); return value; },
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  return { fake, gains, sources, audioContext: fake as unknown as AudioContext };
}

describe('original Water audio lifecycle', () => {
  it('starts a single reusable rush loop across repeated hand actions', () => {
    const fixture = context(); const factory = vi.fn(() => fixture.audioContext); const audio = new WaterAudio(factory);
    audio.unlock(); audio.unlock(); expect(factory).toHaveBeenCalledTimes(1);
    expect(fixture.sources).toHaveLength(1); expect(fixture.sources[0].loop).toBe(true);
    expect(fixture.sources[0].start).toHaveBeenCalledTimes(1); audio.dispose();
  });
  it('silences the rush as the main is isolated and clamps out-of-range flow', () => {
    const fixture = context(); const audio = new WaterAudio(() => fixture.audioContext); audio.unlock();
    audio.setFlow(0); expect(fixture.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .22);
    audio.setFlow(3); expect(fixture.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.045, 0, .22);
    audio.setFlow(-1); expect(fixture.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .22); audio.dispose();
  });
  it('stops the rush and active cues, closes once, and cannot restart after switching away', () => {
    const fixture = context(); const factory = vi.fn(() => fixture.audioContext); const audio = new WaterAudio(factory);
    audio.unlock(); audio.valve(); audio.hammer(); audio.dispose(); audio.dispose(); audio.unlock();
    expect(fixture.sources[0].stop).toHaveBeenCalledTimes(1);
    for (const source of fixture.sources) expect(source.disconnect).toHaveBeenCalled();
    expect(fixture.fake.close).toHaveBeenCalledTimes(1); expect(factory).toHaveBeenCalledTimes(1);
  });
  it('keeps captions and procedure usable when audio is unavailable', () => {
    const audio = new WaterAudio(() => undefined);
    expect(() => { audio.unlock(); audio.setFlow(0); audio.valve(); audio.hammer(); audio.dispose(); }).not.toThrow();
  });
});

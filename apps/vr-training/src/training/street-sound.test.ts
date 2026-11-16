import { describe, expect, it } from 'vitest';
import { streetSoundSample } from './street-sound.js';
describe('original street bed', () => {
  it('keeps a quiet bounded mix below the task cues', () => {
    for (let t = 0; t < 12; t += 1 / 8000) {
      const value = streetSoundSample(t, Math.sin(t * 13));
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(.08);
    }
  });
  it('has a seamless twelve-second boundary and separate distant horn and bird moments', () => {
    expect(streetSoundSample(12, 0)).toBeCloseTo(streetSoundSample(0, 0), 8);
    expect(streetSoundSample(6.53, 0)).not.toBe(streetSoundSample(.53, 0));
    expect(streetSoundSample(9.87, 0)).not.toBe(streetSoundSample(3.87, 0));
  });
});

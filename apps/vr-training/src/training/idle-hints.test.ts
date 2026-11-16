import { describe, expect, it } from 'vitest';
import { IdleHintTimer } from './idle-hints.js';

describe('instructor idle hints', () => {
  it('leaves a requested Why explanation undisturbed for a fresh 15 seconds', () => {
    const timer = new IdleHintTimer();
    expect(timer.tick(14, true)).toBe(false);
    timer.reset();
    expect(timer.tick(6, true)).toBe(false);
    expect(timer.tick(8.9, true)).toBe(false);
    expect(timer.tick(0.1, true)).toBe(true);
  });

  it.each(['settings tray', 'ghost demonstration', 'safe-to-work hold'])('counts a fresh interval after the %s closes', () => {
    const timer = new IdleHintTimer();
    expect(timer.tick(14, true)).toBe(false);
    expect(timer.tick(20, false)).toBe(false);
    expect(timer.tick(14.9, true)).toBe(false);
    expect(timer.tick(0.1, true)).toBe(true);
  });

  it('does not accumulate hints in a completed lesson or before a fresh visit begins', () => {
    const timer = new IdleHintTimer();
    expect(timer.tick(14, true)).toBe(false);
    expect(timer.tick(60, false)).toBe(false);
    expect(timer.tick(60, false)).toBe(false);
    expect(timer.tick(14, true)).toBe(false);
    expect(timer.tick(1, true)).toBe(true);
  });

  it('ignores negative and nonfinite deltas without corrupting the next hint', () => {
    const timer = new IdleHintTimer();
    expect(timer.tick(10, true)).toBe(false);
    for (const delta of [-1, -100, NaN, Infinity, -Infinity]) expect(timer.tick(delta, true)).toBe(false);
    expect(timer.tick(4, true)).toBe(false);
    expect(timer.tick(1, true)).toBe(true);
  });

  it('emits at most one hint for a delayed frame, then starts another full interval', () => {
    const timer = new IdleHintTimer();
    expect(timer.tick(45, true)).toBe(true);
    expect(timer.tick(0, true)).toBe(false);
    expect(timer.tick(0, true)).toBe(false);
    expect(timer.tick(14, true)).toBe(false);
    expect(timer.tick(1, true)).toBe(true);
  });

  it('uses a valid custom interval and falls back to 15 seconds for invalid intervals', () => {
    const custom = new IdleHintTimer(5);
    expect(custom.tick(4, true)).toBe(false);
    expect(custom.tick(1, true)).toBe(true);
    for (const interval of [0, -10, NaN, Infinity]) {
      const timer = new IdleHintTimer(interval);
      expect(timer.delaySeconds).toBe(15);
      expect(timer.tick(14, true)).toBe(false);
      expect(timer.tick(1, true)).toBe(true);
    }
  });
});

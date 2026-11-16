import { describe, expect, it } from 'vitest';
import { KeySocketExitGuard, ValveRollTracker, wristRollDelta, valveSnapDistanceSquared, WATER_KEY_SNAP_RADIUS } from './water-interaction.js';

describe('hands-only water interaction', () => {
  it('unwraps the wrist boundary without inventing a full turn', () => {
    expect(wristRollDelta(Math.PI - .1, -Math.PI + .1)).toBeCloseTo(.2);
    expect(wristRollDelta(-Math.PI + .1, Math.PI - .1)).toBeCloseTo(-.2);
  });
  it('measures a slow quarter turn and its true duration', () => {
    const tracker = new ValveRollTracker(); tracker.begin(0);
    for (let index = 1; index <= 10; index++) tracker.sample(index * Math.PI / 20, .1);
    expect(tracker.take()).toBe(true);
    expect(tracker.turns).toBeCloseTo(.25);
    expect(tracker.durationMs).toBeCloseTo(1000);
    expect(tracker.take()).toBe(false);
  });
  it('preserves opening direction', () => {
    const tracker = new ValveRollTracker(); tracker.begin(0); tracker.sample(-Math.PI / 2, 1);
    expect(tracker.take()).toBe(true); expect(tracker.turns).toBeCloseTo(-.25);
  });
  it('stationary waiting cannot hide a fast closure', () => {
    const tracker = new ValveRollTracker(); tracker.begin(0);
    for (let index = 0; index < 100; index++) tracker.sample(0, .1);
    tracker.sample(Math.PI / 2, .05); expect(tracker.take()).toBe(true);
    expect(tracker.durationMs).toBeCloseTo(50);
    expect(tracker.turns / (tracker.durationMs / 1000)).toBeGreaterThan(.75);
  });
  it('a regrip does not create movement', () => {
    const tracker = new ValveRollTracker(); tracker.begin(2); tracker.sample(2.01, .1);
    tracker.begin(-2); tracker.sample(-2, .1); expect(tracker.take(true)).toBe(false);
  });
  it('drops a lost tracking orientation and ignores nonfinite input', () => {
    const tracker = new ValveRollTracker(); tracker.begin(0); tracker.sample(Math.PI, .1);
    tracker.sample(Number.NaN, .1); expect(tracker.take(true)).toBe(false);
    expect(wristRollDelta(0, Number.NaN)).toBe(0);
  });
  it('flushes small valid movements on release', () => {
    const tracker = new ValveRollTracker(); tracker.begin(0); tracker.sample(.2, .3);
    expect(tracker.take()).toBe(false); expect(tracker.take(true)).toBe(true);
    expect(tracker.turns).toBeCloseTo(.2 / (2 * Math.PI));
  });
  it('uses a seated-reach snap radius without accepting another box', () => {
    expect(valveSnapDistanceSquared(.02, .02, .02)).toBeLessThan(WATER_KEY_SNAP_RADIUS ** 2);
    expect(valveSnapDistanceSquared(.8, 0, 0)).toBeGreaterThan(WATER_KEY_SNAP_RADIUS ** 2);
  });
});

describe('valve key transfer', () => {
  it('blocks recapture while the hand has moved but the key is still seated', () => {
    const guard = new KeySocketExitGuard<'A' | 'B'>();
    guard.beginExit('A'); guard.observeExit(0);
    expect(guard.canSeat('A')).toBe(false);
    expect(guard.canSeat('B')).toBe(true);
    guard.observeExit(.04 ** 2); expect(guard.canSeat('A')).toBe(false);
  });
  it('permits a new seating only after the physical key clears the socket', () => {
    const guard = new KeySocketExitGuard<'A' | 'B'>(); guard.beginExit('A');
    guard.observeExit(WATER_KEY_SNAP_RADIUS ** 2); expect(guard.canSeat('A')).toBe(false);
    guard.observeExit((WATER_KEY_SNAP_RADIUS + .001) ** 2); expect(guard.canSeat('A')).toBe(true);
    guard.beginExit('B'); expect(guard.canSeat('B')).toBe(false); expect(guard.canSeat('A')).toBe(true);
  });
  it('does not interpret a lost tracking distance as clearance', () => {
    const guard = new KeySocketExitGuard<'A'>(); guard.beginExit('A');
    guard.observeExit(Number.NaN); guard.observeExit(Infinity);
    expect(guard.canSeat('A')).toBe(false);
  });
  it('resets the socket guard for a fresh module attempt', () => {
    const guard = new KeySocketExitGuard<'A'>(); guard.beginExit('A'); guard.reset();
    expect(guard.canSeat('A')).toBe(true);
  });
});

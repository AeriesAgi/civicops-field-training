import { describe, expect, it } from 'vitest';
import { HoldConfirm } from './hold-confirm.js';

describe('deliberate safe-to-work confirmation', () => {
  it('requires a continuous 800ms hold', () => {
    const hold = new HoldConfirm(); hold.begin(true); hold.tick(.79);
    expect(hold.ready).toBe(false); expect(hold.release(true)).toBe(false);
    hold.begin(true); hold.tick(.8); expect(hold.ready).toBe(true);
    expect(hold.release(true)).toBe(true); expect(hold.release(true)).toBe(false);
  });
  it('cancels on release rather than accumulating separate presses', () => {
    const hold = new HoldConfirm(); hold.begin(true); hold.tick(.5); hold.release(true);
    hold.begin(true); hold.tick(.5); expect(hold.release(true)).toBe(false);
  });
  it('rejects a hold on an ineligible step and changed eligibility', () => {
    const hold = new HoldConfirm(); hold.begin(false); hold.tick(2);
    expect(hold.release(true)).toBe(false);
    hold.begin(true); hold.tick(1); expect(hold.release(false)).toBe(false);
  });
  it('clamps negative time and progress, with explicit cancellation', () => {
    const hold = new HoldConfirm(); hold.begin(true); hold.tick(-1);
    expect(hold.progress).toBe(0); hold.tick(10); expect(hold.progress).toBe(1);
    hold.cancel(); expect(hold.ready).toBe(false); expect(hold.pressed).toBe(false);
  });
  it('starts elapsed time at pointer press rather than the previous frame', () => {
    const hold = new HoldConfirm(); hold.begin(true, 10);
    hold.advanceAt(10); expect(hold.progress).toBe(0);
    hold.advanceAt(10.2); expect(hold.ready).toBe(false);
    hold.advanceAt(10.81); expect(hold.ready).toBe(true);
  });
  it('does not accumulate repeated absolute clock samples', () => {
    const hold = new HoldConfirm(); hold.begin(true, 3);
    hold.advanceAt(3.5); hold.advanceAt(3.5);
    expect(hold.progress).toBeCloseTo(.625);
    expect(hold.release(true)).toBe(false);
  });

});

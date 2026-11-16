import { describe, expect, it, vi } from 'vitest';
import { PointerPressLatch } from './pointer-press.js';

describe('button pointer release ownership', () => {
  it('captures the exact pressed target after ownership is established', () => {
    const latch = new PointerPressLatch();
    const target = { setPointerCapture: vi.fn((id: number) => { expect(id).toBe(21); expect(latch.pressed).toBe(true); }) };
    latch.press(21, target);
    expect(target.setPointerCapture).toHaveBeenCalledOnce();
    expect(latch.release(21)).toBe(true); expect(latch.release(21)).toBe(false);
  });
  it('never requests SDK capture for an invalid pointer identity', () => {
    const latch = new PointerPressLatch(), target = { setPointerCapture: vi.fn() };
    for (const id of [NaN, Infinity, -Infinity]) latch.press(id, target);
    expect(target.setPointerCapture).not.toHaveBeenCalled(); expect(latch.pressed).toBe(false);
  });
  it('keeps the captured owner through other-hand cancellation and rejects an up after panel reset', () => {
    const latch = new PointerPressLatch(), target = { setPointerCapture: vi.fn() };
    latch.press(21, target); expect(latch.cancel(22)).toBe(false); expect(latch.pressed).toBe(true);
    latch.reset(); expect(latch.release(21)).toBe(false);
  });
  it('rejects an orphan up produced by a ray leaving a previously hovered button', () => {
    const latch = new PointerPressLatch();
    expect(latch.release(1)).toBe(false); expect(latch.pressed).toBe(false);
  });
  it('fires once for the pointer that pressed and rejects duplicate releases', () => {
    const latch = new PointerPressLatch(); latch.press(0);
    expect(latch.pressed).toBe(true); expect(latch.release(0)).toBe(true);
    expect(latch.pressed).toBe(false); expect(latch.release(0)).toBe(false);
  });
  it('rejects the other hand releasing without consuming the owning hand press', () => {
    const latch = new PointerPressLatch(); latch.press(11);
    expect(latch.release(12)).toBe(false); expect(latch.pressed).toBe(true);
    expect(latch.release(11)).toBe(true);
  });
  it('cancels only the matching pointer and rejects its later up', () => {
    const latch = new PointerPressLatch(); latch.press(4);
    expect(latch.cancel(5)).toBe(false); expect(latch.pressed).toBe(true);
    expect(latch.cancel(4)).toBe(true); expect(latch.release(4)).toBe(false);
    expect(latch.cancel(4)).toBe(false);
  });
  it('gives an overwritten press to the latest pointer without firing for the first', () => {
    const latch = new PointerPressLatch(); latch.press(3); latch.press(8);
    expect(latch.release(3)).toBe(false); expect(latch.cancel(3)).toBe(false);
    expect(latch.release(8)).toBe(true); expect(latch.release(8)).toBe(false);
  });
  it('keeps repeated downs from producing more than one eventual action', () => {
    const latch = new PointerPressLatch(); latch.press(3); latch.press(3);
    expect(latch.release(3)).toBe(true); expect(latch.release(3)).toBe(false);
  });
  it('clears capture on panel reset and ignores invalid pointer identities', () => {
    const latch = new PointerPressLatch(); latch.press(7); latch.reset();
    expect(latch.release(7)).toBe(false);
    for (const id of [NaN, Infinity, -Infinity]) {
      latch.press(id); expect(latch.pressed).toBe(false); expect(latch.release(id)).toBe(false);
    }
  });
});

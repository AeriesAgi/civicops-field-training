import { describe, expect, it, vi } from 'vitest';
import { createPokeDepression, sampleDemoPose, type DemoPose } from './gesture-feedback';

const fresh = (): DemoPose => ({ approach: 0, curl: 0, pinch: 0, opacity: 0, ring: 0 });

describe('poke depression property updates', () => {
  it('changes UIKit depth only on press and restore, without frame property updates', () => {
    const setPressed = vi.fn(), depress = createPokeDepression(setPressed);
    depress(0); depress(1);
    for (let frame = 17; frame > 0; frame--) depress(frame / 18);
    expect(setPressed.mock.calls).toEqual([[true]]);
    depress(0); depress(0);
    expect(setPressed.mock.calls).toEqual([[true], [false]]);
  });
  it('supports an interrupted contact restoring before the next contact', () => {
    const setPressed = vi.fn(), depress = createPokeDepression(setPressed);
    depress(1); depress(.5); depress(0); depress(1); depress(0);
    expect(setPressed.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});

describe('instructor hand pose timing', () => {
  it('extends the index while folding the other fingers for a deliberate poke', () => {
    const pose = fresh(); sampleDemoPose('poke', 1.2, pose);
    expect(pose.approach).toBe(1); expect(pose.curl).toBe(.8); expect(pose.pinch).toBe(0);
    expect(pose.opacity).toBe(.48); expect(pose.ring).toBe(0);
  });
  it('closes thumb and index only as the grabbing demonstration reaches the prop', () => {
    const pose = fresh(); sampleDemoPose('pinch-grab', .45, pose);
    expect(pose.pinch).toBe(.5); expect(pose.approach).toBe(.5);
    sampleDemoPose('pinch-grab', 1.3, pose); expect(pose.pinch).toBe(1);
  });
  it('keeps the object pinched through placement and releases on withdrawal', () => {
    const pose = fresh(); sampleDemoPose('place', 1.2, pose); expect(pose.pinch).toBe(1);
    sampleDemoPose('place', 3.4, pose); expect(pose.pinch).toBe(0); expect(pose.approach).toBe(0);
  });
  it('demonstrates a sustained confirmation and resets progress for a repeated lesson', () => {
    const pose = fresh(); sampleDemoPose('hold-to-confirm', .9, pose); expect(pose.ring).toBe(0);
    sampleDemoPose('hold-to-confirm', 1.7, pose); expect(pose.ring).toBeCloseTo(.5);
    sampleDemoPose('hold-to-confirm', 2.5, pose); expect(pose.ring).toBe(1);
    sampleDemoPose('hold-to-confirm', 3.6, pose); expect(pose.ring).toBe(0); expect(pose.opacity).toBe(0);
  });
  it('mutates the same bounded pose for invalid times without corrupting the rig', () => {
    const pose = fresh();
    for (const elapsed of [-1, 0, .02, 1, 3.59, 100, NaN, Infinity]) {
      sampleDemoPose('poke', elapsed, pose);
      for (const value of Object.values(pose)) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1); }
    }
  });
});

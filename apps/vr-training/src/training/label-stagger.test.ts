import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HAZARD_LABEL, hazardLabelScale, labelViewBox, labelsOverlap, staggerLabelHeights } from './label-stagger';

const head = { x: 0, y: 1.6, z: 0 };
function noOverlaps(anchors: { x: number; z: number }[], heights: number[]): boolean {
  for (let i = 0; i < anchors.length; i += 1) for (let j = i + 1; j < anchors.length; j += 1) {
    if (labelsOverlap(labelViewBox(head, anchors[i], heights[i]), labelViewBox(head, anchors[j], heights[j]))) return false;
  }
  return true;
}

describe('hazard label stagger', () => {
  it('matches the distance scale the labels are drawn at', () => {
    expect(hazardLabelScale(2)).toBe(1);
    expect(hazardLabelScale(7)).toBe(2);
  });
  it('leaves labels in different directions at the authored height', () => {
    const anchors = [{ x: 4, z: -4 }, { x: -4, z: -4 }, { x: 0, z: 6 }];
    expect(staggerLabelHeights(head, anchors)).toEqual([HAZARD_LABEL.baseY, HAZARD_LABEL.baseY, HAZARD_LABEL.baseY]);
  });
  it('lifts a farther label that lines up behind a nearer one', () => {
    const anchors = [{ x: 0, z: -9 }, { x: 0, z: -5 }];
    expect(labelsOverlap(labelViewBox(head, anchors[0], HAZARD_LABEL.baseY), labelViewBox(head, anchors[1], HAZARD_LABEL.baseY))).toBe(true);
    const heights = staggerLabelHeights(head, anchors);
    expect(heights[1]).toBe(HAZARD_LABEL.baseY);
    expect(heights[0]).toBeGreaterThan(HAZARD_LABEL.baseY);
    expect(noOverlaps(anchors, heights)).toBe(true);
  });
  it('clears a three-deep line of hazards without stacking past the tier cap', () => {
    const anchors = [{ x: 0.3, z: -13 }, { x: 0, z: -5 }, { x: -0.2, z: -9 }];
    const heights = staggerLabelHeights(head, anchors);
    expect(noOverlaps(anchors, heights)).toBe(true);
    const top = HAZARD_LABEL.baseY + HAZARD_LABEL.maxTiers * HAZARD_LABEL.heightM * hazardLabelScale(13) * HAZARD_LABEL.gap;
    for (const y of heights) expect(y).toBeLessThanOrEqual(top + 1e-9);
  });
  it('ignores hidden labels beyond the 14 m budget', () => {
    const anchors = [{ x: 0, z: -20 }, { x: 0, z: -12 }];
    expect(staggerLabelHeights(head, anchors)).toEqual([HAZARD_LABEL.baseY, HAZARD_LABEL.baseY]);
  });
  it('gives the same layout whatever order the hazards arrive in', () => {
    const a = [{ x: 0, z: -9 }, { x: 0, z: -5 }, { x: 0.2, z: -12 }];
    const forward = staggerLabelHeights(head, a);
    const reversed = staggerLabelHeights(head, [...a].reverse()).reverse();
    expect(reversed).toEqual(forward);
  });
  it('is wired into the AR hazard labels every frame', () => {
    const source = readFileSync('src/field-assist-system.ts', 'utf8');
    const hazard = source.slice(source.indexOf("if (this.screen === 'hazard') {"));
    expect(hazard).toMatch(/const heights = staggerLabelHeights\(this\.head, labelAnchors\)/);
    expect(hazard).toMatch(/marker\.label\.mesh\.position\.y = heights\[index\]/);
    expect(hazard).toMatch(/marker\.label\.mesh\.scale\.setScalar\(hazardLabelScale\(d\)\)/);
  });
});

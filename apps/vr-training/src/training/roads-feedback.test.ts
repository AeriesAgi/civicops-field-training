import { describe, expect, it } from 'vitest';
import { buildRoadsRulerSurface, roadFeedbackMarker, roadTrafficCaption } from './roads-feedback.js';
import { ROADS_GEOMETRY } from './roads-geometry.js';
import type { TrafficReaction } from './roads-traffic.js';

const normalReactions: readonly TrafficReaction[] = ['cruise', 'slow', 'merge', 'stop'];

describe('visible Roads safety feedback', () => {
  it('gives every actual ruler triangle an upward normal, so front-side rendering is visible from above', () => {
    const positions = buildRoadsRulerSurface();
    expect(positions).toHaveLength(13 * 2 * 3 * 3);
    for (let i = 0; i < positions.length; i += 9) {
      const ab = positions.slice(i + 3, i + 6).map((value, axis) => value - positions[i + axis]);
      const ac = positions.slice(i + 6, i + 9).map((value, axis) => value - positions[i + axis]);
      const normalY = ab[2] * ac[0] - ab[0] * ac[2];
      expect(normalY).toBeGreaterThan(0);
      expect(ab[1]).toBe(0); expect(ac[1]).toBe(0);
    }
  });
  it('keeps the ruler above the road and clear of both raised kerbs', () => {
    const positions = buildRoadsRulerSurface();
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      xs.push(positions[i]); zs.push(positions[i + 2]);
      expect(positions[i + 1]).toBeGreaterThan(.10);
      expect(positions[i + 2]).toBeGreaterThan(ROADS_GEOMETRY.road.minZ);
      expect(positions[i + 2]).toBeLessThan(ROADS_GEOMETRY.road.maxZ);
    }
    expect(Math.min(...zs)).toBeCloseTo(0, 10);
    expect(Math.max(...zs)).toBeCloseTo(.30, 10);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 10);
  });
  it('retains at least 3mm tick width in the shortest supported taper hint', () => {
    const positions = buildRoadsRulerSurface();
    const scaledTickWidth = (positions[3] - positions[0]) * 6 / 6;
    expect(scaledTickWidth).toBeGreaterThanOrEqual(.003);
    expect(positions[positions.length - 1]).toBeCloseTo(.30, 10);
  });
  it('lifts feedback above the kerb and separates a cone marker from its foot', () => {
    const [x, y, z] = roadFeedbackMarker(-4.5, 2.75);
    expect(x).toBe(-4.5); expect(y).toBeGreaterThan(.10);
    expect(2.75 - z - .014).toBeGreaterThan(ROADS_GEOMETRY.coneHalfWidth);
  });
  it.each(normalReactions)('keeps an unsafe %s demonstration visibly unsafe', reaction => {
    expect(roadTrafficCaption(reaction, true)).toBe('UNSAFE / Repair the zone');
    expect(roadTrafficCaption(reaction, false)).not.toContain('UNSAFE');
  });
  it.each(['hard-brake', 'cone-contact'] as const)('preserves actual %s feedback after a failed demonstration', reaction => {
    const caption = roadTrafficCaption(reaction, true);
    expect(caption).toBe(roadTrafficCaption(reaction, false));
    expect(caption).toContain(reaction === 'hard-brake' ? 'BRAKING' : 'CONTACT');
  });
});

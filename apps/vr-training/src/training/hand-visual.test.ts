import { describe, expect, it } from 'vitest';
import { gloveAccentForDistance } from './hand-visual';

describe('work glove cuff', () => {
  it('keeps the wrist opening, fingers and invalid tracking geometry unaccented', () => {
    for (const distance of [-1, 0, .014, .048, .16, NaN, Infinity]) {
      expect(gloveAccentForDistance(distance)).toBe(0);
    }
  });
  it('makes a fully visible cuff without spilling into the palm', () => {
    expect(gloveAccentForDistance(.03)).toBe(1);
    expect(gloveAccentForDistance(.0165)).toBeCloseTo(.5);
    expect(gloveAccentForDistance(.0455)).toBeCloseTo(.5);
  });
});

import { fingertipGlowForDistance, handShimmerForAge } from './hand-visual';

describe('hands-only contact cues', () => {
  it('starts the fingertip glow before contact and clamps at the fingertip surface', () => {
    expect(fingertipGlowForDistance(.07)).toBe(0);
    expect(fingertipGlowForDistance(.045)).toBeCloseTo(.5);
    expect(fingertipGlowForDistance(.02)).toBe(1);
    expect(fingertipGlowForDistance(0)).toBe(1);
    expect(fingertipGlowForDistance(NaN)).toBe(0);
  });
  it('materialises each new tracking connection in less than half a second', () => {
    expect(handShimmerForAge(0)).toBe(1);
    expect(handShimmerForAge(.225)).toBe(.5);
    expect(handShimmerForAge(.45)).toBe(0);
    expect(handShimmerForAge(2)).toBe(0);
    expect(handShimmerForAge(-1)).toBe(0);
  });
});

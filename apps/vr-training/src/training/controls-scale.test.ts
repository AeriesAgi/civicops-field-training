import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { applyModuleAccessibility, CONTROLS_SCALE } from '../module-accessibility';
import { DEFAULT_SETTINGS } from './accessibility-settings';

const panels = new Map([['steps', { getElementById: () => ({ setProperties: () => {} }) }]]) as never;

describe('larger text sizes enlarge the module controls panel', () => {
  it('scales the whole controls panel so its fixed button rows never re-wrap', () => {
    expect(CONTROLS_SCALE).toEqual({ M: 1, L: 1.15, XL: 1.3 });
    for (const size of ['M', 'L', 'XL'] as const) {
      const controls = new Object3D();
      applyModuleAccessibility({ ...DEFAULT_SETTINGS, captionSize: size }, { panels, captionPanel: 'steps', captionFontSize: 2.7, steps: new Object3D(), controls });
      expect(controls.scale.toArray()).toEqual([CONTROLS_SCALE[size], CONTROLS_SCALE[size], CONTROLS_SCALE[size]]);
    }
  });
  it('keeps an authored scale and stays idempotent across reloads', () => {
    const controls = new Object3D(); controls.scale.setScalar(0.8);
    const options = { panels, captionPanel: 'steps', captionFontSize: 2.7, steps: new Object3D(), controls };
    applyModuleAccessibility({ ...DEFAULT_SETTINGS, captionSize: 'XL' }, options);
    applyModuleAccessibility({ ...DEFAULT_SETTINGS, captionSize: 'XL' }, options);
    expect(controls.scale.x).toBeCloseTo(0.8 * 1.3, 9);
    applyModuleAccessibility({ ...DEFAULT_SETTINGS, captionSize: 'M' }, options);
    expect(controls.scale.x).toBeCloseTo(0.8, 9);
  });
  it('is applied in all four programmes', () => {
    for (const file of ['training-system.ts', 'water-training-system.ts', 'roads-training-system.ts', 'scene-safety-training-system.ts']) {
      expect(readFileSync(`src/${file}`, 'utf8')).toMatch(/applyModuleAccessibility\([^;]*controls: this\.world\.getSceneEntity\('[a-z-]*controls-panel'\)\?\.object3D/);
    }
  });
});

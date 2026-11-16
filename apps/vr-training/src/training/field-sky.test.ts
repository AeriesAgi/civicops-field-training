import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIELD_MODULES, FIELD_SKY, FIRE_SKY, isFieldModule } from './field-sky.js';

describe('field sky contract', () => {
  it('wraps the walk-around lessons and stays outside the fog band', () => {
    expect(FIELD_MODULES).toEqual(['elec-loto', 'water-burst', 'roads-zone', 'scene-safety']);
    expect(isFieldModule('board')).toBe(false);
    expect(isFieldModule('scene-safety')).toBe(true);
    expect(isFieldModule('elec-loto')).toBe(true);
    expect(FIRE_SKY.top).not.toBe(FIELD_SKY.top);
    expect(FIELD_SKY.radius).toBeGreaterThan(FIELD_SKY.fogFar);
    expect(FIELD_SKY.fogNear).toBeGreaterThan(40);
    expect(FIELD_SKY.fogFar).toBeLessThan(FIELD_SKY.radius);
  });

  it('is registered once and does not record people or media', () => {
    const source = readFileSync(new URL('../field-sky-system.ts', import.meta.url), 'utf8');
    const index = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    for (const name of ['main','water','roads','fire']) {
      const scene=JSON.parse(readFileSync(new URL('../../public/scenes/'+name+'.iwsdk.scene.json', import.meta.url),'utf8'));
      const ibl=scene.components['com.iwsdk.components.IBLTexture'];
      const dome=scene.components['com.iwsdk.components.DomeTexture'];
      expect(ibl.src).toBe(name==='roads'?'./textures/storm-sky.hdr':'./textures/street-sky.hdr');
      expect(dome.src).toBe(ibl.src);
      expect(dome.intensity).toBeGreaterThan(0);
    }
    expect(source).toContain('scene.fog');
    expect(index).toContain('FieldSkySystem');
    expect(source.toLowerCase()).not.toContain('face');
    expect(source.toLowerCase()).not.toContain('biometric');
    expect(source).not.toContain('MediaRecorder');
  });
});

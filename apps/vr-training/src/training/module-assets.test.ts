import { describe, expect, it, vi } from 'vitest';
import { MODULE_MODEL_IDS, retireModelResources } from './module-assets';

describe('module asset retirement', () => {
  it('retires module resources once and keeps shared depot materials and textures', () => {
    const geometry = { dispose: vi.fn() }, material = { dispose: vi.fn() }, texture = { dispose: vi.fn() };
    const depotMaterial = { dispose: vi.fn() }, atlas = { dispose: vi.fn() };
    const models = [{ geometries: [geometry], materials: [material, depotMaterial], textures: [texture, atlas] }, { geometries: [geometry], materials: [material], textures: [texture, atlas] }];
    retireModelResources(models, { materials: new Set([depotMaterial]), textures: new Set([atlas]) });
    expect(geometry.dispose).toHaveBeenCalledTimes(1); expect(material.dispose).toHaveBeenCalledTimes(1); expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(depotMaterial.dispose).not.toHaveBeenCalled(); expect(atlas.dispose).not.toHaveBeenCalled();
  });
  it('never evicts the shared workshop or bench with a lesson', () => {
    expect(Object.keys(MODULE_MODEL_IDS)).toEqual(['elec-loto', 'roads-zone', 'water-burst', 'scene-safety', 'field-assist']);
    expect(MODULE_MODEL_IDS['field-assist']).toEqual(['room-rehearsal-kit','emulator-depot-room','water-valve-key']);
    expect(MODULE_MODEL_IDS['scene-safety']).toContain('fire-engine');
    expect(MODULE_MODEL_IDS['scene-safety']).toContain('roads-cone');
    expect(Object.values(MODULE_MODEL_IDS).flat()).not.toContain('workbench');
    expect(Object.values(MODULE_MODEL_IDS).flat()).not.toContain('workshop-room');
    expect(MODULE_MODEL_IDS['roads-zone']).toContain('roads-cone');
    expect(MODULE_MODEL_IDS['water-burst']).toContain('water-road');
    expect(MODULE_MODEL_IDS['elec-loto']).toContain('electrical-street');
  });
});

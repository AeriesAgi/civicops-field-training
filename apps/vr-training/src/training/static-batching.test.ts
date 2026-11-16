import { describe, expect, it } from 'vitest';
import { batchNodesInLevel, decodeSurfaceAttribute, fixedTargetGlow, isBatchableSurface, STATIC_BATCH_NODES } from './static-batching';

describe('fixed surface batching', () => {
  it('decodes normalized integer positions before world-space merging', () => {
    const stored = new Uint16Array([0, 32768, 65535]);
    const decoded = decodeSurfaceAttribute({ count: 1, itemSize: 3,
      getComponent: (i, c) => stored[i * 3 + c] / 65535 });
    expect(decoded[0]).toBe(0);
    expect(decoded[1]).toBeCloseTo(.500007629, 7);
    expect(decoded[2]).toBe(1);
  });
  it('preserves UV coordinates from signed normalized glTF storage', () => {
    const stored = new Int16Array([-32767, 0, 16384, 32767]);
    const decoded = decodeSurfaceAttribute({ count: 2, itemSize: 2,
      getComponent: (i, c) => Math.max(-1, stored[i * 2 + c] / 32767) });
    expect(Array.from(decoded)).toEqual([-1, 0, expect.closeTo(.50001526, 7), 1]);
  });
  it('retains articulated toggles and textures with different material mapping', () => {
    expect(isBatchableSurface('CustomPBRAtlas', true)).toBe(true);
    expect(isBatchableSurface('CivicOpsHeroAtlas', true)).toBe(true);
    expect(isBatchableSurface('CivicOpsHeroAtlas', false)).toBe(false);
    expect(isBatchableSurface('CustomPBRAtlas', false)).toBe(false);
    expect(isBatchableSurface('BirchLaminate', true)).toBe(false);
  });
  it('never batches grabbed tools or changes their independent poses', () => {
    const nodes = STATIC_BATCH_NODES.map(([name]) => name);
    for (const tool of ['padlock', 'danger-tag', 'voltage-tester']) expect(nodes).not.toContain(tool);
    expect(new Set(nodes).size).toBe(nodes.length);
  });
  it('omits the depot workbench when the street level does not contain it', () => {
    const present = new Set(['distribution-board', 'breaker-sl-1', 'breaker-sl-2', 'breaker-sl-3', 'breaker-sl-4', 'proving-unit', 'terminals', 'lock-zone', 'tag-zone']);
    const names = batchNodesInLevel((name) => present.has(name)).map(([name]) => name);
    expect(names).not.toContain('workbench');
    expect(names).toEqual([...present]);
  });
  it('keeps all selected targets visibly highlighted with the existing pulse bounds', () => {
    expect(fixedTargetGlow(false, 2)).toBe(0);
    expect(fixedTargetGlow(true, Math.PI / 6)).toBeCloseTo(.154);
    expect(fixedTargetGlow(true, Math.PI / 2)).toBeCloseTo(.022);
  });
});

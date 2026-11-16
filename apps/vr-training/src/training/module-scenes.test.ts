import { readFileSync } from 'node:fs';
import { validateSceneDocument } from '@iwsdk/scene-composition';
import { describe, expect, it } from 'vitest';
const load = (file: string) => JSON.parse(readFileSync(new URL(`../../public/scenes/${file}.iwsdk.scene.json`, import.meta.url), 'utf8'));

describe('department and Water scene contracts', () => {
  for (const file of ['board', 'water', 'main', 'roads', 'fire']) it(`validates ${file} with one directional light and no shadows`, () => {
    const scene = load(file);
    expect(validateSceneDocument(scene).issues).toEqual([]);
    expect(scene.nodes.filter((node: { components?: Record<string, unknown> }) => node.components?.['com.iwsdk.components.DirectionalLight'])).toHaveLength(1);
    expect(JSON.stringify(scene)).not.toContain('"castShadow":true');
  });
  it('keeps every department control on a hand-poke panel at the bench', () => {
    const node = load('board').nodes[0].children.find((node: {id:string}) => node.id === 'department-board-panel');
    expect(node.components).toHaveProperty('PokeInteractable'); expect(node.components).toHaveProperty('RayInteractable');
    expect(node.transform.position[0]).toBe(0);
    const markup = readFileSync(new URL('../../public/ui/department-board.uikitml', import.meta.url), 'utf8');
    for (const id of ['electricity', 'water', 'roads', 'fire', 'assist', 'metro', 'disaster']) expect(markup).toContain(`id="tab-${id}"`);
  });
  it('registers every URL asset lazy so startup cannot preload both modules', () => {
    const source = readFileSync(new URL('../assets.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/AssetType.GLTF, priority: 'lazy'/); expect(source).toMatch(/AssetType.UIKitML, priority: 'lazy'/);
  });
});

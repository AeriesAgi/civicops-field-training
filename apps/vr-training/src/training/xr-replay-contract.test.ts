import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface SceneNode { id: string; children?: SceneNode[] }
const script = readFileSync(new URL('../../scripts/e2e-xr.mjs', import.meta.url), 'utf8');

describe('hand replay scene bindings', () => {
  it.each([['electrical', 'main'], ['water', 'water'], ['roads', 'roads'], ['fire', 'fire']])('keeps %s literal hand targets bound to authored scene nodes', (lesson, scene) => {
    const nodes = JSON.parse(readFileSync(new URL(`../../public/scenes/${scene}.iwsdk.scene.json`, import.meta.url), 'utf8')).nodes as SceneNode[];
    const ids = new Set<string>();
    const visit = (list: SceneNode[]): void => { for (const node of list) { ids.add(node.id); visit(node.children ?? []); } };
    visit(nodes);
    if(lesson==='roads') {
      const runtime=readFileSync(new URL('../roads-training-system.ts',import.meta.url),'utf8');
      expect(runtime).toContain("mesh.name='PinchTapeReel'");
      expect(runtime).toContain('addComponent(RoadsTape).addComponent(OneHandGrabbable)');
      ids.add('PinchTapeReel');
    }
    const start = script.indexOf(`async function ${lesson}()`);
    const end = script.indexOf('\nasync function ', start + 1);
    const body = script.slice(start, end === -1 ? undefined : end);
    const targets = [...body.matchAll(/(?:click|place|grab|selectObject|transform)\('([^']+)'/g)].map(match => match[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(ids.has(target), `${lesson}: missing ${target}`).toBe(true);
  });
});

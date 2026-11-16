import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = JSON.parse(readFileSync(new URL('../../public/scenes/water.iwsdk.scene.json', import.meta.url), 'utf8')) as {
  player: { transform: { position: number[] } };
  nodes: Array<{ id: string; transform?: { position?: number[]; rotationDeg?: number[] }; components?: Record<string, unknown>; children?: Array<{ id: string; transform?: { position?: number[]; rotationDeg?: number[] }; components?: Record<string, unknown> }> }>;
};

describe('Water full-scale scene composition', () => {
  it('starts on the road with controls at a readable forward depth', () => {
    expect(scene.player.transform.position).toEqual([0, 0, 8]);
    const panels = scene.nodes.filter(({ id }) => id.startsWith('water-') && id.endsWith('-panel'));
    expect(panels).toHaveLength(4);
    for (const panel of panels) {
      const position = panel.transform?.position ?? [];
      expect(position[1], panel.id).toBeGreaterThanOrEqual(2);
      expect(position[2], panel.id).toBeGreaterThanOrEqual(6);
      expect(position[2], panel.id).toBeLessThan(7);
      expect(panel.transform?.rotationDeg?.[1] ?? 0, panel.id).toBeCloseTo(0, 3);
    }
    expect(panels.find(({ id }) => id === 'water-steps-panel')?.transform?.position?.[0]).toBeLessThan(-.8);
    expect(panels.find(({ id }) => id === 'water-controls-panel')?.transform?.position?.[0]).toBeGreaterThan(.8);
  });

  it('keeps the road mesh as the authored walkable environment', () => {
    const environment = scene.nodes.flatMap((node) => [node, ...(node.children ?? [])]).find(({ id }) => id === 'water-road');
    expect(environment, 'water-road asset node').toBeDefined();
    expect(environment?.components ?? {}).toHaveProperty('LocomotionEnvironment');
    const source = readFileSync(new URL('../water-training-system.ts', import.meta.url), 'utf8');
    expect(source).toContain('syncPanelAnchor');
    expect(source).toContain('distanceToSquared(this.point) > 4');
  });
});

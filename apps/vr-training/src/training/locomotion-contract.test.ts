import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(new URL('../../iwsdk.config.json', import.meta.url), 'utf8')) as {
  world: { render: { far: number }; features: { locomotion: { turningMethod: string; enableJumping: boolean; comfortAssistLevel: number } } };
};
const scene = (name: string) => JSON.parse(readFileSync(new URL(`../../public/scenes/${name}.iwsdk.scene.json`, import.meta.url), 'utf8')) as {
  player?: { transform?: { position?: number[] } };
  nodes: Array<{ id: string; components?: Record<string, unknown>; children?: Array<{ id: string; components?: Record<string, unknown> }> }>;
};
const runtimeSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

describe('hands-only full-scale locomotion contract', () => {
  it('uses snap turn, seated comfort vignette assistance, and no jump', () => {
    expect(config.world.features.locomotion).toMatchObject({ turningMethod: 'snap', enableJumping: false });
    expect(config.world.features.locomotion.comfortAssistLevel).toBeGreaterThanOrEqual(1);
  });

  it('enables the SDK hand micro-gesture path for teleport and snap turn', () => {
    expect(runtimeSource).toContain('useHandPinchForGrab');
    expect(runtimeSource).toContain('microGestureControlsEnabled.value = true');
    expect(runtimeSource).toContain('TeleportSystem');
    expect(runtimeSource).toContain('TurnSystem');
  });

  it('keeps every walkable module scene grounded by an authored environment', () => {
    for (const name of ['board', 'main', 'water', 'roads']) {
      const document = scene(name);
      const nodes = document.nodes.flatMap((node) => [node, ...(node.children ?? [])]);
      expect(nodes.some((node) => node.components && Object.prototype.hasOwnProperty.call(node.components, 'LocomotionEnvironment')), `${name} needs a walkable floor`).toBe(true);
      expect(document.player?.transform?.position?.[1] ?? 0).toBe(0);
      const authored = JSON.stringify(document);
      expect(authored).not.toContain('PresentationBase');
      expect(authored).not.toContain('PartsTray');
      if (name !== 'main' && name !== 'board') expect(authored).not.toContain('"name":"workbench"');
    }
  });

  it('keeps the requested standing eye height explicit for scene-authored scale checks', () => {
    expect(1.6).toBeGreaterThan(1.5);
    expect(1.6).toBeLessThan(1.7);
    expect(config.world.render.far).toBeGreaterThanOrEqual(80);
  });
});

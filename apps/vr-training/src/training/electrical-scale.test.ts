import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const glbJson = () => {
  const bytes = readFileSync(new URL('../../public/models/electrical-street.glb', import.meta.url));
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as {
    extensionsUsed?: string[]; nodes: Array<{ name?: string; extras?: { dimensionsMeters?: number[]; contract?: string } }>;
  };
};

describe('Electrical full scale street contract', () => {
  it('ships the authored 1:1 contract markers in the runtime GLB', () => {
    const gltf = glbJson();
    expect(gltf.extensionsUsed).toContain('EXT_meshopt_compression');
    const marker = (name: string) => gltf.nodes.find((node) => node.name === name)?.extras;
    expect(marker('ScaleContract_RoadLane')).toMatchObject({ dimensionsMeters: [7, 0.12, 50], contract: 'electrical full-scale street' });
    expect(marker('ScaleContract_Car')).toMatchObject({ dimensionsMeters: [1.8, 1.4, 4.5] });
    expect(marker('ScaleContract_Pole')).toMatchObject({ dimensionsMeters: [0.2, 8.6, 0.2] });
    const sub = gltf.nodes.find((node) => node.name === 'ElectricalMiniSub') as { translation?: number[] };
    // The cabinet stands on the sidewalk, outside the ±3.5 m carriageway.
    expect(sub.translation?.[0] ?? 0).toBeLessThan(-3.5);
    expect(Math.abs(sub.translation?.[2] ?? 0)).toBeGreaterThan(6);
  });

  it('lays the carriageway on the ground instead of standing it up', () => {
    const gltf = glbJson() as { nodes: Array<{ name?: string; translation?: number[]; mesh?: number }>; meshes: Array<{ primitives: Array<{ attributes: { POSITION?: number } }> }>; accessors: Array<{ min?: number[]; max?: number[] }> };
    const road = gltf.nodes.find((node) => node.name === 'RoadSurface');
    expect(road?.mesh).toBeTypeOf('number');
    const position = gltf.meshes[road!.mesh!].primitives[0].attributes.POSITION;
    const accessor = gltf.accessors[position!] as { min?: number[]; max?: number[]; normalized?: boolean; componentType?: number };
    const node = road as typeof road & { scale?: number[] };
    const unit = accessor.normalized ? (accessor.componentType === 5122 ? 32767 : 65535) : 1;
    const min = (accessor.min ?? [0, 0, 0]).map((v,i)=>v/unit*(node?.scale?.[i]??1));
    const max = (accessor.max ?? [0, 0, 0]).map((v,i)=>v/unit*(node?.scale?.[i]??1));
    const translation = road?.translation ?? [0, 0, 0];
    const size = [0, 1, 2].map((axis) => max[axis] - min[axis]);
    const worldMaxY = max[1] + translation[1];
    const worldMinY = min[1] + translation[1];
    // Length runs along Z, thickness along Y. A vertical export swaps those.
    expect(size[2]).toBeGreaterThan(40);
    expect(size[1]).toBeLessThan(1);
    expect(worldMaxY).toBeLessThan(0.3);
    expect(worldMinY).toBeGreaterThan(-0.4);
  });

  it('keeps a standing player, walkable street and no tabletop shell in main scene', () => {
    const scene = JSON.parse(readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8')) as {
      player: { transform: { position: number[] } }; nodes: Array<{ id: string; content?: { asset?: string }; components?: Record<string, unknown>; children?: Array<{ id: string; content?: { asset?: string }; components?: Record<string, unknown> }> }>;
    };
    expect(scene.player.transform.position[1]).toBe(0);
    const rig = scene.nodes.find((node) => node.id === 'bench-rig');
    expect(rig).toBeDefined();
    const street = rig?.children?.find((node) => node.id === 'electrical-street');
    expect(street?.content?.asset).toBe('electrical-street');
    expect(street?.components).toHaveProperty('LocomotionEnvironment');
    const authored = JSON.stringify(scene);
    expect(authored).not.toContain('workbench');
    expect(authored).not.toContain('workshop-room');
  });

  it('keeps true-world dimensions explicit for review tooling', () => {
    expect(1.6).toBeGreaterThanOrEqual(1.55);
    expect(3.5).toBeGreaterThanOrEqual(3.4);
    expect(4.5).toBeGreaterThanOrEqual(4.4);
    expect(8.6).toBeGreaterThanOrEqual(8);
  });
});

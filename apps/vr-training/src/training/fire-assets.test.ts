import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const names = ['street', 'engine', 'ambulance', 'flare', 'mast', 'exclusion', 'casualty-1', 'casualty-2', 'casualty-3', 'casualty-4', 'tag-minor', 'tag-delayed', 'tag-immediate', 'tag-expectant'] as const;
const source = (name: string) => {
  const bytes = readFileSync(new URL(`../../public/models/fire-${name}.glb`, import.meta.url));
  const jsonSize = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + jsonSize).toString()) as {
    nodes: Array<{ name?: string; extras?: Record<string, unknown> }>;
    materials: Array<{ name?: string }>;
    images?: Array<{ uri?: string }>;
    extensionsRequired?: string[];
    extensionsUsed?: string[];
    meshes: Array<{ primitives: Array<{ indices?: number }> }>;
    accessors: Array<{ count: number }>;
  }, bytes: bytes.length };
};

describe('Original Fire and EMS hero assets', () => {
  it('uses the shared atlas, meshopt and existing KTX2 maps only', () => {
    for (const name of names) {
      const { json } = source(name);
      expect(json.extensionsRequired).toContain('KHR_texture_basisu');
      expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
      expect(json.materials).toHaveLength(name === 'street' ? 4 : 1);
      expect(json.materials.map(m=>m.name)).toContain('CivicOpsRoadsAtlas');
      for (const image of json.images ?? []) expect(image.uri).toMatch(/^\.\.\/textures\/(roads-color|hero-orm|hero-normal|street-((asphalt|trim)-(color|normal|orm)|fire-shadows))\.ktx2$/);
    }
  });

  it('keeps the arterial, live cable and featureless mannequins', () => {
    const street = source('street');
    const namesOnStreet = street.json.nodes.map((node) => node.name);
    expect(namesOnStreet).toEqual(expect.arrayContaining(['RoadPlane', 'LeaningPole', 'DownedCable', 'FuelSpill', 'CrashPair']));
    expect(JSON.stringify(street.json.nodes.find((node) => node.name === 'FireStreet')?.extras)).toContain('noIdentityFeatures');
    expect(JSON.stringify(street.json.nodes.find((node) => node.name === 'FireStreet')?.extras)).toContain('laneWidth');
    const casualty = source('casualty-1');
    expect(casualty.json.nodes.map((node) => node.name)).toContain('FeaturelessVisor');
    expect(JSON.stringify(casualty.json)).toContain('syntheticMannequin');
    expect(JSON.stringify(casualty.json)).toContain('noIdentityFeatures');
    expect(JSON.stringify(casualty.json)).not.toContain('personIdentity');
    const triangles = street.json.meshes.reduce((total, mesh) => total + mesh.primitives.reduce((sum, primitive) => sum + (primitive.indices === undefined ? 0 : street.json.accessors[primitive.indices].count / 3), 0), 0);
    expect(triangles).toBeLessThan(19_500);
    expect(names.reduce((sum, name) => sum + source(name).bytes, 0)).toBeLessThan(2_500_000);
  });
});

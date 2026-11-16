import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const names = ['street', 'cone', 'delineator', 'barrier', 'warning', 'keep-left', 'stop-go', 'marshal', 'bakkie', 'car'] as const;
const source = (name: string) => {
  const bytes = readFileSync(new URL(`../../public/models/roads-${name === 'bakkie' ? 'crew-van' : name}.glb`, import.meta.url));
  const jsonSize = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + jsonSize).toString()), binary: bytes.subarray(28 + jsonSize), bytes: bytes.length };
};

describe('Original Roads full-scale hero assets', () => {
  it('ships the 1:1 street anchors and no presentation plinth/tray', () => {
    const { json } = source('street');
    const nodeNames = json.nodes.map((node: { name?: string }) => node.name);
    expect(nodeNames).toEqual(expect.arrayContaining(['RoadPlane', 'WorkArea', 'PedestrianRoute', 'BendOccluder', 'StreetlightPole']));
    expect(nodeNames).not.toContain('PresentationBase');
    expect(nodeNames).not.toContain('PartsTrayFloor');
    expect(nodeNames).not.toContain('StreetTaxiTemplateMesh');
    expect(nodeNames).not.toContain('StreetPedestrianTemplateMesh');
    expect(JSON.stringify(json)).toContain('streetRealismVersion');
    expect(JSON.stringify(json)).toContain('laneWidth');
  });

  it('keeps the authored full-scale envelopes explicit', () => {
    expect(JSON.stringify(source('street').json)).toContain('streetlightHeight');
    const { json } = source('car');
    expect(json.accessors.filter((a: { type?: string }) => a.type === 'VEC3').length).toBeGreaterThan(0);
    expect(source('barrier').bytes).toBeGreaterThan(10_000);
  });

  it('retains human-readable marshal controls without identity detail', () => {
    for (const name of ['marshal', 'stop-go']) {
      const nodeNames = source(name).json.nodes.map((node: { name?: string }) => node.name);
      expect(nodeNames).toEqual(expect.arrayContaining(['StopFace', 'GoFace']));
    }
    const marshal = JSON.stringify(source('marshal').json);
    expect(marshal).toContain('RefugeContact');
    expect(marshal).toContain('noIdentityFeatures');
  });

  it('uses compressed atlases or texture-free licensed crew surfaces', () => {
    for (const name of names) {
      const { json } = source(name);
      const crew=name==='marshal'||name==='bakkie';
      if(crew)expect(json.textures??[]).toHaveLength(0);
      else expect(json.extensionsRequired).toContain('KHR_texture_basisu');
      expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
      expect(json.materials).toHaveLength(name === 'street' ? 4 : 1);
      expect(json.materials.map((m: {name:string})=>m.name)).toContain(crew?'RoadCrewVertexPBR':name==='cone'?'LicensedRoadConePBR':'CivicOpsRoadsAtlas');
    }
  });

  it('keeps the street under the Quest geometry budget', () => {
    const { json } = source('street');
    const triangles = json.meshes.reduce((total: number, mesh: { primitives: Array<{ indices: number }> }) => total + mesh.primitives.reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0), 0);
    expect(triangles).toBeLessThan(19_000);
    expect(source('street').bytes).toBeLessThan(1_600_000);
  });

  it('ships decoder-free fallbacks for compressed buffer views', async () => {
    await MeshoptDecoder.ready;
    for (const name of names) {
      const { json, binary } = source(name);
      expect(json.buffers).toHaveLength(1);
      for (const view of json.bufferViews) {
        const extension = view.extensions?.EXT_meshopt_compression;
        if (!extension) continue;
        const decoded = new Uint8Array(extension.count * extension.byteStride);
        MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride,
          binary.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength), extension.mode, extension.filter);
        const fallback = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
        expect(Buffer.from(decoded).equals(fallback)).toBe(true);
      }
    }
  });
});

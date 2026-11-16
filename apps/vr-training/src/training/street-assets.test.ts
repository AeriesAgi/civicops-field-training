import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const glb = (name: string) => {
  const bytes = readFileSync(new URL(`../../public/models/${name}.glb`, import.meta.url));
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
};
describe('licensed full-scale street packages', () => {
  it('separates reusable actors from every walkable street asset', () => {
    const actors=glb('street-actors');
    expect(actors.nodes.map((n: {name:string})=>n.name)).toEqual(expect.arrayContaining(['StreetTaxiTemplateMesh','StreetPedestrianTemplateMesh']));
    for(const name of ['main','water','roads','fire']) {
      const scene=JSON.parse(readFileSync(new URL(`../../public/scenes/${name}.iwsdk.scene.json`,import.meta.url),'utf8'));
      const actor=scene.nodes.flatMap((n: {children?:unknown[]})=>n.children??[]).find((n: {id:string})=>n.id==='street-actors');
      expect(actor.content.asset).toBe('street-actors');
      expect(actor.components?.LocomotionEnvironment).toBeUndefined();
    }
  });
  it('keeps soft ground bakes transparent, unlit and on their own UV source', () => {
    for(const [name,kind] of [['electrical-street','electrical'],['water-road','water'],['roads-street','roads'],['fire-street','fire']]) {
      const asset=glb(name);
      const material=asset.materials.find((m: {name:string})=>m.name==='StreetGroundShadowBake');
      expect(material.alphaMode).toBe('BLEND');
      expect(material.extensions).toHaveProperty('KHR_materials_unlit');
      expect(material.pbrMetallicRoughness.baseColorFactor ?? [1,1,1,1]).toEqual([1,1,1,1]);
      const texture=asset.textures[material.pbrMetallicRoughness.baseColorTexture.index];
      const image=asset.images[texture.extensions.KHR_texture_basisu.source];
      expect(image.uri).toBe(`../textures/street-${kind}-shadows.ktx2`);
      const ktx=readFileSync(new URL(`../../public/textures/street-${kind}-shadows.ktx2`,import.meta.url));
      const dfd=ktx.readUInt32LE(48),size=ktx.readUInt16LE(dfd+10);
      let alpha=false;
      for(let sample=dfd+28;sample<dfd+4+size;sample+=16)alpha ||= (ktx[sample+3]&15)===15;
      expect(alpha).toBe(true);
      expect(ktx.length).toBeLessThan(150_000);
    }
  });
  it('grounds the actual decoded minibus geometry, not just its metadata',async()=>{await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});const doc=await io.read(fileURLToPath(new URL('../../public/models/street-actors.glb',import.meta.url)));const taxi=doc.getRoot().listNodes().find(n=>n.getName()==='StreetTaxiTemplate')!;const bounds=getBounds(taxi);expect(bounds.min[1]).toBeCloseTo(0,3);expect(bounds.max[1]).toBeGreaterThan(2);expect((taxi.getExtras().wheelCentres as number[][])).toHaveLength(4);});
  it('ships the licensed unbranded taxi and a single-draw rigged CC0 worker without third-party motion', () => {
    const asset=glb('street-actors');
    const root=asset.nodes.find((n: {name:string})=>n.name==='StreetTaxiTemplate');
    expect(root.extras).toMatchObject({metresLength:5.35,roofRack:true,slidingDoor:true,routeDestination:'CBD',badgesRemoved:true});
    expect(asset.nodes.some((n:{name:string})=>n.name==='StreetWorkerRig')).toBe(true);
    const worker=asset.nodes.find((n:{name:string})=>n.name==='StreetPedestrianTemplateMesh');
    expect(asset.skins[worker.skin].joints.length).toBeGreaterThan(20);
    expect(asset.meshes[worker.mesh].primitives).toHaveLength(1);
    expect(asset.animations ?? []).toEqual([]);
    expect(asset.nodes.some((n:{name:string})=>/BADGE|Toyota|HiAce/i.test(n.name))).toBe(false);
  });
  for (const name of ['electrical-street', 'water-road', 'roads-street', 'fire-street']) {
    it(`${name} carries PBR scans, baked shading and separate street-life prototypes`, () => {
      const asset = glb(name);
      expect(asset.nodes.some((n: { name?: string }) => n.name === 'StreetTaxiTemplateMesh')).toBe(false);
      expect(asset.nodes.some((n: { name?: string }) => n.name === 'StreetPedestrianTemplateMesh')).toBe(false);
      expect(asset.materials.some((m: { name: string }) => m.name === 'street-asphalt')).toBe(true);
      expect(asset.materials.some((m: { name: string }) => m.name === 'street-trim')).toBe(true);
      expect(asset.meshes.some((m: { primitives: { attributes: Record<string, number> }[] }) => m.primitives.some(p => p.attributes.COLOR_0 !== undefined))).toBe(true);
      expect(asset.extensionsUsed).toContain('EXT_meshopt_compression');
      expect(asset.extensionsRequired).toContain('KHR_texture_basisu');
      for (const image of asset.images) expect(image.uri).toMatch(/^\.\.\/textures\/[a-z0-9-]+\.ktx2$/);
    });
  }
});

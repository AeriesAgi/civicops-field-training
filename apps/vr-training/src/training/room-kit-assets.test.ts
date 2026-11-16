import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const glb=(name:string)=>{
 const b=readFileSync(new URL(`../../public/models/${name}.glb`,import.meta.url));
 return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
};
describe('licensed room and street kit',()=>{
 it('retains metre scale, PBR maps, compressed geometry and source licence on the cone',()=>{
  const j=glb('roads-cone');
  expect(j.extensionsUsed).toContain('EXT_meshopt_compression');expect(j.extensionsRequired).toContain('KHR_texture_basisu');
  const node=j.nodes.find((n:{name?:string})=>n.name==='RehearsalTrafficCone');
  expect(node.extras).toMatchObject({contactPlaneY:0,metresHeight:.75,sourceLicence:'CC-BY-4.0'});
  const bounds=j.accessors.filter((a:{type:string;min?:number[]})=>a.type==='VEC3'&&a.min&&a.min.length===3);
  expect(bounds.length).toBeGreaterThan(0);
  expect(j.materials[0].normalTexture).toBeDefined();expect(j.materials[0].pbrMetallicRoughness.baseColorTexture).toBeDefined();
  const triangles=j.meshes.reduce((s:number,m:{primitives:{indices:number}[]})=>s+m.primitives.reduce((n,p)=>n+j.accessors[p.indices].count/3,0),0);
  expect(triangles).toBeLessThan(350);
 });
 it('packages only the selected rehearsal props, not the downloaded asset collection',()=>{
  const j=glb('room-rehearsal-kit');
  expect(j.nodes.map((n:{name?:string})=>n.name)).toEqual(expect.arrayContaining(['RehearsalTrafficCone','WeatheredIsolationCabinet']));
  expect(j.materials).toHaveLength(2);expect(j.images).toHaveLength(6);
  const cabinet=j.nodes.find((n:{name?:string})=>n.name==='WeatheredIsolationCabinet');expect(cabinet.extras.sourceLicence).toBe('CC0-1.0');
 });
 it('uses one photographed material for grounded emulator scenery and carries an honest capture marker',()=>{
  const j=glb('emulator-depot-room');expect(j.materials).toHaveLength(1);expect(j.images).toHaveLength(1);
  expect(j.nodes.find((n:{name?:string})=>n.name==='PhotographedDepotBackdrop').extras).toMatchObject({emulatorOnly:true,passthroughSimulated:true});
  expect(j.nodes.map((n:{name?:string})=>n.name)).toContain('PhotographedRealFloor');
 });
});

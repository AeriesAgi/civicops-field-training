import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Euler, Quaternion } from '@iwsdk/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIRE_HAZARD_MARKERS, FIRE_SCENE } from './scene-safety-geometry';
import { HAZARD_MARKER_RADIUS } from '../scene-assets/hazard-marker';

interface AuthoredNode { id:string; transform?:{position?:[number,number,number];rotationDeg?:[number,number,number]};children?:AuthoredNode[] }
async function posedBodies() {
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const scene=JSON.parse(readFileSync(new URL('../../public/scenes/fire.iwsdk.scene.json',import.meta.url),'utf8'));
  const nodes:AuthoredNode[]=[];
  const visit=(list:AuthoredNode[])=>{for(const n of list){nodes.push(n);visit(n.children??[]);}};visit(scene.nodes);
  return Promise.all([1,2,3,4].map(async id=>{
    const doc=await io.read(fileURLToPath(new URL(`../../public/models/fire-casualty-${id}.glb`,import.meta.url)));
    const original=doc.getRoot().listScenes()[0],pose=nodes.find(n=>n.id===`fire-c${id}`)!.transform!;
    const rotation=pose.rotationDeg!.map(v=>v*Math.PI/180);
    const q=new Quaternion().setFromEuler(new Euler(rotation[0],rotation[1],rotation[2]));
    const wrapper=doc.createNode().setTranslation(pose.position!).setRotation([q.x,q.y,q.z,q.w]);
    for(const child of original.listChildren()){original.removeChild(child);wrapper.addChild(child);}original.addChild(wrapper);
    return {id,bounds:getBounds(wrapper)};
  }));
}
let bodies:ReturnType<typeof posedBodies>|undefined;
const decodedBodies=()=>bodies??=posedBodies();

describe('actual Fire scene interaction clearance',()=>{
  it('grounds every decoded casualty after its authored standing or prone rotation',async()=>{
    for(const {bounds} of await decodedBodies()){
      expect(bounds.min[1]).toBeGreaterThanOrEqual(.079);
      expect(bounds.min[1]).toBeLessThan(.085);
    }
  });
  it('keeps hazard targets clear of the actual casualty footprints and near-touch margin',async()=>{
    for(const {bounds} of await decodedBodies())for(const point of Object.values(FIRE_HAZARD_MARKERS)){
      const dx=Math.max(bounds.min[0]-point.x,0,point.x-bounds.max[0]);
      const dz=Math.max(bounds.min[2]-point.z,0,point.z-bounds.max[2]);
      expect(Math.hypot(dx,dz)).toBeGreaterThan(HAZARD_MARKER_RADIUS+.2+.05);
    }
  });
  it('keeps the entire selectable disc outside the cable exclusion and open lane',()=>{
    for(const point of Object.values(FIRE_HAZARD_MARKERS)){
      expect(point.x+HAZARD_MARKER_RADIUS).toBeLessThan(FIRE_SCENE.liveLaneMinX);
      expect(Math.hypot(point.x-FIRE_SCENE.cable.x,point.z-FIRE_SCENE.cable.z)-HAZARD_MARKER_RADIUS).toBeGreaterThan(FIRE_SCENE.exclusionRadius);
    }
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { setTesterReadout } from '../scene-assets/tester-readout';
import type { Object3D } from '@iwsdk/core';

const source = (name: string) => {
  const bytes = readFileSync(new URL(`../../public/models/hero-${name}.glb`, import.meta.url));
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
};
const matrix = (node: any): number[] => {
  if (node.matrix) return node.matrix;
  const [x,y,z,w] = node.rotation ?? [0,0,0,1];
  const [sx,sy,sz] = node.scale ?? [1,1,1], t = node.translation ?? [0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,
    2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,
    2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,...t,1];
};
const product = (a:number[],b:number[]) => Array.from({length:16},(_,i)=>{
  const col=Math.floor(i/4),row=i%4;
  return a[row]*b[col*4]+a[4+row]*b[col*4+1]+a[8+row]*b[col*4+2]+a[12+row]*b[col*4+3];
});
function anchor(asset:any,name:string):number[] {
  const target=asset.nodes.findIndex((n:any)=>n.name===name);
  expect(target,`named anchor ${name}`).toBeGreaterThanOrEqual(0);
  const parents=new Map<number,number>();asset.nodes.forEach((n:any,i:number)=>n.children?.forEach((c:number)=>parents.set(c,i)));
  let m=matrix(asset.nodes[target]),p=parents.get(target);
  while(p!==undefined){m=product(matrix(asset.nodes[p]),m);p=parents.get(p);}
  return m.slice(12,15);
}
const close=(actual:number[],expected:number[])=>actual.forEach((x,i)=>expect(x).toBeCloseTo(expected[i],4));

describe('Blender hero asset interaction contract',()=>{
  it('preserves the articulated breaker pivot and physical tester sockets',()=>{
    close(anchor(source('breaker'),'Toggle'),[0,.005,.023]);
    close(anchor(source('proving-unit'),'KnownLiveContact'),[0,.037,0]);
    close(anchor(source('terminals'),'LineContact'),[-.023,.024,0]);
    close(anchor(source('terminals'),'NeutralContact'),[.023,.024,0]);
  });
  it('ships meshopt geometry and one external KTX2 atlas for every hero',()=>{
    for(const name of ['distribution-board','breaker','padlock','danger-tag','voltage-tester','proving-unit','terminals','lock-zone','tag-zone','workbench','workshop-hero']){
      const asset=source(name);
      expect(asset.extensionsUsed).toContain('EXT_meshopt_compression');
      expect(asset.extensionsRequired).not.toContain('EXT_meshopt_compression');
      for (const view of asset.bufferViews) expect(view.buffer).toBe(0);
      expect(asset.extensionsRequired).toContain('KHR_texture_basisu');
      expect(asset.images).toHaveLength(name === 'workbench' ? 5 : 3);
      expect(new Set(asset.images.map((i:any)=>i.uri))).toEqual(new Set(['../textures/hero-color.ktx2','../textures/hero-orm.ktx2','../textures/hero-normal.ktx2', ...(name === 'workbench' ? ['../textures/hero-timber-color.ktx2','../textures/hero-timber-normal.ktx2'] : [])]));
    }
  });
  it('provides genuine decoder-free fallback bytes matching every compressed view', async()=>{
    await MeshoptDecoder.ready;
    for(const name of ['distribution-board','breaker','padlock','danger-tag','voltage-tester','proving-unit','terminals','lock-zone','tag-zone','workbench','workshop-hero']){
      const bytes=readFileSync(new URL(`../../public/models/hero-${name}.glb`,import.meta.url));
      const jsonLength=bytes.readUInt32LE(12);
      const asset=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
      const binHeader=20+jsonLength;
      const binLength=bytes.readUInt32LE(binHeader);
      const binary=bytes.subarray(binHeader+8,binHeader+8+binLength);
      expect(bytes.readUInt32LE(binHeader+4),name).toBe(0x004e4942);
      expect(asset.buffers,name).toHaveLength(1);
      expect(asset.buffers[0].byteLength,name).toBe(binLength);
      expect(asset.extensionsRequired,name).not.toContain('EXT_meshopt_compression');
      let compressedViews=0;
      for(const [index,view] of asset.bufferViews.entries()){
        const context=`${name} bufferView ${index}`;
        const fallbackOffset=view.byteOffset??0;
        expect(view.buffer,context).toBe(0);
        expect(fallbackOffset,context).toBeGreaterThanOrEqual(0);
        expect(fallbackOffset%4,context).toBe(0);
        expect(view.byteLength,context).toBeGreaterThan(0);
        expect(fallbackOffset+view.byteLength,context).toBeLessThanOrEqual(binary.length);
        const extension=view.extensions?.EXT_meshopt_compression;
        if(!extension)continue;
        compressedViews++;
        const compressedOffset=extension.byteOffset??0;
        expect(extension.buffer,context).toBe(0);
        expect(compressedOffset,context).toBeGreaterThanOrEqual(0);
        expect(compressedOffset+extension.byteLength,context).toBeLessThanOrEqual(binary.length);
        expect(extension.byteLength,context).toBeGreaterThan(0);
        expect(view.byteLength,context).toBe(extension.count*extension.byteStride);
        const decoded=new Uint8Array(view.byteLength);
        MeshoptDecoder.decodeGltfBuffer(decoded,extension.count,extension.byteStride,
          binary.subarray(compressedOffset,compressedOffset+extension.byteLength),extension.mode,extension.filter);
        const fallback=binary.subarray(fallbackOffset,fallbackOffset+view.byteLength);
        // A declared phantom/zero buffer passes metadata checks but cannot render in the editor.
        expect(fallback.some(value=>value!==0),context).toBe(true);
        expect(fallback.equals(Buffer.from(decoded)),context).toBe(true);
      }
      expect(compressedViews,name).toBeGreaterThan(0);
    }
  });
  it('keeps all readout faces independently selectable after compression',()=>{
    const names=source('voltage-tester').nodes.map((n:any)=>n.name);
    for(const state of ['230','000','idle'])expect(names).toContain(`VoltageReadout-${state}`);
  });
  it('selects exactly one readable voltage face through proof/dead/reset',()=>{
    const children=['230','000','idle'].map(state=>({name:`VoltageReadout-${state}`,visible:true}));
    const root={getObjectByName:()=>({children})} as unknown as Object3D;
    for(const [voltage,expected] of [[230,'230'],[0,'000'],[null,'idle']] as const){
      setTesterReadout(root,voltage);
      expect(children.filter(c=>c.visible).map(c=>c.name)).toEqual([`VoltageReadout-${expected}`]);
    }
  });
  it('keeps interaction placement and hands-only settings unchanged',()=>{
    const scene=JSON.parse(readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json',import.meta.url),'utf8'));
    const rig=scene.nodes.find((n:any)=>n.id==='bench-rig');
    const nodes=new Map<string,any>(rig.children.map((n:any)=>[n.id,n]));
    expect(nodes.get('voltage-tester').transform.position).toEqual([-4.575,.985,-7.45]);
    expect(nodes.get('lock-zone').transform.position).toEqual([-4.55,1.19,-7.53]);
    expect(nodes.get('tag-zone').transform.position).toEqual([-4.487,1.145,-7.52]);
    for(const name of ['padlock','danger-tag','voltage-tester'])expect(nodes.get(name).components).toHaveProperty('OneHandGrabbable');
  });
});

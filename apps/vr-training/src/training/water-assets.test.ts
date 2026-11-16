import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const files=['road','valve-key','barrier','sign'] as const;
const source=(name:string)=>{
 const b=readFileSync(new URL(`../../public/models/water-${name}.glb`,import.meta.url));
 const n=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+n).toString()),binary:b.subarray(28+n)};
};
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const product=(a:number[],b:number[])=>Array.from({length:16},(_,i)=>{
 const c=Math.floor(i/4),r=i%4;return a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
});
function anchor(json:any,name:string):number[]{
 const index=json.nodes.findIndex((n:any)=>n.name===name);expect(index,name).toBeGreaterThanOrEqual(0);
 const parents=new Map<number,number>();json.nodes.forEach((n:any,i:number)=>n.children?.forEach((c:number)=>parents.set(c,i)));
 const transform=(node:any)=>{if(node.matrix)return node.matrix;const m=[...identity];const t=node.translation??[0,0,0],q=node.scale??[1,1,1];m[0]=q[0];m[5]=q[1];m[10]=q[2];m.splice(12,3,...t);return m;};
 let m=transform(json.nodes[index]),p=parents.get(index);while(p!==undefined){m=product(transform(json.nodes[p]),m);p=parents.get(p);}return m.slice(12,15);
}
const close=(actual:number[],expected:number[])=>actual.forEach((v,i)=>expect(v).toBeCloseTo(expected[i],5));
describe('Original water hero asset contract',()=>{
 it('keeps all four real valve sockets and removable cover pivots at seated reach',()=>{
  const j=source('road').json;
  for(const [letter,x,z] of [['A',-.32,.055],['B',.32,.055],['C',.32,-.205],['D',-.32,-.205]] as const){
   close(anchor(j,`ValveSeat${letter}`),[x*10,.075,z*10]);close(anchor(j,`ValveCover${letter}`),[x*10,.105,z*10]);
   const group=j.nodes.find((n:any)=>n.name===`ValveCover${letter}`);expect(group.children).toHaveLength(1);
  }
 });
 it('retains jet, dial, washout, safety and tip anchors through mesh merging',()=>{
  const j=source('road').json;
  close(anchor(j,'BurstOutlet'),[.35,-.215,0]);close(anchor(j,'PressureNeedle'),[1.6,.745,2.16]);close(anchor(j,'WashoutHandle'),[-1.3,.795,2.13]);
  close(anchor(j,'TrenchEntry'),[2.15,.195,.15]);close(anchor(source('valve-key').json,'KeyTip'),[0,0,0]);
  for(const name of ['TrenchEntryTarget','WashoutHandle','PressureNeedle'])expect(j.nodes.find((n:any)=>n.name===name).children).toHaveLength(1);
  for(const name of ['ShoringTarget','LadderTarget','TrenchEntryTarget','BarrierSeat','SignSeat'])expect(j.nodes.some((n:any)=>n.name===name)).toBe(true);
 });
 it('shares only the dedicated small colour map and existing KTX2 physical maps',()=>{
  for(const name of files){const j=source(name).json;
   expect(j.extensionsRequired).toContain('KHR_texture_basisu');expect(j.extensionsUsed).toContain('EXT_meshopt_compression');
   const maps=['../textures/water-color.ktx2','../textures/hero-orm.ktx2','../textures/hero-normal.ktx2'];
   if(name==='road')maps.push('../textures/street-water-shadows.ktx2');
   if(name==='road')for(const family of ['asphalt','trim'])for(const map of ['color','normal','orm'])maps.push(`../textures/street-${family}-${map}.ktx2`);
   expect(new Set(j.images.map((image:any)=>image.uri))).toEqual(new Set(maps));
   expect(j.materials).toHaveLength(name==='road'?4:1);expect(j.materials.map((m:any)=>m.name)).toContain('CivicOpsWaterAtlas');
  }
  const b=readFileSync(new URL('../../public/textures/water-color.ktx2',import.meta.url));expect(b.readUInt32LE(20)).toBe(512);expect(b.readUInt32LE(24)).toBe(512);
 });
 it('keeps the scene full-scale with a standing road datum and compact payload',()=>{
  const root=source('road').json.nodes.find((node:any)=>node.name==='WaterStreetEnvironment');
  expect(root.scale??[1,1,1]).toEqual([1,1,1]); expect(root.translation[1]).toBeCloseTo(-.705,2);
  expect(root.extras.roadWidthMetres).toBe(14); expect(root.extras.laneWidthMetres).toBe(3.5);
  expect(root.extras.trenchDepthMetres).toBeGreaterThanOrEqual(.5); expect(root.extras.horizonMetres).toBeGreaterThanOrEqual(60);
 });
 it('bakes metre dimensions into node anchors instead of relying on a tabletop root scale',()=>{
  const j=source('road').json;
  const root=j.nodes.find((node:any)=>node.name==='WaterStreetEnvironment');
  expect(root.scale??[1,1,1]).toEqual([1,1,1]);
  const seats=['A','B','C','D'].map((letter)=>anchor(j,`ValveSeat${letter}`));
  expect(Math.abs(seats[0][0]-seats[1][0])).toBeCloseTo(6.4,1);
  expect(Math.abs(seats[0][2]-seats[3][2])).toBeCloseTo(2.6,1);
  const trench=anchor(j,'TrenchEntry'); expect(trench[0]).toBeGreaterThan(2); expect(trench[1]).toBeCloseTo(.195,2);
  const fixed=j.nodes.find((node:any)=>node.name==='WaterStreetEnvironment-ManufacturedAssembly');
  expect(fixed?.mesh).toBeTypeOf('number');
  expect(j.nodes.some((node:any)=>node.name==='WaterStreetEnvironment' && (node.scale?.some((value:number)=>value!==1) ?? false))).toBe(false);
 });
 it('paves the approach under a standing trainee and keeps a local excavation',()=>{
  const {json:j,binary}=source('road');
  const root=j.nodes.find((node:any)=>node.name==='WaterStreetEnvironment');
  const fixed=j.nodes.find((node:any)=>node.name==='WaterStreetEnvironment-ManufacturedAssembly');
  const primitive=j.meshes[fixed.mesh].primitives[0];
  const position=j.accessors[primitive.attributes.POSITION];
  const indices=j.accessors[primitive.indices];
  const pView=j.bufferViews[position.bufferView];
  const iView=j.bufferViews[indices.bufferView];
  const scale=fixed.scale?.[0] ?? 1;
  const translation=fixed.translation ?? [0,0,0];
  const rootY=root.translation?.[1] ?? 0;
  const stride=pView.byteStride ?? 6;
  const point=(index:number)=>{
   const offset=(pView.byteOffset??0)+index*stride;
   const x=binary.readInt16LE(offset), y=binary.readInt16LE(offset+2), z=binary.readInt16LE(offset+4);
   return [x/32767*scale+translation[0], y/32767*scale+translation[1]+rootY, z/32767*scale+translation[2]];
  };
  const readIndex=(n:number)=>indices.componentType===5123?binary.readUInt16LE((iView.byteOffset??0)+n*2):binary.readUInt32LE((iView.byteOffset??0)+n*4);
  const surfaces=(px:number,pz:number)=>{
   let top=-Infinity, bottom=Infinity;
   for(let t=0;t<indices.count;t+=3){
    const a=point(readIndex(t)), b=point(readIndex(t+1)), c=point(readIndex(t+2));
    if(Math.min(a[0],b[0],c[0])>px||Math.max(a[0],b[0],c[0])<px||Math.min(a[2],b[2],c[2])>pz||Math.max(a[2],b[2],c[2])<pz)continue;
    const edge=(p:number[],q:number[])=>(q[0]-p[0])*(pz-p[2])-(q[2]-p[2])*(px-p[0]);
    const w0=edge(b,c), w1=edge(c,a), w2=edge(a,b);
    const same=(w0>=-1e-3&&w1>=-1e-3&&w2>=-1e-3)||(w0<=1e-3&&w1<=1e-3&&w2<=1e-3);
    const area=w0+w1+w2; if(!same||Math.abs(area)<1e-8)continue;
    const y=(a[1]*w0+b[1]*w1+c[1]*w2)/area;
    top=Math.max(top,y); bottom=Math.min(bottom,y);
   }
   return {top,bottom};
  };
  const approach=surfaces(0,8);
  expect(approach.top, 'centre approach under the spawn').toBeGreaterThan(-0.05);
  expect(approach.top).toBeLessThan(0.15);
  const standing=surfaces(0.2,5.2);
  expect(standing.top, 'hero viewpoint on asphalt').toBeGreaterThan(-0.05);
  expect(standing.top).toBeLessThan(0.15);
  const cut=surfaces(0,1);
  expect(cut.bottom, 'excavation floor').toBeLessThan(-0.4);
  expect(cut.bottom).toBeGreaterThan(-0.8);
 });
 it('measures the merged road accessor at real lane and horizon dimensions',()=>{
  const j=source('road').json;
  const root=j.nodes.find((node:any)=>node.name==='WaterStreetEnvironment');
  const fixed=j.nodes.find((node:any)=>node.name==='WaterStreetEnvironment-ManufacturedAssembly');
  const primitive=j.meshes[fixed.mesh].primitives[0];
  const position=j.accessors[primitive.attributes.POSITION];
  expect(position.componentType).toBe(5122); expect(position.normalized).toBe(true);
  const unit=32767; const scale=fixed.scale?.[0] ?? 1;
  const positions=j.meshes[fixed.mesh].primitives.map((p:any)=>j.accessors[p.attributes.POSITION]);
  const min=[0,1,2].map(i=>Math.min(...positions.map((p:any)=>p.min[i]/unit*scale+fixed.translation[i])));
  const max=[0,1,2].map(i=>Math.max(...positions.map((p:any)=>p.max[i]/unit*scale+fixed.translation[i])));
  const rootY=root.translation[1] ?? 0;
  expect(max[0]-min[0]).toBeGreaterThan(30); expect(max[0]-min[0]).toBeLessThan(33);
  expect(max[2]-min[2]).toBeGreaterThan(157); expect(max[2]-min[2]).toBeLessThan(159);
  expect(min[1]+rootY).toBeLessThan(-1); expect(max[1]+rootY).toBeGreaterThan(9);
 });
 it('bounds the enhanced street and three tools to 35k unique triangles and 2.4MB',()=>{
  let triangles=0,bytes=0;
  for(const name of files){const {json:j,binary}=source(name);bytes+=binary.length+JSON.stringify(j).length+28;
   triangles+=j.meshes.reduce((n:number,m:any)=>n+m.primitives.reduce((p:number,prim:any)=>p+j.accessors[prim.indices].count/3,0),0);
  }
  expect(triangles).toBeLessThanOrEqual(35000);expect(bytes).toBeLessThan(2_400_000);
 });
 it('ships nonempty standard fallback bytes equal to every compressed view',async()=>{
  await MeshoptDecoder.ready;
  for(const name of files){const {json:j,binary}=source(name);expect(j.buffers).toHaveLength(1);expect(j.extensionsRequired).not.toContain('EXT_meshopt_compression');
   for(const v of j.bufferViews){const x=v.extensions?.EXT_meshopt_compression;if(!x)continue;
    const out=new Uint8Array(x.count*x.byteStride);MeshoptDecoder.decodeGltfBuffer(out,x.count,x.byteStride,binary.subarray(x.byteOffset,x.byteOffset+x.byteLength),x.mode,x.filter);
    const fallback=binary.subarray(v.byteOffset,v.byteOffset+v.byteLength);expect(fallback.some((b:number)=>b!==0)).toBe(true);expect(fallback.equals(Buffer.from(out))).toBe(true);
   }
  }
 });
});

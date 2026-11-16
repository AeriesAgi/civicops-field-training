import {readFileSync} from 'node:fs';
import {beforeAll,describe,expect,it} from 'vitest';
import {Box3,Matrix4,Triangle,Vector3} from '@iwsdk/core';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {ROADS_STAGING,ROADS_CREW_STANDBY} from './roads-staging';
import {createGoodRoadsLayout} from './roads-geometry';
import {performRoads,startRoads,type RoadsEvent,type RoadsState} from './roads-procedure';
import {createRoadsScenario} from './modules/roads-zone';
import {samplePotholeIncident,type IncidentPose} from './roads-incident';
import {roadsPropHeight} from './roads-surfaces';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
let street:Triangle[];
let turnTriangles:Triangle[];
const scratch:number[]=[];
beforeAll(async()=>{
 const document=await io.read('public/models/roads-street.glb');street=[];
 for(const node of document.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
  const matrix=new Matrix4().fromArray(node.getWorldMatrix());
  const positions=primitive.getAttribute('POSITION')!,index=primitive.getIndices();
  const count=index?.getCount()??positions.getCount();
  for(let i=0;i<count;i+=3){
   const vertices=[0,1,2].map(j=>{positions.getElement(index?index.getScalar(i+j):i+j,scratch);return new Vector3(scratch[0],scratch[1],scratch[2]).applyMatrix4(matrix);});
   street.push(new Triangle(vertices[0],vertices[1],vertices[2]));
  }
 }
 const turnEnvelope=new Box3(new Vector3(24,.7,-1.5),new Vector3(38,2.8,8));
 turnTriangles=street.filter(t=>turnEnvelope.intersectsTriangle(t));
});
const volume=(x:number,z:number,halfX:number,halfZ:number,minY=.7,maxY=2.8)=>new Box3(new Vector3(x-halfX,minY,z-halfZ),new Vector3(x+halfX,maxY,z+halfZ));
const hits=(box:Box3)=>street.filter(t=>box.intersectsTriangle(t)).length;
const localTriangle=new Triangle(),localBox=volume(0,0,1.34,2.7);
function taxiHits(p:IncidentPose){
 const c=Math.cos(p.yaw),s=Math.sin(p.yaw);let count=0;
 for(const triangle of turnTriangles){
  for(const [target,source] of [[localTriangle.a,triangle.a],[localTriangle.b,triangle.b],[localTriangle.c,triangle.c]]){
   const x=source.x-p.x,z=source.z-p.z;target.set(x*c-z*s,source.y,x*s+z*c);
  }
  if(localBox.intersectsTriangle(localTriangle))count++;
 }
 return count;
}

const start=()=>startRoads(createRoadsScenario(0,['rain-incident']));
const act=(s:RoadsState,e:RoadsEvent)=>performRoads(s,e,s.lastEventAtMs+1000);
function protectedSite(){
 let s=act(act(start(),'incident:refuge'),'incident:radio');s=act(s,'brief-driver');s=act(s,{type:'beacon',on:true});
 const l=createGoodRoadsLayout();
 for(const [kind,parts] of [['warning',[l.warning!]],['cone',l.cones],['keep-left',[l.keepLeft!]],['barrier',l.barriers]] as const)
  for(const placement of parts)s=act(s,{type:'place',kind,placement});
 return s;
}
describe('Roads protected crew dispatch and full-scale staging',()=>{
 it('keeps the complete van body and mirrors outside live traffic and the decoded frontage',()=>{
  const p=ROADS_STAGING.van;expect(p.z-1.34).toBeGreaterThan(3.5);
  expect(hits(volume(p.x,p.z,2.70,1.34))).toBe(0);
 });
 it('detects the former trader overlap and keeps both walking corridors clear of decoded street triangles',()=>{
  expect(hits(volume(3,5.5,.4,.4,.5,2.4))).toBeGreaterThan(0);
  for(let i=0;i<2;i++)for(let n=0;n<=20;n++){
   const a=ROADS_CREW_STANDBY[i],b=i?ROADS_STAGING.downstream:ROADS_STAGING.upstream;
   const x=a.x+(b.x-a.x)*n/20;
   expect(hits(volume(x,b.z,.65,.5,roadsPropHeight(x,b.z)+.1,2.65)),`${i}/${n}`).toBe(0);
  }
 });
 it('keeps the complete damaged taxi bay clear of the street, both crew routes and the work perimeter',()=>{
  const p=ROADS_STAGING.casualtyBay,box=volume(p.x,p.z,2.7,1.34);
  expect(hits(box)).toBe(0);expect(p.z-1.34).toBeGreaterThan(3.5);
  for(const crew of [ROADS_STAGING.upstream,ROADS_STAGING.downstream,...ROADS_CREW_STANDBY])expect(box.intersectsBox(volume(crew.x,crew.z,.65,.5))).toBe(false);
 });
 it('preserves continuous strike-to-shoulder motion and clears crew volumes throughout the turn',()=>{
  const pose:IncidentPose={x:0,z:0,yaw:0,roll:0,hazards:false,stage:'approach'};
  let prior:IncidentPose|undefined;
  for(let n=0;n<=1400;n++){
   samplePotholeIncident(n/100,pose);
   if(prior)expect(Math.hypot(pose.x-prior.x,pose.z-prior.z)).toBeLessThan(.08);
   if(n>=800){
    expect(taxiHits(pose),`taxi scenery @ ${n/100}`).toBe(0);
    for(const crew of [ROADS_STAGING.upstream,ROADS_STAGING.downstream,...ROADS_CREW_STANDBY]){
     const dx=crew.x-pose.x,dz=crew.z-pose.z;
     const along=dx*Math.sin(pose.yaw)+dz*Math.cos(pose.yaw),across=dx*Math.cos(pose.yaw)-dz*Math.sin(pose.yaw);
     const clearance=Math.hypot(Math.max(0,Math.abs(along)-2.7),Math.max(0,Math.abs(across)-1.34));
     expect(clearance,`taxi crew @ ${n/100}`).toBeGreaterThan(.7);
    }
   }
   prior={...pose};
  }
 },30000);
 it('stops premature driver instructions before refuge and radio',()=>{
  expect(act(start(),'brief-driver').failed).toBe(true);
  expect(act(act(start(),'incident:refuge'),'brief-driver').failed).toBe(true);
 });
 it('holds a crew without protection, then waits for actual arrival before crediting the marshal gate',()=>{
  const early=act(act(start(),'incident:refuge'),'incident:radio');
  expect(act(early,'brief-marshals').crewDispatch).toBe('standby');
  expect(act(early,'marshals-arrived')).toBe(early);
  const s=protectedSite(),walking=act(s,'brief-marshals');
  expect(walking.crewDispatch).toBe('walking');expect(walking.layout.flaggers).toHaveLength(0);
  const arrived=act(walking,'marshals-arrived');expect(arrived.crewDispatch).toBe('on-station');
  expect(arrived.steps.some(r=>r.stepId==='position-flaggers'&&r.outcome==='correct')).toBe(true);
  expect(act(arrived,'brief-marshals')).toBe(arrived);
 });
 it('holds crew when protection changes while walking, then permits a fresh brief',()=>{
  const walking=act(protectedSite(),'brief-marshals');
  const changed=act(walking,{type:'remove',kind:'barrier',id:'barrier-1'});
  const held=act(changed,'marshals-arrived');expect(held.crewDispatch).toBe('standby');expect(held.layout.flaggers).toHaveLength(0);
  expect(act(held,'brief-marshals').crewDispatch).toBe('standby');
  expect(act(held,'reset').crewDispatch).toBe('standby');
 });
 it('requires commands rather than grabbable humans or a hand-lifted full-size van',()=>{
  const scene=JSON.parse(readFileSync('public/scenes/roads.iwsdk.scene.json','utf8'));
  const visit=(nodes:any[])=>{for(const n of nodes){if(['vehicle','flagger'].includes(n.components?.RoadsTarget?.kind)){
   expect(n.components.OneHandGrabbable).toBeUndefined();expect(n.components.RayInteractable).toBeUndefined();
  }visit(n.children??[]);}};visit(scene.nodes);
 });
});

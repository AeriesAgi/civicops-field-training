import {readFileSync} from 'node:fs';
import {beforeAll,describe,expect,it} from 'vitest';
import {Box3,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,PlaneGeometry,Raycaster,Vector3} from '@iwsdk/core';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {TaxiFleet} from '../scene-assets/taxi-fleet.js';
import {ROADS_GEOMETRY,createGoodRoadsLayout} from './roads-geometry.js';
import {trafficRoute,sampleRoadTraffic} from './roads-traffic.js';
let asset:Awaited<ReturnType<GLTFLoader['parseAsync']>>;
beforeAll(async()=>{
  const bytes=readFileSync(new URL('../../public/models/street-actors.glb',import.meta.url));
  asset=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
});
describe('licensed articulated assessment taxi fleet',()=>{
  it('keeps full-size source bounds inside the audited traffic footprint',()=>{
    const box=new Box3().setFromObject(asset.scene.getObjectByName('StreetTaxiTemplate')!);
    expect(Math.max(Math.abs(box.min.z),Math.abs(box.max.z))).toBeLessThan(ROADS_GEOMETRY.carHalfLength);
    expect(Math.max(Math.abs(box.min.x),Math.abs(box.max.x))).toBeLessThan(ROADS_GEOMETRY.carHalfWidth);
    expect(box.max.y).toBeGreaterThan(2.1);
  });
  it('tags exactly four wheel clusters and separate amber lenses in both detail levels',()=>{
    for(const name of ['StreetTaxiTemplateMesh','StreetTaxiDistantMesh']){
      const source=asset.scene.getObjectByName(name) as Mesh;
      const tags=source.geometry.getAttribute('_fleet_part');
      const vertices=source.geometry.getAttribute('position');
      expect(tags.count).toBe(vertices.count);
      const groups=new Set<number>();let lamps=0,body=0;
      for(let i=0;i<tags.count;i++){
        const id=Math.round(tags.getX(i));expect(id).toBeGreaterThanOrEqual(0);expect(id).toBeLessThanOrEqual(4);
        groups.add(id);if(tags.getY(i)>.5)lamps++;if(id===0)body++;
      }
      expect([...groups].sort()).toEqual([0,1,2,3,4]);expect(lamps).toBeGreaterThan(4);expect(body).toBeGreaterThan(100);
    }
  });
  it('retains front and side coverage in the distant silhouette under 3,100 triangles',()=>{
    const source=asset.scene.getObjectByName('StreetTaxiDistantMesh') as Mesh;
    expect(source.geometry.index!.count/3).toBeLessThan(3100);
    const ray=new Raycaster();asset.scene.updateMatrixWorld(true);
    for(const y of [.65,1.1,1.6])for(const x of [-.6,0,.6]){
      ray.set(new Vector3(x,y,4),new Vector3(0,0,-1));expect(ray.intersectObject(source).length).toBeGreaterThan(0);
      ray.set(new Vector3(3,y,x),new Vector3(-1,0,0));expect(ray.intersectObject(source).length).toBeGreaterThan(0);
    }
  });
  it('packs only visible LOD instances, preserves stationary tyres and owns its resources',()=>{
    const fleet=new TaxiFleet(asset.scene,3,'TestFleet');
    fleet.set(0,0,.07,0,0,5);fleet.set(1,10,.07,0,0,30);fleet.set(2,20,.07,0,0,8,false);fleet.flush();
    expect(fleet.near.count).toBe(1);expect(fleet.distant.count).toBe(1);
    fleet.set(0,1,.07,0,0,5);fleet.set(1,10,.07,0,0,30);fleet.flush();
    const motion=fleet.near.geometry.getAttribute('fleetMotion');const spin=motion.getX(0);expect(spin).toBeGreaterThan(0);
    fleet.set(0,1,.07,0,0,5);fleet.set(1,10,.07,0,0,30);fleet.flush();expect(motion.getX(0)).toBe(spin);
    expect(fleet.near.geometry).not.toBe((asset.scene.getObjectByName('StreetTaxiTemplateMesh') as Mesh).geometry);
    const shadows=new InstancedMesh(new PlaneGeometry(1,1),new MeshBasicMaterial(),3),matrix=new Matrix4();
    fleet.writeShadows(shadows);shadows.getMatrixAt(0,matrix);expect(matrix.elements[13]).toBeCloseTo(.082);
    expect(matrix.elements[12]).toBeCloseTo(1);shadows.getMatrixAt(2,matrix);expect(matrix.elements[0]).toBe(0);
    shadows.geometry.dispose();(shadows.material as MeshBasicMaterial).dispose();shadows.dispose();
    fleet.dispose();
  });
  it('uses only the explicit prototype scope when a reused van has matching source names',()=>{
    const root=new Group(),wrong=new Group();wrong.name='StreetTaxiTemplate';wrong.userData.wheelCentres=[];
    root.add(wrong,asset.scene);root.updateMatrixWorld(true);
    const fleet=new TaxiFleet(root,1,'ScopedFleet',asset.scene);
    expect(fleet.near.geometry.getAttribute('position').count).toBeGreaterThan(100);
    fleet.dispose();asset.scene.removeFromParent();
  });
  it('stops the nose upstream of the marshal, stays inside the open lane and leaves a queue gap',()=>{
    const route=trafficRoute(createGoodRoadsLayout(),true);
    const p={x:0,z:0,yaw:0,reaction:'cruise' as const};
    sampleRoadTraffic(11,0,route,p);
    expect(p.x+ROADS_GEOMETRY.carHalfLength).toBeLessThan(route.stopX-.3);
    expect(p.z-ROADS_GEOMETRY.carHalfWidth).toBeGreaterThan(-3.5);
    expect(p.z+ROADS_GEOMETRY.carHalfWidth).toBeLessThan(0);
    const front=p.x;sampleRoadTraffic(11,7.7,route,p);expect(front-p.x-2*ROADS_GEOMETRY.carHalfLength).toBeGreaterThan(1);
  });
});

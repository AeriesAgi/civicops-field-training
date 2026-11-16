import {readFileSync} from 'node:fs';
import {beforeAll,describe,expect,it} from 'vitest';
import {AnimationClip,AnimationMixer,Box3,QuaternionKeyframeTrack,Group,Mesh,Raycaster,SkinnedMesh,Vector3,type Object3D} from '@iwsdk/core';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {roadsPropHeight} from './roads-surfaces.js';
import {streetActorSource} from '../street-life-system.js';
import {RoadsMarshal} from '../scene-assets/roads-marshal.js';
let marshal:Awaited<ReturnType<GLTFLoader['parseAsync']>>,van:typeof marshal;
const update=(root:Object3D)=>{root.updateMatrixWorld(true);root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});};
beforeAll(async()=>{
  const load=async(name:string)=>{const bytes=readFileSync(new URL(`../../public/models/${name}.glb`,import.meta.url));return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
  [marshal,van]=await Promise.all([load('roads-marshal'),load('roads-crew-van')]);
});
describe('licensed Roads crew, actual decoded geometry and motion',()=>{
  it('grounds authored tools and crew on the correct pavement/refuge receiver',()=>{
    expect(roadsPropHeight(-10,4.65)).toBe(.42);
    expect(roadsPropHeight(4.4,4.65)).toBe(.47);expect(roadsPropHeight(22,4.65)).toBe(.47);
    expect(roadsPropHeight(3,3)).toBe(.07);expect(roadsPropHeight(3,3.65)).toBe(.28);
    expect(roadsPropHeight(3,-4.65)).toBe(.42);
    const scene=JSON.parse(readFileSync(new URL('../../public/scenes/roads.iwsdk.scene.json',import.meta.url),'utf8'));
    const visit=(node:Record<string,any>)=>{if(node.components?.RoadsTarget){const [x,y,z]=node.transform.position;expect(y).toBe(roadsPropHeight(x,z));}for(const child of node.children??[])visit(child);};
    for(const node of scene.nodes)visit(node);
  });
  it('ships no third-party baked motion and no taxi or source reference rig in the marshal package',()=>{
    expect(marshal.animations).toEqual([]);
    expect(marshal.scene.getObjectByName('StreetTaxiTemplateMesh')).toBeUndefined();
    marshal.scene.traverse(o=>expect(o.name).not.toMatch(/mixamo|Beta_Surface|Beta_Joints/));
    const skin=marshal.scene.getObjectByName('StreetPedestrianTemplateMesh') as SkinnedMesh;
    expect(skin.isSkinnedMesh).toBe(true);expect(skin.geometry.getAttribute('skinWeight')).toBeDefined();
    expect(marshal.scene.getObjectByName('RoadMarshal')!.userData.noIdentityFeatures).toBe(true);
  });
  it('grounds the actual skin and keeps the paddle attached within an adult-sized envelope',()=>{
    const mixer=new AnimationMixer(marshal.scene),point=new Vector3();
    for(const clip of marshal.animations){
      mixer.stopAllAction();mixer.clipAction(clip).play();
      for(const fraction of [0,.25,.5,.75]){
        mixer.setTime(clip.duration*fraction);update(marshal.scene);
        const box=new Box3().setFromObject(marshal.scene);
        expect(Math.abs(box.min.y),`${clip.name} floor`).toBeLessThan(.02);
        expect(box.max.y).toBeGreaterThan(clip.name==='Interact'?1.4:1.55);expect(box.max.y).toBeLessThan(2.3);
        expect(box.max.x-box.min.x).toBeLessThan(1.8);
        const board=marshal.scene.getObjectByName('HeldTrainingBoard')!,hand=marshal.scene.getObjectByName('WristL')??marshal.scene.getObjectByName('Wrist.L')!;
        expect(board.getWorldPosition(point).distanceTo(hand.getWorldPosition(new Vector3()))).toBeLessThan(.08);
        const skin=marshal.scene.getObjectByName('StreetPedestrianTemplateMesh') as SkinnedMesh;
        const index=skin.skeleton.bones.indexOf(hand as typeof skin.skeleton.bones[number]),indices=skin.geometry.getAttribute('skinIndex'),weights=skin.geometry.getAttribute('skinWeight');
        const centre=new Vector3(),vertex=new Vector3();let count=0;
        for(let i=0;i<indices.count;i++)for(let j=0;j<4;j++)if(indices.getComponent(i,j)===index&&weights.getComponent(i,j)>.5){skin.getVertexPosition(i,vertex).applyMatrix4(skin.matrixWorld);centre.add(vertex);count++;}
        expect(count).toBeGreaterThan(0);centre.divideScalar(count);
        expect(board.getWorldPosition(point).distanceTo(centre),'paddle touches actual skinned palm').toBeLessThan(.08);
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(marshal.scene);
  });
  it('scopes actor templates away from reused marshal and service-van node names',()=>{
    const root=new Group(),templates=new Group();templates.name='street-actors';
    const scene=marshal.scene.clone(true);root.add(scene,templates);
    const rig=new Group();rig.name='StreetWorkerRig';templates.add(rig);
    expect(root.getObjectByName('StreetWorkerRig')).not.toBe(rig);
    expect(streetActorSource(root)?.getObjectByName('StreetWorkerRig')).toBe(rig);
    expect(streetActorSource(new Group())).toBeUndefined();
  });
  it('retains actual moving bone tracks rather than constant NLA export poses',()=>{
    const mixer=new AnimationMixer(marshal.scene),bone=marshal.scene.getObjectByName('Chest')!;
    for(const clip of marshal.animations){
      mixer.stopAllAction();mixer.clipAction(clip).play();mixer.setTime(0);update(marshal.scene);
      const before=bone.matrixWorld.clone();mixer.setTime(clip.duration*.43);update(marshal.scene);
      expect(bone.matrixWorld.equals(before),clip.name).toBe(false);
    }
    mixer.stopAllAction();mixer.uncacheRoot(marshal.scene);
  });
  it('changes only the selected marshal to GO and restores STOP on retry',()=>{
    const a=new RoadsMarshal(new Group(),marshal.scene,marshal.animations),b=new RoadsMarshal(new Group(),marshal.scene,marshal.animations);
    a.update(.1,true,false);b.update(.1,false,false);
    expect(a.visual.getObjectByName('StopFace')!.visible).toBe(false);
    expect(a.visual.getObjectByName('GoFace')!.visible).toBe(true);
    expect(b.visual.getObjectByName('StopFace')!.visible).toBe(true);
    const skin=(o:Object3D)=>{let result!:SkinnedMesh;o.traverse(n=>{if(n instanceof SkinnedMesh)result=n;});return result;};
    expect(skin(a.visual).skeleton.bones[0]).not.toBe(skin(b.visual).skeleton.bones[0]);
    expect(skin(a.visual).geometry).toBe(skin(b.visual).geometry);
    a.update(.1,false,false);expect(a.visual.getObjectByName('StopFace')!.visible).toBe(true);
    a.dispose();b.dispose();expect(a.visual.parent).toBeNull();
  });
  it('plays a supplied Walk clip on a marshal and preserves STOP throughout deployment',()=>{
    const walk=new AnimationClip('Walk',1,[new QuaternionKeyframeTrack('Chest.quaternion',[0,.5,1],[0,0,0,1,0,.2588,0,.9659,0,0,0,1])]);
    const actor=new RoadsMarshal(new Group(),marshal.scene,[...marshal.animations,walk]);
    actor.update(.1,false,false,true);update(actor.visual);
    const bone=actor.visual.getObjectByName('Chest')!,before=bone.matrixWorld.clone();
    for(let i=0;i<4;i++)actor.update(.1,false,false,true);update(actor.visual);
    expect(bone.matrixWorld.equals(before)).toBe(false);
    expect(actor.visual.getObjectByName('StopFace')!.visible).toBe(true);
    expect(actor.visual.getObjectByName('GoFace')!.visible).toBe(false);
    expect(new Box3().setFromObject(actor.visual).min.y).toBeGreaterThan(-.06);
    actor.update(.1,false,false,false);actor.dispose();
  });
  it('holds crew motion in reduced mode while still changing the readable traffic instruction',()=>{
    const actor=new RoadsMarshal(new Group(),marshal.scene,marshal.animations);
    actor.update(.1,false,true);update(actor.visual);const bone=actor.visual.getObjectByName('Chest')!,before=bone.matrixWorld.clone();
    for(let i=0;i<10;i++)actor.update(.1,false,true);update(actor.visual);expect(bone.matrixWorld.equals(before)).toBe(true);
    actor.update(.1,true,true);expect(actor.visual.getObjectByName('GoFace')!.visible).toBe(true);actor.dispose();
  });
  it('removes only tagged route surfaces and retains solid van body/glazing',()=>{
    update(van.scene);const ray=new Raycaster();
    for(const side of [-1,1])for(const y of [.65,1.1,1.6,1.9])for(const z of [-.5,0,.5]){
      ray.set(new Vector3(side*4,y,z),new Vector3(-side,0,0));
      expect(ray.intersectObject(van.scene,true).length,`${side}/${y}/${z}`).toBeGreaterThan(0);
    }
    van.scene.traverse(o=>{if(o instanceof Mesh){
      const tag=o.geometry.getAttribute('_service_part');
      if(tag)for(let i=0;i<tag.count;i++)expect(tag.getX(i)).toBeLessThan(.5);
      const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)for(const value of [p.getX(i),p.getY(i),p.getZ(i)])expect(Number.isFinite(value)).toBe(true);
    }});
  });
  it('uses a grounded full-size cone van within the audited vehicle footprint',()=>{
    update(van.scene);const box=new Box3().setFromObject(van.scene),size=box.getSize(new Vector3());
    expect(Math.abs(box.min.y)).toBeLessThan(.006);expect(size.x).toBeGreaterThan(5.2);expect(size.x).toBeLessThan(5.4);
    expect(size.z).toBeLessThan(2.68);expect(size.y).toBeGreaterThan(2.2);expect(size.y).toBeLessThan(2.6);
    const root=van.scene.getObjectByName('MunicipalConeVan')!;expect(root.userData.badgesRemoved).toBe(true);expect(root.userData.destinationRemoved).toBe(true);
    expect(van.scene.getObjectByName('StreetWorkerRig')).toBeUndefined();
    const beacon=van.scene.getObjectByName('Beacon')!,beaconBounds=new Box3().setFromObject(beacon);
    expect(beaconBounds.min.y-root.userData.beaconRoofHeight).toBeCloseTo(.035,3);
    let triangles=0,draws=0;van.scene.traverse(o=>{if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;draws++;}});
    expect(triangles).toBeLessThan(6000);expect(draws).toBe(2);
  });
});

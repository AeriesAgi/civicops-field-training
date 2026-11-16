import {readFileSync} from 'node:fs';
import {beforeAll,describe,expect,it} from 'vitest';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {BufferGeometry,Float32BufferAttribute,Matrix4,Mesh,MeshBasicMaterial,Triangle,Vector3} from '@iwsdk/core';
let geometry:BufferGeometry,grip:Vector3;
beforeAll(async()=>{
  await MeshoptDecoder.ready;
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read('public/models/roads-barrier.glb');
  const node=doc.getRoot().listNodes().find(n=>n.getMesh())!,primitive=node.getMesh()!.listPrimitives()[0],p=primitive.getAttribute('POSITION')!;
  const positions=new Float32Array(p.getCount()*3),value=[0,0,0];
  for(let i=0;i<p.getCount();i++){p.getElement(i,value);positions.set(value,i*3);}
  geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
  geometry.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix()));
  grip=new Vector3().fromArray(doc.getRoot().listNodes().find(n=>n.getName()==='Grip')!.getWorldTranslation());
});
const triangle=new Triangle(),closest=new Vector3();
function distance(mesh:Mesh,point:Vector3):number {
  const p=mesh.geometry.getAttribute('position'),index=mesh.geometry.index!;let best=Infinity;
  for(let i=0;i<index.count;i+=3){
    triangle.a.fromBufferAttribute(p,index.getX(i)).applyMatrix4(mesh.matrixWorld);
    triangle.b.fromBufferAttribute(p,index.getX(i+1)).applyMatrix4(mesh.matrixWorld);
    triangle.c.fromBufferAttribute(p,index.getX(i+2)).applyMatrix4(mesh.matrixWorld);
    triangle.closestPointToPoint(point,closest);best=Math.min(best,closest.distanceTo(point));
  }
  return best;
}
describe('actual barrier rail contact in the sixteen-part street layout',()=>{
  it('places its named Grip on a real solid rail, away from joined corners',()=>{
    const mesh=new Mesh(geometry,new MeshBasicMaterial());mesh.updateMatrixWorld(true);
    expect(distance(mesh,grip)).toBeLessThan(.07);
    (mesh.material as MeshBasicMaterial).dispose();
  });
  it('keeps every other movable barrier outside a doubled 70mm contact envelope',()=>{
    const scene=JSON.parse(readFileSync('public/scenes/roads.iwsdk.scene.json','utf8'));
    const nodes:any[]=[];const visit=(node:any)=>{if(node.components?.RoadsTarget?.kind==='barrier')nodes.push(node);for(const child of node.children??[])visit(child);};
    for(const root of scene.nodes)visit(root);expect(nodes).toHaveLength(16);
    const material=new MeshBasicMaterial(),meshes=nodes.map(node=>{const m=new Mesh(geometry,material);m.name=node.id;m.position.fromArray(node.transform.position);m.rotation.y=(node.transform.rotationDeg?.[1]??0)*Math.PI/180;m.updateMatrixWorld(true);return m;});
    for(const target of meshes){
      const contact=grip.clone().applyMatrix4(target.matrixWorld);
      expect(distance(target,contact),target.name+' solid grip').toBeLessThan(.07);
      for(const other of meshes)if(other!==target)expect(distance(other,contact),`${target.name} / ${other.name} ambiguous contact`).toBeGreaterThan(.14);
    }
    material.dispose();geometry.dispose();
  });
});

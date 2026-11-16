import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Texture, Vector3 } from '@iwsdk/core';
import { MovingAtlasBatch } from '../scene-assets/moving-atlas-batch.js';

function fixture() {
  const parent = new Group(); parent.position.set(5, .3, -2);
  const material = new MeshStandardMaterial(); material.name = 'Atlas'; material.map = new Texture(); material.map.name = 'shared';
  const roots = [new Group(), new Group()];
  const meshes = roots.map((root, index) => {
    const mesh = new Mesh(new BoxGeometry(1, 2, 1), material);
    mesh.position.set(.2, .1, -.3); mesh.scale.set(.7, 1.2, 1.1);
    root.add(mesh); root.position.set(index * 3, 0, -1); parent.add(root); return mesh;
  });
  const batch = new MovingAtlasBatch(parent, roots, 'Atlas'); parent.add(batch.mesh);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>' };
  (batch.mesh.material as MeshStandardMaterial).onBeforeCompile(shader as never, {} as never);
  const matrices = (shader.uniforms as {partTransforms: {value: Matrix4[]}}).partTransforms.value;
  return { parent, roots, meshes, material, batch, matrices, shader };
}

describe('independently moving surfaces in one atlas draw', () => {
  it('bakes glTF child transforms and follows a held root in the session frame', () => {
    const f = fixture(); f.roots[1].position.set(-3, 1.7, 6); f.roots[1].rotation.y = .8; f.batch.update();
    const geometry = f.batch.mesh.geometry;
    const ids = geometry.getAttribute('partIndex'); const positions = geometry.getAttribute('position');
    const first = Array.from({length: ids.count}, (_, i) => i).find(i => ids.getX(i) === 1)!;
    const actual = new Vector3().fromBufferAttribute(positions, first).applyMatrix4(f.matrices[1]);
    const original = f.meshes[1].geometry.toNonIndexed();
    f.parent.updateMatrixWorld(true);
    const expected = new Vector3().fromBufferAttribute(original.getAttribute('position'), 0)
      .applyMatrix4(f.meshes[1].matrixWorld).applyMatrix4(f.parent.matrixWorld.clone().invert());
    expect(actual.distanceTo(expected)).toBeLessThan(.00001);
    original.dispose(); f.batch.dispose();
  });
  it('retains exact visible interaction objects and restores borrowed materials on exit', () => {
    const f=fixture(); let textureDisposals=0; f.material.map!.addEventListener('dispose',()=>textureDisposals++);
    expect(f.meshes[0].visible).toBe(true); expect((f.meshes[0].material as MeshStandardMaterial).visible).toBe(false);
    expect(f.batch.mesh.geometry.getAttribute('partIndex').count).toBe(72);
    f.batch.dispose(); expect(f.meshes[0].material).toBe(f.material); expect(f.material.visible).toBe(true); expect(textureDisposals).toBe(0);
  });
  it('honours hidden roots and rotates normals with their surfaces', () => {
    const f=fixture(); f.roots[0].visible=false; f.batch.update();
    expect(new Vector3(1,2,3).applyMatrix4(f.matrices[0]).length()).toBe(0);
    expect(f.shader.vertexShader).toContain('objectNormal = mat3(partTransforms');
    expect(f.shader.vertexShader).toContain('uniform mat4 partTransforms[24]'); f.batch.dispose();
  });
  it('keeps articulated or emissive lights outside the batch', () => {
    const parent=new Group(); const root=new Group(); parent.add(root);
    const fixed=new Mesh(new BoxGeometry(),new MeshStandardMaterial()); fixed.material.name='Atlas';root.add(fixed);
    const lamp=new Mesh(new BoxGeometry(),new MeshStandardMaterial({emissive:'#ff0000'}));lamp.material.name='Atlas';root.add(lamp);
    const batch=new MovingAtlasBatch(parent,[root],'Atlas');
    expect(lamp.material.visible).toBe(true);expect(batch.mesh.geometry.getAttribute('position').count).toBe(36);batch.dispose();
  });
  it('rejects too many roots before hiding any target', () => {
    expect(()=>new MovingAtlasBatch(new Group(),Array.from({length:25},()=>new Group()),'Atlas')).toThrow('uniform budget');
  });
});

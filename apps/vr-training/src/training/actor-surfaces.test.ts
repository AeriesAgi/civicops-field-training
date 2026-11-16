import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { AnimationClip, AnimationMixer, Box3, VectorKeyframeTrack, Mesh, Raycaster, SkinnedMesh, Vector3, type Object3D } from '@iwsdk/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { cloneCrewRig } from '../street-life-system.js';

let asset: Awaited<ReturnType<GLTFLoader['parseAsync']>>;
beforeAll(async () => {
  const bytes = readFileSync(new URL('../../public/models/street-actors.glb', import.meta.url));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  asset = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
});

function update(root: Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o instanceof SkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
}

describe('decoded actor surfaces, skin and baked motion', () => {
  it('retains a solid minibus front, glazing and sides after compression', () => {
    const taxi = asset.scene.getObjectByName('StreetTaxiTemplate')!;
    update(taxi);
    const ray = new Raycaster();
    for (const y of [.65, 1.1, 1.6, 1.9]) for (const x of [-.6, -.3, 0, .3, .6]) {
      ray.set(new Vector3(x, y, 4), new Vector3(0, 0, -1));
      expect(ray.intersectObject(taxi, true).length, `front x=${x}, y=${y}`).toBeGreaterThan(0);
    }
    for (const y of [.65, 1.1, 1.6]) for (const z of [-1, 0, 1]) {
      ray.set(new Vector3(3, y, z), new Vector3(-1, 0, 0));
      expect(ray.intersectObject(taxi, true).length, `side z=${z}, y=${y}`).toBeGreaterThan(0);
    }
  });
  it('ships no third-party baked motion and keeps a grounded, finite bind pose', () => {
    expect(asset.animations).toEqual([]);
    asset.scene.traverse(o => expect(o.name).not.toMatch(/mixamo|Beta_Surface|Beta_Joints/));
    const rig = cloneCrewRig(asset.scene.getObjectByName('StreetWorkerRig')!);
    update(rig);
    const box = new Box3().setFromObject(rig);
    for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v)).toBe(true);
    expect(box.max.y).toBeGreaterThan(1.4);
    expect(box.max.y).toBeLessThan(2.15);
  });
  it('retains all four tyre contacts through the actual instance decode transform', () => {
    const taxi = asset.scene.getObjectByName('StreetTaxiTemplate')!;
    const mesh = asset.scene.getObjectByName('StreetTaxiTemplateMesh') as Mesh;
    update(taxi);
    const position = mesh.geometry.getAttribute('position'), point = new Vector3();
    const corners = taxi.userData.wheelCentres as number[][];
    for (const centre of corners) {
      let lowest = Infinity;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(point.x-centre[0]) < .2 && Math.abs(point.z-centre[2]) < .45 && Math.abs(point.y-centre[1]) < .45) lowest = Math.min(lowest, point.y);
      }
      expect(Math.abs(lowest)).toBeLessThan(.005);
      // Match StreetLifeSystem: preserve decode, then place on the 41cm pavement.
      expect(Math.abs(lowest + .42 - .41)).toBeLessThan(.015);
    }
  });
  it('keeps each crew skeleton independent while sharing immutable surfaces', () => {
    const source = asset.scene.getObjectByName('StreetWorkerRig')!;
    const a = cloneCrewRig(source), b = cloneCrewRig(source);
    const skin = (root: Object3D) => { let mesh: SkinnedMesh | undefined; root.traverse(o => { if (o instanceof SkinnedMesh) mesh = o; }); return mesh!; };
    expect(skin(a).geometry).toBe(skin(b).geometry);
    expect(skin(a).skeleton.bones[0]).not.toBe(skin(b).skeleton.bones[0]);
    const mixer = new AnimationMixer(a); const bone = skin(a).skeleton.bones[0];
    mixer.clipAction(new AnimationClip('Probe', 1, [new VectorKeyframeTrack(`${bone.name}.position`, [0, 1], [0, 0, 0, 0, 1, 0])])).play();
    update(b); const before = new Box3().setFromObject(b).clone();
    mixer.setTime(.25); update(a); update(b);
    expect(new Box3().setFromObject(b).equals(before)).toBe(true);
    a.traverse(o => { if (o instanceof Mesh) expect(o.geometry).toBeDefined(); });
    mixer.stopAllAction(); mixer.uncacheRoot(a);
  });
});

import {
  BackSide, Bone, BufferAttribute, BufferGeometry, Group,
  Mesh, MeshBasicMaterial, Object3D, RingGeometry, Skeleton, SkinnedMesh,
  Uint16BufferAttribute, Vector3, SphereGeometry,
} from '@iwsdk/core';
import { mergeHoverSilhouette } from './hover-silhouette.js';
import { LoftSurface } from './lib/hardsurface.js';
import { sampleDemoPose, type DemoGesture, type DemoPose } from '../training/gesture-feedback.js';

/** Original CC0 continuous hand lofts. +Y points along fingers; palm faces -Z. */
export function createGhostHand(): { root: Group; mesh: SkinnedMesh<BufferGeometry, MeshBasicMaterial>; fingers: Bone[][]; thumb: Bone[] } {
  const root = new Group(); root.name = 'InstructorGhostHand';
  const points: number[] = [], indices: number[] = [], skinIds: number[] = [], weights: number[] = [];
  const bones: Bone[] = [];
  const wrist = new Bone(); wrist.name = 'GhostWrist'; bones.push(wrist);
  const addLoft = (geometry: BufferGeometry, boneId: number, x: number, y: number, z = 0): void => {
    const position = geometry.getAttribute('position');
    const base = points.length / 3;
    for (let i = 0; i < position.count; i++) {
      // Loft library sweeps local Z; the hand's anatomical sweep is local Y.
      points.push(position.getX(i) + x, position.getZ(i) + y, -position.getY(i) + z);
      skinIds.push(boneId, 0, 0, 0); weights.push(1, 0, 0, 0);
    }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i++) indices.push(base + geometry.index.getX(i));
    else for (let i = 0; i < position.count; i++) indices.push(base + i);
    geometry.dispose();
  };
  const palm = LoftSurface.tube([
    { z: -.014, halfW: .027, hUp: .014, hDown: .013, power: 2.7 },
    { z: .006, halfW: .027, hUp: .015, hDown: .012, power: 2.7 },
    { z: .032, halfW: .036, hUp: .015, hDown: .013, power: 2.9 },
    { z: .071, halfW: .038, hUp: .014, hDown: .011, power: 2.8 },
    { z: .091, halfW: .033, hUp: .011, hDown: .009, power: 2.4 },
  ]);
  addLoft(palm.build([-.014, .006, .020, .032, .051, .071, .083, .091], 14, true), 0, 0, 0);
  const fingers: Bone[][] = [];
  const xs = [-.025, -.007, .012, .030];
  const lengths = [[.033, .023, .020], [.039, .027, .022], [.036, .025, .020], [.027, .020, .017]];
  for (let finger = 0; finger < 4; finger++) {
    const chain: Bone[] = []; let y = .079;
    for (let part = 0; part < 3; part++) {
      const bone = new Bone(); bone.name = `Ghost${['Index', 'Middle', 'Ring', 'Little'][finger]}${part}`;
      if (part === 0) { bone.position.set(xs[finger], y, 0); wrist.add(bone); }
      else { bone.position.y = lengths[finger][part - 1]; chain[part - 1].add(bone); }
      const id = bones.length; bones.push(bone); chain.push(bone);
      const radius = (.009 - finger * .00065) * (1 - part * .15);
      const length = lengths[finger][part];
      const digit = LoftSurface.tube([
        { z: -.004, halfW: radius * .92, hUp: radius * .86, power: 2.1 },
        { z: .004, halfW: radius, hUp: radius * .95, power: 2.1 },
        { z: length * .62, halfW: radius * .89, hUp: radius * .84, power: 2.1 },
        { z: length, halfW: radius * .63, hUp: radius * .61, power: 2 },
        { z: length + .003, halfW: .0013, hUp: .0012, power: 2 },
      ]);
      addLoft(digit.build([-.004, .004, length * .32, length * .62, length, length + .003], 10, true), id, xs[finger], y);
      y += length;
    }
    fingers.push(chain);
  }
  // The opposing thumb has a rounded thenar root and two tapered phalanges.
  const thumb: Bone[] = [];
  for (let part = 0; part < 2; part++) {
    const bone = new Bone(); bone.name = `GhostThumb${part}`;
    if (part === 0) { bone.position.set(-.035, .039, 0); wrist.add(bone); }
    else { bone.position.set(-.023, .026, 0); thumb[0].add(bone); }
    const id = bones.length; bones.push(bone); thumb.push(bone);
    const r = part ? .009 : .015;
    const x = part ? -.058 : -.035, y = part ? .065 : .039;
    const length = part ? .024 : .033;
    const digit = LoftSurface.tube([
      { z: -.008, halfW: r, hUp: r * .8, power: 2.2 },
      { z: 0, halfW: r, hUp: r * .85, power: 2.2 },
      { z: length * .65, halfW: r * .78, hUp: r * .7, cx: -.008, power: 2.1 },
      { z: length, halfW: .004, hUp: .0035, cx: -.015, power: 2 },
    ]);
    addLoft(digit.build([-.008, 0, length * .3, length * .65, length], 12, true), id, x, y, -.001);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIds, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(weights), 4));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const material = new MeshBasicMaterial({ color: 0xa7eecb, transparent: true, opacity: .48, depthWrite: false, toneMapped: false });
  const mesh = new SkinnedMesh(geometry, material); mesh.name = 'ContinuousGhostGlove';
  mesh.add(wrist); mesh.bind(new Skeleton(bones)); mesh.frustumCulled = false;
  mesh.renderOrder = 4; root.add(mesh);
  return { root, mesh, fingers, thumb };
}

export interface GestureFeedback {
  root: Group;
  showDemo(gesture: DemoGesture, origin: Vector3, destination?: Vector3): void;
  hideDemo(): void;
  contact(position: Vector3, normal?: Vector3, depress?: (amount: number) => void): void;
  prepareHover(source: Object3D): void;
  showSnap(position: Vector3, scale?: Vector3, source?: Object3D): void;
  hideSnap(): void;
  showHover(position: Vector3, size: Vector3, source?: Object3D): void;
  hideHover(): void;
  unsafe(position: Vector3): void;
  update(delta: number): void;
  reset(): void;
  dispose(): void;
}

/** At most seven mono draws, no artistic textures; owned by the calling ECS entity. */
export function createGestureFeedback(): GestureFeedback {
  const root = new Group(); root.name = 'InstructorGestureFeedback';
  const hand = createGhostHand(); root.add(hand.root); hand.root.visible = false;
  hand.root.rotation.x = -Math.PI / 2;
  const makeRing = (name: string, color: number, inner: number, outer: number): Mesh<RingGeometry, MeshBasicMaterial> => {
    const ring = new Mesh(new RingGeometry(inner, outer, 32), new MeshBasicMaterial({
      color, transparent: true, opacity: .65, depthWrite: false, toneMapped: false,
    }));
    ring.name = name; ring.visible = false; ring.renderOrder = 5;
    root.add(ring); return ring;
  };
  const contactRing = makeRing('PokeContactRipple', 0xc7ffcf, .012, .016);
  const demoRing = makeRing('HoldDemoProgress', 0xc7ffcf, .024, .029);
  const snapRing = makeRing('MagnetSeatHalo', 0x9af7c6, .035, .043);
  const unsafeRing = makeRing('CalmSafetyPulse', 0xff4d4d, .044, .055);
  const fallback = new SphereGeometry(.5, 12, 8);
  const silhouetteCache = new Map<Object3D, BufferGeometry>();
  const outlineMaterial = new MeshBasicMaterial({ color: 0x9af7c6, side: BackSide,
    transparent: true, opacity: .7, depthWrite: false, toneMapped: false });
  outlineMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * 0.0016;');
  };
  outlineMaterial.customProgramCacheKey = () => 'civicops-object-contour-vr04';
  const outline = new Mesh<BufferGeometry, MeshBasicMaterial>(fallback, outlineMaterial);
  outline.name = 'PinchReadyContour'; outline.visible = false; root.add(outline);
  const snapGhost = new Mesh<BufferGeometry, MeshBasicMaterial>(fallback, new MeshBasicMaterial({ color: 0x9af7c6,
    transparent: true, opacity: .19, depthWrite: false, toneMapped: false }));
  snapGhost.name = 'MagnetObjectSilhouette'; snapGhost.visible = false; root.add(snapGhost);
  const origin = new Vector3(), destination = new Vector3(), normalZ = new Vector3(0, 0, 1);
  const pose: DemoPose = { approach: 0, curl: 0, pinch: 0, opacity: 0, ring: 0 };
  let gesture: DemoGesture = 'poke', demoSeconds = 0, rippleSeconds = -1, unsafeSeconds = -1, clock = 0;
  let benchDemo = false;
  let depress: ((amount: number) => void) | undefined;
  const finishContact = (): void => { if (depress) depress(0); depress = undefined; };
  return {
    root,
    showDemo(next, from, to) {
      gesture = next; origin.copy(from); destination.copy(to ?? from); demoSeconds = 0;
      benchDemo = (next === 'pinch-grab' || next === 'place') && from.y < 1.0;
      hand.root.rotation.x = benchDemo ? Math.PI : -Math.PI / 2;
      hand.root.visible = true; demoRing.visible = next === 'hold-to-confirm';
      demoRing.position.copy(from); demoRing.position.z += .006;
    },
    hideDemo() { hand.root.visible = false; demoRing.visible = false; },
    contact(position, normal, callback) {
      finishContact(); contactRing.position.copy(position); contactRing.visible = true; rippleSeconds = 0;
      contactRing.quaternion.identity();
      if (normal) contactRing.quaternion.setFromUnitVectors(normalZ, normal);
      contactRing.position.addScaledVector(normal ?? normalZ, .004);
      depress = callback; if (depress) depress(1);
    },
    prepareHover(source) {
      if (!silhouetteCache.has(source)) silhouetteCache.set(source, mergeHoverSilhouette(source));
    },
    showSnap(position, scale, source) {
      snapRing.position.copy(position); snapRing.position.z += .003;
      snapRing.scale.set(scale ? Math.max(.7, scale.x / .08) : 1, scale ? Math.max(.7, scale.z / .08) : 1, 1);
      snapRing.visible = true;
      snapGhost.visible = !!source && silhouetteCache.has(source);
      if (source && snapGhost.visible) {
        snapGhost.geometry = silhouetteCache.get(source)!; snapGhost.position.copy(position);
        source.getWorldQuaternion(snapGhost.quaternion); source.getWorldScale(snapGhost.scale);
      }
    },
    hideSnap() { snapRing.visible = false; snapGhost.visible = false; },
    showHover(position, size, source) {
      outline.position.copy(position);
      if (source && silhouetteCache.has(source)) {
        outline.geometry = silhouetteCache.get(source)!;
        source.getWorldPosition(outline.position); source.getWorldQuaternion(outline.quaternion); source.getWorldScale(outline.scale);
        outline.scale.multiplyScalar(1.025);
      } else {
        outline.geometry = fallback; outline.quaternion.identity(); outline.scale.copy(size).multiplyScalar(1.06);
      }
      outline.visible = true;
    },
    hideHover() { outline.visible = false; },
    unsafe(position) { unsafeRing.position.copy(position); unsafeRing.position.z += .015; unsafeRing.visible = true; unsafeSeconds = 0; },
    update(delta) {
      clock += delta;
      if (hand.root.visible) {
        demoSeconds += delta; sampleDemoPose(gesture, demoSeconds, pose);
        const travel = gesture === 'place' ? pose.approach : 0;
        hand.root.position.copy(origin).lerp(destination, travel);
        hand.root.position.x += .025;
        if (benchDemo) {
          // Come from above/back to reach the prop's top. A board-style +Z
          // approach would put a front-tray hand behind the seated viewer.
          hand.root.position.y += .18 + .06 * (1 - pose.approach);
          hand.root.position.z += -.12 + .075 * pose.approach;
        } else {
          hand.root.position.z += .161 + .095 * (1 - pose.approach);
        }
        hand.mesh.material.opacity = pose.opacity;
        for (let f = 0; f < 4; f++) {
          const curl = f === 0 ? pose.pinch * .48 : pose.curl;
          hand.fingers[f][0].rotation.x = -curl;
          hand.fingers[f][1].rotation.x = -curl * .8;
          hand.fingers[f][2].rotation.x = -curl * .6;
        }
        hand.thumb[0].rotation.z = -pose.pinch * .8;
        hand.thumb[0].rotation.x = -.32 * pose.pinch;
        hand.thumb[1].rotation.z = -pose.pinch * .45;
        demoRing.geometry.setDrawRange(0, Math.floor(pose.ring * 32) * 6);
        demoRing.material.opacity = pose.opacity;
      }
      if (rippleSeconds >= 0) {
        rippleSeconds += delta;
        const t = Math.min(1, rippleSeconds / .38);
        contactRing.scale.setScalar(.6 + t * 2.2); contactRing.material.opacity = (1 - t) * .8;
        if (depress) depress(Math.max(0, 1 - rippleSeconds / .18));
        if (t === 1) { contactRing.visible = false; rippleSeconds = -1; finishContact(); }
      }
      if (snapRing.visible) snapRing.material.opacity = .55 + .15 * Math.sin(clock * 4);
      if (outline.visible) outline.material.opacity = .55 + .12 * Math.sin(clock * 4);
      if (unsafeSeconds >= 0) {
        unsafeSeconds += delta;
        const t = Math.min(1, unsafeSeconds / 2.2);
        unsafeRing.scale.setScalar(1 + t * .7); unsafeRing.material.opacity = (1 - t) * (.45 + .3 * Math.sin(unsafeSeconds * 11));
        if (t === 1) { unsafeRing.visible = false; unsafeSeconds = -1; }
      }
    },
    reset() {
      finishContact(); rippleSeconds = -1; unsafeSeconds = -1; demoSeconds = 0;
      hand.root.visible = false; demoRing.visible = false; contactRing.visible = false;
      snapRing.visible = false; snapGhost.visible = false; outline.visible = false; unsafeRing.visible = false;
    },
    dispose() {
      finishContact(); hand.mesh.geometry.dispose(); hand.mesh.material.dispose(); hand.mesh.skeleton.dispose();
      for (const ring of [contactRing, demoRing, snapRing, unsafeRing]) { ring.geometry.dispose(); ring.material.dispose(); }
      for (const geometry of silhouetteCache.values()) geometry.dispose();
      silhouetteCache.clear(); fallback.dispose(); outlineMaterial.dispose(); snapGhost.material.dispose(); root.clear();
    },
  };
}

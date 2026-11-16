import {
  AnimatedHand, BufferAttribute, CircleGeometry, createSystem, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, RayInteractable, ShaderMaterial, SkinnedMesh, SphereGeometry, Vector3,
} from '@iwsdk/core';
import { fingertipGlowForDistance, gloveAccentForDistance, handShimmerForAge } from './training/hand-visual.js';
import { TrainingTarget } from './training-components.js';

const workGloves: SolidWorkGlove[] = [];
const uiPokeTargets: Object3D[] = [];

/** Register a stable UIKit button once when its handlers are bound. */
export function registerPokeableVisualTarget(object: Object3D): () => void {
  if (!uiPokeTargets.includes(object)) uiPokeTargets.push(object);
  return () => { const index = uiPokeTargets.indexOf(object); if (index >= 0) uiPokeTargets.splice(index, 1); };
}

function visibleInHierarchy(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) { if (!current.visible) return false; current = current.parent; }
  return true;
}
const dotGeometry = new SphereGeometry(.0028, 8, 6);

/** Keep the SDK skeleton and tracking, replace its two outline passes with one glove. */
class SolidWorkGlove extends AnimatedHand {
  static assetKeyPrefix = 'civicops-solid-work-glove';
  readonly shimmer = { value: 0 };
  readonly near = { value: 0 };
  readonly material = new MeshStandardMaterial({ color: '#545d60', roughness: .88, metalness: .02, envMapIntensity: .9, transparent: true });
  readonly dotMaterial = new MeshBasicMaterial({ color: '#b6f8bd', toneMapped: false });
  tip?: Object3D;
  dot?: Mesh;
  tracked = false;
  age = 0;

  init(): void {
    const hand = this.model.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh | undefined;
    if (!hand) return;
    hand.frustumCulled = false; hand.castShadow = false; hand.receiveShadow = false;
    hand.parent?.scale.multiplyScalar(1.05);
    const wrist = this.model.getObjectByName('wrist');
    const wristLocal = wrist ? hand.worldToLocal(wrist.getWorldPosition(new Vector3())) : new Vector3();
    this.tip = this.model.getObjectByName('index-finger-tip');
    const tipLocal = this.tip ? hand.worldToLocal(this.tip.getWorldPosition(new Vector3())) : new Vector3();
    const positions = hand.geometry.getAttribute('position');
    const accent = new Float32Array(positions.count), distance = new Float32Array(positions.count), tipMask = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      distance[i] = Math.sqrt((x - wristLocal.x) ** 2 + (y - wristLocal.y) ** 2 + (z - wristLocal.z) ** 2);
      accent[i] = gloveAccentForDistance(distance[i]);
      const d = Math.sqrt((x - tipLocal.x) ** 2 + (y - tipLocal.y) ** 2 + (z - tipLocal.z) ** 2);
      tipMask[i] = Math.max(0, 1 - d / .025);
    }
    hand.geometry.setAttribute('gloveAccent', new BufferAttribute(accent, 1));
    hand.geometry.setAttribute('gloveDistance', new BufferAttribute(distance, 1));
    hand.geometry.setAttribute('gloveTip', new BufferAttribute(tipMask, 1));
    this.material.name = 'CivicOpsWorkGlove';
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uHandShimmer = this.shimmer; shader.uniforms.uPokeNear = this.near;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float gloveAccent;\nattribute float gloveDistance;\nattribute float gloveTip;\nvarying float vGloveAccent;\nvarying float vGloveDistance;\nvarying float vGloveTip;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGloveAccent = gloveAccent;\nvGloveDistance = gloveDistance;\nvGloveTip = gloveTip;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHandShimmer;\nuniform float uPokeNear;\nvarying float vGloveAccent;\nvarying float vGloveDistance;\nvarying float vGloveTip;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.77, 0.07), vGloveAccent);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float gloveRim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 3.0);
          float sweep = 1.0 - smoothstep(0.003, 0.024, abs(vGloveDistance - (1.0 - uHandShimmer) * 0.19));
          totalEmissiveRadiance += vec3(0.025, 0.045, 0.035) * gloveRim;
          totalEmissiveRadiance += vec3(0.17, 0.45, 0.28) * sweep * uHandShimmer;
          totalEmissiveRadiance += vec3(0.25, 0.9, 0.4) * vGloveTip * uPokeNear;
        `);
    };
    this.material.customProgramCacheKey = () => 'civicops-work-glove-vr04';
    hand.material = this.material; hand.name = 'SolidWorkGlove';
    if (this.tip) {
      this.dot = new Mesh(dotGeometry, this.dotMaterial); this.dot.name = 'IndexPokeAffordance';
      this.dot.position.z = -.004; this.dot.frustumCulled = false; this.tip.add(this.dot);
    }
    workGloves.push(this);
  }

  connect(inputSource: XRInputSource, enabled: boolean): void {
    super.connect(inputSource, enabled); this.tracked = true; this.age = 0;
  }
  disconnect(): void { super.disconnect(); this.tracked = false; this.shimmer.value = 0; this.near.value = 0; }
}

/** Solid tracked gloves, one materialisation sweep, and proximity fingertip cues. */
export class HandVisualSystem extends createSystem({
  targets: { required: [TrainingTarget, RayInteractable] },
}) {
  private finger = new Vector3();
  private target = new Vector3();

  init(): void {
    this.cleanupFuncs.push(() => {
      for (const glove of workGloves) { glove.material.dispose(); glove.dotMaterial.dispose(); }
      workGloves.length = 0; dotGeometry.dispose();
    });
    const adapters = this.input.xr.visualAdapters.hand;
    adapters.left.updateVisualImplementation(SolidWorkGlove);
    adapters.right.updateVisualImplementation(SolidWorkGlove);
    for (const side of ['left', 'right'] as const) {
      for (const object of this.player.raySpaces[side].children) {
        if (!(object instanceof Mesh) || !(object.material instanceof ShaderMaterial)) continue;
        if (object.material.uniforms.endValue && object.material.uniforms.opacity) object.material.visible = false;
      }
    }
    for (const object of this.player.children) {
      if (!(object instanceof Mesh) || !(object.geometry instanceof CircleGeometry) || !object.userData.attached) continue;
      object.geometry.scale(.3125, .3125, .3125);
      if (object.material instanceof MeshBasicMaterial) {
        object.material.map = null; object.material.color.setHex(0xb6f8bd); object.material.needsUpdate = true;
      }
    }
  }

  update(delta: number): void {
    for (const glove of workGloves) {
      if (!glove.tracked || !glove.tip || !glove.xrInput?.jointTransforms) continue;
      glove.age += delta; glove.shimmer.value = handShimmerForAge(glove.age);
      glove.material.opacity = Math.min(1, glove.age / .15);
      glove.tip.getWorldPosition(this.finger);
      let nearestSq = .07 * .07;
      for (const entity of this.queries.targets.entities) {
        if (!entity.object3D || !entity.getValue(TrainingTarget, 'active')) continue;
        const kind = entity.getValue(TrainingTarget, 'kind');
        if (kind === 'tool' || kind === 'zone' || kind === 'terminals') continue;
        entity.object3D.getWorldPosition(this.target);
        const distanceSq = this.finger.distanceToSquared(this.target);
        if (distanceSq < nearestSq) nearestSq = distanceSq;
      }
      for (let i = 0; i < uiPokeTargets.length; i++) {
        const button = uiPokeTargets[i];
        if (!visibleInHierarchy(button)) continue;
        button.getWorldPosition(this.target);
        const distanceSq = this.finger.distanceToSquared(this.target);
        if (distanceSq < nearestSq) nearestSq = distanceSq;
      }
      glove.near.value = fingertipGlowForDistance(Math.sqrt(nearestSq));
      if (glove.dot) glove.dot.scale.setScalar(1 + glove.near.value * .85);
      glove.dotMaterial.color.setRGB(.48 + .23 * glove.near.value, .7 + .27 * glove.near.value, .5 + .16 * glove.near.value);
    }
  }
}

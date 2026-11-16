import {
  BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Object3D,
} from '@iwsdk/core';
import { decodeSurfaceAttribute } from '../training/static-batching.js';

const MAX_PARTS = 24;
/** One atlas draw with independently moving roots. Invisible originals retain all
 * hand ray/poke/grab geometry. Loaded textures/materials stay owned by AssetManager.
 */
export class MovingAtlasBatch {
  readonly mesh: Mesh;
  private readonly transforms = Array.from({ length: MAX_PARTS }, () => new Matrix4());
  private readonly inverse = new Matrix4();
  private readonly matrix = new Matrix4();
  private readonly zero = new Matrix4().makeScale(0, 0, 0);
  private readonly originals: { mesh: Mesh; material: MeshStandardMaterial; hidden: MeshStandardMaterial }[] = [];

  constructor(private readonly parent: Object3D, private readonly roots: readonly Object3D[], materialName: string) {
    if (roots.length > MAX_PARTS) throw new Error('Moving atlas batch exceeds the uniform budget');
    parent.updateMatrixWorld(true);
    const arrays = { position: [] as number[], normal: [] as number[], uv: [] as number[], partIndex: [] as number[] };
    let source: MeshStandardMaterial | undefined;
    roots.forEach((root, index) => {
      root.updateMatrixWorld(true);
      this.inverse.copy(root.matrixWorld).invert();
      root.traverse(child => {
        if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
        const material = child.material;
        if (material.name !== materialName || !material.visible || material.transparent || material.emissive.getHex() !== 0) return;
        source ??= material;
        // Same atlas name alone is insufficient if a module introduces another UV source.
        if (material.map?.name !== source.map?.name) throw new Error('Moving atlas textures must match');
        const expanded = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry;
        const geometry = new BufferGeometry();
        for (const name of ['position', 'normal', 'uv'] as const) {
          const attribute = expanded.getAttribute(name);
          if (!attribute) throw new Error(`Moving atlas requires ${name}`);
          geometry.setAttribute(name, new Float32BufferAttribute(decodeSurfaceAttribute(attribute), attribute.itemSize));
        }
        if (expanded !== child.geometry) expanded.dispose();
        geometry.applyMatrix4(this.matrix.multiplyMatrices(this.inverse, child.matrixWorld));
        for (const name of ['position', 'normal', 'uv'] as const) {
          for (const value of geometry.getAttribute(name).array) arrays[name].push(value);
        }
        for (let i = 0; i < geometry.getAttribute('position').count; i++) arrays.partIndex.push(index);
        geometry.dispose();
        const hidden = material.clone(); hidden.visible = false;
        this.originals.push({ mesh: child, material, hidden }); child.material = hidden;
      });
    });
    if (!source) throw new Error(`No moving surfaces use ${materialName}`);
    const geometry = new BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'partIndex'] as const) {
      geometry.setAttribute(name, new Float32BufferAttribute(arrays[name], name === 'uv' ? 2 : name === 'partIndex' ? 1 : 3));
    }
    const material = (source as MeshStandardMaterial).clone();
    material.name = 'CivicOpsMovingAtlas';
    material.onBeforeCompile = shader => {
      shader.uniforms.partTransforms = { value: this.transforms };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float partIndex; uniform mat4 partTransforms[${MAX_PARTS}];`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = mat3(partTransforms[int(partIndex + 0.5)]) * objectNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = (partTransforms[int(partIndex + 0.5)] * vec4(transformed, 1.0)).xyz;');
    };
    material.customProgramCacheKey = () => 'civicops-moving-atlas-v1';
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'MovingAtlasSurfaces'; this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {}; // The original per-part targets own interactions.
    this.update();
  }

  update(): void {
    this.parent.updateWorldMatrix(true, false);
    this.inverse.copy(this.parent.matrixWorld).invert();
    for (let i = 0; i < this.roots.length; i++) {
      const root = this.roots[i];
      let visible = true;
      for (let at: Object3D | null = root; at && at !== this.parent; at = at.parent) visible &&= at.visible;
      root.updateWorldMatrix(true, false);
      if (visible) this.transforms[i].multiplyMatrices(this.inverse, root.matrixWorld);
      else this.transforms[i].copy(this.zero);
    }
  }

  dispose(): void {
    for (const { mesh, material, hidden } of this.originals) { mesh.material = material; hidden.dispose(); }
    this.mesh.geometry.dispose(); (this.mesh.material as MeshStandardMaterial).dispose();
  }
}

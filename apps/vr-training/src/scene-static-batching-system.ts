import {
  BufferGeometry, createSystem, Float32BufferAttribute, Material, Matrix4, Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';
import { TrainingTarget } from './training-components.js';
import { batchNodesInLevel, decodeSurfaceAttribute, fixedTargetGlow, isBatchableSurface } from './training/static-batching.js';

/** One fixed-surface draw; original meshes remain exact interaction targets. */
export class SceneStaticBatchingSystem extends createSystem({ targets: { required: [TrainingTarget] } }) {
  private readonly glows = new Float32Array(9);
  private readonly targetIndices = new Map<number, number>();

  init(): void {
    this.batchStreet();
    const parent = this.world.requireSceneEntity('bench-rig');
    const root = parent.object3D!;
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const matrix = new Matrix4();
    const arrays = { position: [] as number[], normal: [] as number[], uv: [] as number[], targetId: [] as number[] };
    const originals: Mesh[] = [];
    let sourceMaterial: MeshStandardMaterial | undefined;
    for (const [name, targetId] of batchNodesInLevel((nodeName) => this.world.getSceneObject(nodeName) != null)) {
      const node = this.world.getSceneObject(name);
      if (!node) continue;
      if (targetId) this.targetIndices.set(this.world.requireSceneEntity(name).index, targetId);
      node.traverse(child => {
        if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
        // glTF wrappers and meshopt dequantization nodes are static. A named
        // moving assembly keeps its own geometry and pivot below those wrappers.
        let ancestor = child.parent;
        while (ancestor && ancestor !== node) {
          if (ancestor.name === 'Toggle' || ancestor.name === 'VoltageReadout') return;
          ancestor = ancestor.parent;
        }
        if (!isBatchableSurface(child.material.name, true)) return;
        sourceMaterial ??= child.material;
        const expanded = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry;
        const geometry = new BufferGeometry();
        // Quantized glTF attributes are normalized integers. Decode before
        // transforming/merging; copying their raw arrays corrupts UVs and poses.
        for (const name of ['position', 'normal', 'uv'] as const) {
          const attribute = expanded.getAttribute(name);
          const floats = decodeSurfaceAttribute(attribute);
          geometry.setAttribute(name, new Float32BufferAttribute(floats, attribute.itemSize));
        }
        if (expanded !== child.geometry) expanded.dispose();
        geometry.applyMatrix4(matrix.multiplyMatrices(inverse, child.matrixWorld));
        for (const name of ['position', 'normal', 'uv'] as const) {
          const attribute = geometry.getAttribute(name);
          for (const value of attribute.array) arrays[name].push(value);
        }
        for (let i = 0; i < geometry.getAttribute('position').count; i++) arrays.targetId.push(targetId);
        geometry.dispose();
        originals.push(child);
      });
    }
    if (!sourceMaterial || originals.length < 2) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(arrays.position, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(arrays.normal, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(arrays.uv, 2));
    geometry.setAttribute('targetId', new Float32BufferAttribute(arrays.targetId, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = sourceMaterial.clone();
    material.name = 'CivicOpsFixedSurfaceAtlas';
    material.onBeforeCompile = shader => {
      shader.uniforms.targetGlows = { value: this.glows };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float targetId;\nuniform float targetGlows[9];\nvarying float vTargetGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTargetGlow = targetGlows[int(targetId + 0.5)];');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTargetGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.016, 0.65, 0.85) * vTargetGlow;');
    };
    material.customProgramCacheKey = () => 'civicops-fixed-surface-atlas-v1';
    const batch = new Mesh(geometry, material);
    batch.name = 'FixedBenchSurfaceBatch';
    batch.castShadow = false; batch.receiveShadow = false;
    const entity = this.world.createTransformEntity(batch, parent);
    // Pointer visibility depends on Object3D visibility, not Material.visible.
    const hiddenMaterials: MeshStandardMaterial[] = [];
    for (const original of originals) {
      const hidden = (original.material as MeshStandardMaterial).clone();
      hidden.visible = false;
      original.material = hidden;
      original.userData.staticBatched = true;
      hiddenMaterials.push(hidden);
    }
    this.cleanupFuncs.push(() => {
      // Atlas maps belong to the shared training asset, not this merged surface.
      entity.dispose({ disposeResources: false }); geometry.dispose(); material.dispose();
      for (const hidden of hiddenMaterials) hidden.dispose();
    });
  }

  /**
   * Street dressing: merge static meshes that share a material into one draw per material.
   * Originals stay (hidden material) so locomotion raycasts and the asset cache are untouched.
   */
  private batchStreet(): void {
    const street = this.world.getSceneObject('electrical-street');
    if (!street) return;
    street.updateMatrixWorld(true);
    const inverse = street.matrixWorld.clone().invert();
    const matrix = new Matrix4();
    const groups = new Map<Material, Mesh[]>();
    street.traverse(child => {
      if (!(child instanceof Mesh) || Array.isArray(child.material) || child.userData.staticBatched || !child.visible) return;
      if (child.userData.streetLifePrototype) return;
      const list = groups.get(child.material) ?? [];
      list.push(child); groups.set(child.material, list);
    });
    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue;
      const names = ['position', 'normal', 'uv'].filter(name => meshes.every(mesh => mesh.geometry.getAttribute(name)));
      if (!names.includes('position')) continue;
      if (meshes.some(mesh => Object.keys(mesh.geometry.attributes).some(key => !names.includes(key)))) continue;
      const arrays: Record<string, number[]> = Object.fromEntries(names.map(name => [name, []]));
      for (const mesh of meshes) {
        const expanded = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
        const geometry = new BufferGeometry();
        for (const name of names) {
          const attribute = expanded.getAttribute(name);
          geometry.setAttribute(name, new Float32BufferAttribute(decodeSurfaceAttribute(attribute), attribute.itemSize));
        }
        if (expanded !== mesh.geometry) expanded.dispose();
        geometry.applyMatrix4(matrix.multiplyMatrices(inverse, mesh.matrixWorld));
        for (const name of names) for (const value of geometry.getAttribute(name).array) arrays[name].push(value);
        geometry.dispose();
      }
      const merged = new BufferGeometry();
      for (const name of names) merged.setAttribute(name, new Float32BufferAttribute(arrays[name], name === 'uv' ? 2 : 3));
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      const batch = new Mesh(merged, material);
      batch.name = `StreetBatch:${material.name}`;
      street.add(batch);
      const hidden: Material[] = [];
      for (const mesh of meshes) { const h = material.clone(); h.visible = false; mesh.material = h; mesh.userData.staticBatched = true; hidden.push(h); }
      this.cleanupFuncs.push(() => { batch.removeFromParent(); merged.dispose(); for (const h of hidden) h.dispose(); });
    }
    // Remaining single-use flat-colour parts (multi-primitive props): one vertex-coloured draw.
    const flat: Mesh[] = [];
    street.traverse(child => {
      if (!(child instanceof Mesh) || child.userData.staticBatched || !child.visible || child.name === 'DownedLiveLine') return;
      const m = child.material;
      if (!(m instanceof MeshStandardMaterial) || m.map || m.transparent || m.emissiveMap || m.emissive.getHex() !== 0 || m.vertexColors) return;
      if (!child.geometry.getAttribute('normal')) return;
      flat.push(child);
    });
    if (flat.length < 2) return;
    const positions: number[] = []; const normals: number[] = []; const colors: number[] = [];
    let roughness = 0; let metalness = 0;
    for (const mesh of flat) {
      const m = mesh.material as MeshStandardMaterial;
      roughness += m.roughness / flat.length; metalness += m.metalness / flat.length;
      const expanded = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(decodeSurfaceAttribute(expanded.getAttribute('position')), 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(decodeSurfaceAttribute(expanded.getAttribute('normal')), 3));
      if (expanded !== mesh.geometry) expanded.dispose();
      geometry.applyMatrix4(matrix.multiplyMatrices(inverse, mesh.matrixWorld));
      for (const v of geometry.getAttribute('position').array) positions.push(v);
      for (const v of geometry.getAttribute('normal').array) normals.push(v);
      const c = m.color;
      for (let i = 0; i < geometry.getAttribute('position').count; i++) colors.push(c.r, c.g, c.b);
      geometry.dispose();
    }
    const merged = new BufferGeometry();
    merged.setAttribute('position', new Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    merged.setAttribute('color', new Float32BufferAttribute(colors, 3));
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const material = new MeshStandardMaterial({ vertexColors: true, roughness, metalness });
    const batch = new Mesh(merged, material);
    batch.name = 'StreetBatch:flat';
    street.add(batch);
    const hidden: Material[] = [];
    for (const mesh of flat) { const h = (mesh.material as Material).clone(); h.visible = false; mesh.material = h; mesh.userData.staticBatched = true; hidden.push(h); }
    this.cleanupFuncs.push(() => { batch.removeFromParent(); merged.dispose(); material.dispose(); for (const h of hidden) h.dispose(); });
  }

  update(_delta: number, time: number): void {
    for (const entity of this.queries.targets.entities) {
      const index = this.targetIndices.get(entity.index);
      if (index !== undefined) this.glows[index] = fixedTargetGlow(!!entity.getValue(TrainingTarget, 'highlighted'), time);
    }
  }
}

import {
  BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, Texture, Vector3,
} from '@iwsdk/core';
import { bevelBox, alignSpan, placeOnSurface, surfaceFrame } from './lib/hardsurface.js';

// Original CivicOps manufactured asset construction. All units are metres.
export const materials = {
  steel: new MeshStandardMaterial({ color: '#bac5cb', metalness: .92, roughness: .31 }),
  dark: new MeshStandardMaterial({ color: '#17252b', metalness: .2, roughness: .64 }),
  rubber: new MeshStandardMaterial({ color: '#111b20', roughness: .93 }),
  ivory: new MeshStandardMaterial({ color: '#e9e9df', roughness: .58 }),
  red: new MeshStandardMaterial({ color: '#bc3029', roughness: .52 }),
  yellow: new MeshStandardMaterial({ color: '#dbaa32', roughness: .65 }),
  teal: new MeshStandardMaterial({ color: '#217b79', metalness: .12, roughness: .48 }),
  copper: new MeshStandardMaterial({ color: '#ac7445', metalness: .88, roughness: .4 }),
  wood: new MeshStandardMaterial({ color: '#c7ad82', roughness: .67 }),
  printed: new MeshBasicMaterial({ color: '#ffffff' }),
  atlas: new MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 1 }),
};
materials.printed.name = 'CustomPrintedAtlas';
materials.printed.userData.customTexture = 'custom-labels';
materials.atlas.name = 'CustomPBRAtlas';
materials.atlas.userData.customTexture = 'custom-labels';
materials.atlas.userData.customORM = 'custom-labels-orm';
materials.wood.name = 'BirchLaminate';
materials.wood.userData.customTexture = 'custom-bench-color';
const palette = [materials.steel, materials.dark, materials.rubber, materials.ivory,
  materials.red, materials.yellow, materials.teal, materials.copper];

export function prototype(name: string): Group {
  const root = new Group();
  root.name = name;
  return root;
}

export function mesh(root: Object3D, name: string, geometry: BufferGeometry,
  material: MeshStandardMaterial | MeshBasicMaterial, position: readonly number[] = [0, 0, 0]): Mesh {
  const object = new Mesh(geometry, material);
  object.name = name;
  object.position.set(position[0], position[1], position[2]);
  object.castShadow = false;
  object.receiveShadow = false;
  root.add(object);
  return object;
}

export function box(root: Object3D, name: string, dimensions: readonly number[],
  position: readonly number[], material: MeshStandardMaterial, bevel = .002): Mesh {
  const radius = Math.min(bevel, Math.min(...dimensions) * .22);
  return mesh(root, name, bevelBox(dimensions[0], dimensions[1], dimensions[2], radius, radius, 2), material, position);
}

/** Printed surface mapping from our 1024-square CC0 authored atlas. */
export function label(root: Object3D, name: string, dimensions: readonly number[],
  position: readonly number[], rect: readonly number[], normal = new Vector3(0, 0, 1)): Mesh {
  const geometry = new PlaneGeometry(dimensions[0], dimensions[1]);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (rect[0] + uv.getX(i) * rect[2]) / 1024,
      1 - (rect[1] + (1 - uv.getY(i)) * rect[3]) / 1024);
  }
  const printed = mesh(root, name, geometry, materials.printed);
  placeOnSurface(printed, surfaceFrame(new Vector3(position[0], position[1], position[2]), normal,
    new Vector3(1, 0, 0)), 0);
  return printed;
}

export function span(root: Object3D, name: string, geometry: BufferGeometry,
  material: MeshStandardMaterial, a: readonly number[], b: readonly number[]): Mesh {
  const object = mesh(root, name, geometry, material);
  object.scale.y = alignSpan(object, new Vector3(...a as [number, number, number]), new Vector3(...b as [number, number, number]));
  return object;
}

/** Drop zero-area bevel cusp faces before upload, keeping the original normals. */
function removeDegenerateFaces(input: BufferGeometry): BufferGeometry {
  const source = input.index ? input.toNonIndexed() : input.clone();
  const position = source.getAttribute('position');
  const good: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const ax = position.getX(i + 1) - position.getX(i), ay = position.getY(i + 1) - position.getY(i), az = position.getZ(i + 1) - position.getZ(i);
    const bx = position.getX(i + 2) - position.getX(i), by = position.getY(i + 2) - position.getY(i), bz = position.getZ(i + 2) - position.getZ(i);
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * cx + cy * cy + cz * cz > 1e-16) good.push(i, i + 1, i + 2);
  }
  if (good.length === position.count) return source;
  const result = new BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attribute = source.getAttribute(name);
    const values: number[] = [];
    for (const i of good) for (let j = 0; j < attribute.itemSize; j++) values.push(attribute.array[i * attribute.itemSize + j]);
    result.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
  }
  source.dispose();
  return result;
}

/** Merge the authored static parts by finish; interaction anchors remain named. */
export function finish(root: Object3D, keepNames: readonly string[] = []): void {
  root.updateMatrixWorld(true);
  const buckets = new Map<MeshStandardMaterial | MeshBasicMaterial, Mesh[]>();
  const keep = new Set(keepNames);
  for (const child of [...root.children]) {
    if (!(child instanceof Mesh) || child.userData.unmerged) continue;
    child.geometry = removeDegenerateFaces(child.geometry);
    let material = child.material as MeshStandardMaterial | MeshBasicMaterial;
    const swatch = palette.indexOf(material as MeshStandardMaterial);
    if (swatch >= 0) {
      const geometry = child.geometry.clone();
      if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (swatch * 64 + 32) / 1024, 1 - 992 / 1024);
      child.geometry = geometry;
      material = materials.atlas;
    } else if (material === materials.printed) material = materials.atlas;
    child.material = material;
    if (keep.has(child.name)) continue;
    const bucket = buckets.get(material) ?? [];
    bucket.push(child);
    buckets.set(material, bucket);
  }
  for (const [material, children] of buckets) {
    if (children.length < 2) continue;
    const arrays: Record<string, number[]> = { position: [], normal: [], uv: [] };
    for (const child of children) {
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.applyMatrix4(new Matrix4().compose(child.position, child.quaternion, child.scale));
      for (const name of Object.keys(arrays)) {
        const attribute = geometry.getAttribute(name);
        if (attribute) for (const value of attribute.array) arrays[name].push(value);
        else for (let i = 0; i < geometry.getAttribute('position').count * (name === 'uv' ? 2 : 3); i++) arrays[name].push(0);
      }
      geometry.dispose();
      root.remove(child);
    }
    const geometry = new BufferGeometry();
    for (const name of Object.keys(arrays)) geometry.setAttribute(name, new Float32BufferAttribute(arrays[name], name === 'uv' ? 2 : 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh(root, `${root.name}-${material.name || material.color.getHexString()}`, geometry, material);
  }
}

/** Runtime-only: assets themselves stay DOM-free and parentless. */
export function applyCustomTextures(root: Object3D, atlas: Texture, orm: Texture, woodColor?: Texture, woodNormal?: Texture): void {
  atlas.flipY = false;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const finishes = Array.isArray(object.material) ? object.material : [object.material];
    for (const finish of finishes) {
      if (!(finish instanceof MeshBasicMaterial || finish instanceof MeshStandardMaterial)) continue;
      if (finish.userData.customTexture === 'custom-labels') { finish.map = atlas; finish.needsUpdate = true; }
      if (finish instanceof MeshStandardMaterial && finish.userData.customORM === 'custom-labels-orm') {
        finish.roughnessMap = orm;
        finish.metalnessMap = orm;
        finish.needsUpdate = true;
      }
      if (finish instanceof MeshStandardMaterial && finish.userData.customTexture === 'custom-bench-color' && woodColor) {
        finish.map = woodColor;
        finish.color.setHex(0xffffff);
        if (woodNormal) { finish.normalMap = woodNormal; finish.normalScale.set(.17, .17); }
        finish.needsUpdate = true;
      }
    }
  });
}

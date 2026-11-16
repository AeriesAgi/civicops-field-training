import { Group, type Object3D } from '@iwsdk/core';

/** Position an asset without overwriting its mesh-quantization decode transform. */
export function placedAsset(template: Object3D, x: number, y: number, z: number): Group {
  const placement = new Group();
  placement.position.set(x, y, z);
  placement.add(template.clone());
  return placement;
}

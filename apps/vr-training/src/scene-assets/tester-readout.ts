import type { Object3D } from '@iwsdk/core';

/** Three prebuilt Blender display faces: no texture uploads during contact. */
export function setTesterReadout(root: Object3D, voltage: number | null): void {
  const display = root.getObjectByName('VoltageReadout');
  if (!display) return;
  const state = voltage === null ? 'idle' : voltage > 0 ? '230' : '000';
  for (const object of display.children) object.visible = object.name === `VoltageReadout-${state}`;
}

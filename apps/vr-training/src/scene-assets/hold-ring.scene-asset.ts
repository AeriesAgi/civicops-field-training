import { Group, Mesh, MeshBasicMaterial, RingGeometry } from '@iwsdk/core';

/** Original CC0 hold feedback, 160 triangles; no texture or per-frame rebuild. */
export function createHoldRing(): { root: Group; progress: Mesh } {
  const root = new Group(); root.name = 'SafeConfirmationRing';
  const track = new Mesh(new RingGeometry(.021, .025, 40),
    new MeshBasicMaterial({ color: 0xa5bfa9, toneMapped: false }));
  track.name = 'HoldTrack'; root.add(track);
  const progress = new Mesh(new RingGeometry(.021, .025, 40, 1, Math.PI / 2),
    new MeshBasicMaterial({ color: 0x174d2c, toneMapped: false }));
  progress.name = 'HoldProgress'; progress.position.z = .0002;
  progress.geometry.setDrawRange(0, 0); root.add(progress);
  root.position.set(.115, -.029, .004);
  root.visible = false;
  return { root, progress };
}

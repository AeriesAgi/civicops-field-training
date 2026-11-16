import { Object3D, Quaternion, Vector3 } from '@iwsdk/core';

/** Place a stationary review card in the trainee's current comfortable view. */
export function placeReviewPanel(panel: Object3D, head: Object3D, body?: Pick<Object3D, 'getWorldPosition'> | null): void {
  const viewer = head.getWorldPosition(new Vector3());
  const facing = head.getWorldQuaternion(new Quaternion());
  const target = new Vector3(0, 0, -.42).applyQuaternion(facing).add(viewer);
  panel.scale.setScalar(.5);
  panel.quaternion.copy(facing);
  if (panel.parent) panel.quaternion.premultiply(panel.parent.getWorldQuaternion(new Quaternion()).invert());
  panel.updateWorldMatrix(true, true);
  const origin = panel.getWorldPosition(new Vector3());
  const center = body?.getWorldPosition(new Vector3()) ?? origin;
  origin.add(target.sub(center));
  if (panel.parent) panel.parent.worldToLocal(origin);
  panel.position.copy(origin);
  panel.updateWorldMatrix(true, true);
}

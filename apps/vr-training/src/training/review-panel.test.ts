import { describe, expect, it } from 'vitest';
import { Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { placeReviewPanel } from './review-panel';

describe('seated result-card placement', () => {
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 3])('centres the actual card in the current view at yaw %f', yaw => {
    const level = new Object3D(); level.position.set(8, 0, -12); level.rotation.y = .37;
    const panel = new Object3D(); level.add(panel); panel.position.set(-4.5, 1.3, -7.6);
    const body = new Object3D(); body.position.set(.12, -.24, 0); panel.add(body);
    const head = new Object3D(); head.position.set(-4.55, 1.25, -7.02); head.rotation.set(-.17, yaw, 0, 'YXZ');
    placeReviewPanel(panel, head, body);
    const expected = new Vector3(0, 0, -.42).applyQuaternion(head.quaternion).add(head.position);
    expect(body.getWorldPosition(new Vector3()).distanceTo(expected)).toBeLessThan(1e-6);
    expect(panel.getWorldQuaternion(new Quaternion()).angleTo(head.quaternion)).toBeLessThan(1e-6);
    expect(panel.scale.x).toBe(.5);
    // Even the taller 72 cm safety card fits inside +/-25 degrees. Its 2.1 cm
    // body copy keeps a >=1 degree cap height after scaling.
    expect(Math.atan((.72 * .5 / 2) / .42) * 180 / Math.PI).toBeLessThan(25);
    expect(Math.atan((.021 * .5 * .73) / .42) * 180 / Math.PI).toBeGreaterThan(1);
  });
});

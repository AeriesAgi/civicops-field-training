import { Group, Raycaster, Vector3 } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { HazardMarker } from '../scene-assets/hazard-marker';

describe('hands-first hazard marker', () => {
  it('keeps hover as a pinching ray moves from the visible ring into its centre', () => {
    const parent = new Group(); parent.position.set(3, .16, -5);
    const marker = new HazardMarker('#f5d78c'); parent.add(marker); parent.updateMatrixWorld(true);
    for (const offset of [.24, .14, .04, 0]) {
      const ray = new Raycaster(new Vector3(3 + offset, 1, -5), new Vector3(0, -1, 0));
      expect(ray.intersectObject(marker, false)[0]?.object).toBe(marker);
    }
    marker.dispose();
  });

  it('rejects a ray outside the marked area and adds no visible filled disc', () => {
    const marker = new HazardMarker('#8ef6d2'); marker.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(.4, 1, 0), new Vector3(0, -1, 0));
    expect(ray.intersectObject(marker, false)).toHaveLength(0);
    expect(marker.material.visible).toBe(false);
    expect(marker.children.filter(child => (child as HazardMarker).material.visible)).toHaveLength(1);
    marker.dispose();
  });
});

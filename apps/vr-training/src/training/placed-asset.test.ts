import { Box3, BoxGeometry, Mesh, MeshBasicMaterial } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { placedAsset } from './placed-asset';

describe('compressed asset placement', () => {
  it('keeps a quantized cone grounded and at full height when moved onto a floor', () => {
    const template = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    template.position.y = .375;
    template.scale.setScalar(.375);
    const placement = placedAsset(template, .42, 0, -1.1);
    const bounds = new Box3().setFromObject(placement);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeCloseTo(.75);
    expect(bounds.getCenter(template.position.clone()).x).toBeCloseTo(.42);
    expect(template.position.toArray()).toEqual([0, .375, 0]);
    template.geometry.dispose(); template.material.dispose();
  });
});

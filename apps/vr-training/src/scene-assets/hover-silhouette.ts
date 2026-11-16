import { BufferAttribute, BufferGeometry, Matrix4, Mesh, Object3D, Vector3 } from '@iwsdk/core';

/** Original CC0 geometry helper: merge a hero's real surface for a one-draw contour. */
export function mergeHoverSilhouette(source: Object3D): BufferGeometry {
  source.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(source.matrixWorld).invert();
  const relative = new Matrix4();
  const vertex = new Vector3();
  const positions: number[] = [], indices: number[] = [];
  source.traverse((part) => {
    if (!(part instanceof Mesh) || !part.visible) return;
    const attribute = part.geometry.getAttribute('position');
    if (!attribute) return;
    relative.multiplyMatrices(inverse, part.matrixWorld);
    const offset = positions.length / 3;
    for (let i = 0; i < attribute.count; i++) {
      vertex.fromBufferAttribute(attribute, i).applyMatrix4(relative);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
    if (part.geometry.index) {
      for (let i = 0; i < part.geometry.index.count; i++) indices.push(offset + part.geometry.index.getX(i));
    } else {
      for (let i = 0; i < attribute.count; i++) indices.push(offset + i);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

import { CircleGeometry, Mesh, MeshBasicMaterial, RingGeometry } from '@iwsdk/core';

export const HAZARD_MARKER_RADIUS = .36;

/** The visible ring and its centre form one continuous hands-first target. */
export class HazardMarker extends Mesh<CircleGeometry, MeshBasicMaterial> {
  private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;

  constructor(color: string) {
    // Invisible materials still raycast, as do the app's batched tool surfaces.
    // A pinch must not lose its target when its ray moves into the ring's hole.
    super(new CircleGeometry(HAZARD_MARKER_RADIUS, 20), new MeshBasicMaterial({ visible: false }));
    this.geometry.rotateX(-Math.PI / 2);
    const geometry = new RingGeometry(.18, .32, 20);
    geometry.rotateX(-Math.PI / 2);
    this.ring = new Mesh(geometry, new MeshBasicMaterial({ color, depthWrite: false, toneMapped: false }));
    this.add(this.ring);
  }

  dispose(): void {
    this.geometry.dispose(); this.material.dispose();
    this.ring.geometry.dispose(); this.ring.material.dispose();
  }
}

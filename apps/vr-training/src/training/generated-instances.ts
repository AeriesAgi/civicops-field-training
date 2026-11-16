import type { InstancedMesh } from 'three';

export interface DisposableResource { dispose(): void }

/** Geometry and GPU instance buffers are owned by the module. Loaded atlas
 * materials stay with AssetManager unless this mesh's material was also generated.
 */
export function trackGeneratedInstances(
  mesh: InstancedMesh, resources: DisposableResource[], ownsMaterial = false,
): void {
  resources.push(mesh.geometry, mesh);
  if (ownsMaterial) resources.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
}

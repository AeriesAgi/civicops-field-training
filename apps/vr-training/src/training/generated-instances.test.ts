import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial } from 'three';
import { trackGeneratedInstances, type DisposableResource } from './generated-instances.js';

describe('generated module instance ownership', () => {
  it('releases geometry and instance matrix/colour buffers while preserving the loaded material', () => {
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geometry, material, 6);
    mesh.setColorAt(0, new Color('#ffffff'));
    const rendererRelease = vi.fn(), releaseGeometry = vi.fn();
    mesh.addEventListener('dispose', rendererRelease);
    geometry.addEventListener('dispose', releaseGeometry);
    const releaseMaterial = vi.spyOn(material, 'dispose');
    const owned: DisposableResource[] = [];
    trackGeneratedInstances(mesh, owned);
    for (const resource of owned) resource.dispose();
    expect(rendererRelease).toHaveBeenCalledOnce();
    expect(releaseGeometry).toHaveBeenCalledOnce();
    expect(releaseMaterial).not.toHaveBeenCalled();
    material.dispose();
  });

  it('also releases an original generated feedback material', () => {
    const material = new MeshBasicMaterial(), mesh = new InstancedMesh(new BoxGeometry(), material, 7);
    const releaseMaterial = vi.spyOn(material, 'dispose');
    const owned: DisposableResource[] = [];
    trackGeneratedInstances(mesh, owned, true);
    for (const resource of owned) resource.dispose();
    expect(releaseMaterial).toHaveBeenCalledOnce();
  });
});

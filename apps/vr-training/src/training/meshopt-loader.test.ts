import { describe, expect, it, vi } from 'vitest';
vi.mock('@iwsdk/core', () => ({ Cache: { enabled: false } }));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: { supported: true } }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  meshopt: unknown; ktx2: unknown;
  setMeshoptDecoder(value: unknown) { this.meshopt = value; return this; }
  setKTX2Loader(value: unknown) { this.ktx2 = value; return this; }
} }));
import { Cache } from '@iwsdk/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { configureMeshoptDecoder } from '../meshopt-loader';

describe('SDK meshopt configuration adapter', () => {
  it('retains the SDK loader and chain while configuring both decoders', () => {
    configureMeshoptDecoder();
    const loader = new GLTFLoader();
    const ktx2 = {} as Parameters<GLTFLoader['setKTX2Loader']>[0];
    expect(loader.setKTX2Loader(ktx2)).toBe(loader);
    expect((loader as unknown as {meshopt:unknown}).meshopt).toBe(MeshoptDecoder);
    expect((loader as unknown as {ktx2:unknown}).ktx2).toBe(ktx2);
    expect(Cache.enabled).toBe(true);
  });
  it('does not stack hooks when initialization is requested twice', () => {
    const method = GLTFLoader.prototype.setKTX2Loader;
    configureMeshoptDecoder();
    expect(GLTFLoader.prototype.setKTX2Loader).toBe(method);
  });
});

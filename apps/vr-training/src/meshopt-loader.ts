// IWSDK 1.0.1 creates this same addon loader internally. Extend its public
// configuration method: all loading/caching/cloning still belongs to AssetManager.
// No loader is instantiated here, and Three scene classes come from @iwsdk/core.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Cache } from '@iwsdk/core';

let configured = false;
export function configureMeshoptDecoder(): void {
  if (configured) return;
  configured = true;
  // KTX2's task cache keys the source ArrayBuffer. Reuse that buffer even when
  // later GLBs finish after the first texture request, guaranteeing one atlas.
  Cache.enabled = true;
  const setKTX2Loader = GLTFLoader.prototype.setKTX2Loader;
  GLTFLoader.prototype.setKTX2Loader = function (loader) {
    this.setMeshoptDecoder(MeshoptDecoder);
    return setKTX2Loader.call(this, loader);
  };
}

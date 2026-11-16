import { AssetManager } from '@iwsdk/core';

// IWSDK 1.0.1 supports decoder options on AssetManager.init, but World.create
// does not forward them. Keep this public-API adapter at the bootstrap boundary
// so the initial GLTF preload uses the same local decoders as later loads.
export function configureLocalAssetDecoders(): void {
  const original = AssetManager.init.bind(AssetManager);
  AssetManager.init = (renderer, world, options = {}) => original(renderer, world, {
    ...options,
    dracoDecoderPath: `${import.meta.env.BASE_URL}decoders/draco/`,
    ktx2TranscoderPath: `${import.meta.env.BASE_URL}decoders/basis/`,
  });
}

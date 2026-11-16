import { describe, expect, it } from 'vitest';
import { hdrTextureEstimate, payloadInventory } from './build-report-metrics.mjs';

describe('conservative build inventory', () => {
  it('includes non-JS Vite outputs while keeping deferred scripts separate', () => {
    const files = ['index.html', 'assets/main.js', 'assets/deferred.js', 'assets/decoder.wasm', 'assets/main.css', 'assets/font.woff2', 'models/tool.glb', 'ui/AGENTS.md'];
    const inventory = payloadInventory(files.map(file => ({ file, bytes: 1 })), new Set(['assets/main.js']));
    expect(inventory.initial.map(record => record.file)).toEqual([
      'assets/main.js', 'index.html', 'models/tool.glb', 'assets/decoder.wasm', 'assets/main.css', 'assets/font.woff2',
    ]);
    expect(inventory.deferred.map(record => record.file)).toEqual(['assets/deferred.js']);
    expect(inventory.initial.length + inventory.deferred.length).toBe(inventory.runtime.length);
    expect(new Set(inventory.initial.map(record => record.file)).size).toBe(inventory.initial.length);
  });

  it('accounts for each outdoor sky as well as the depot environment', () => {
    const bytes = Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 128 +X 256\n');
    const skies = ['workshop-ibl.hdr', 'street-sky.hdr', 'storm-sky.hdr'].map(file => hdrTextureEstimate(file, bytes));
    expect(skies).toHaveLength(3);
    for (const sky of skies) {
      expect(sky).toMatchObject({ sourceBytes: 262144, pmremTargetBytes: 688128, retainedPingPongBytes: 688128 });
    }
    expect(skies.reduce((sum, sky) => sum + sky.sourceBytes + sky.pmremTargetBytes + sky.retainedPingPongBytes, 0)).toBe(4915200);
    expect(() => hdrTextureEstimate('broken.hdr', Buffer.from('not an HDR'))).toThrow('broken.hdr');
  });
});

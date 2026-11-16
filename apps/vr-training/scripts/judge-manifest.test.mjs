import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertValidIwsdkProjectManifest, normalizeProjectDevOptions } from '@iwsdk/core/project';
import { JUDGE_EMULATOR, judgeManifestText } from './judge-manifest.mjs';

const projectConfig = readFileSync(new URL('../iwsdk.config.json', import.meta.url), 'utf8');

describe('headset-free judge build manifest', () => {
  it('bundles IWER for every desktop browser while Quest Browser keeps native WebXR', () => {
    const judged = JSON.parse(judgeManifestText(projectConfig));
    assertValidIwsdkProjectManifest(judged);
    const { emulator } = normalizeProjectDevOptions(judged);
    expect(emulator.injectOnBuild).toBe(true);
    expect(emulator.activation).toBe('always');
    expect(emulator.userAgentException).toBeInstanceOf(RegExp);
    expect(emulator.userAgentException.test('Mozilla/5.0 (X11; Linux x86_64; Quest 3) OculusBrowser/41.0')).toBe(true);
    expect(emulator.userAgentException.test('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142.0 Safari/537.36')).toBe(false);
  });

  it('keeps the rest of the project authority and its line endings unchanged', () => {
    const original = JSON.parse(projectConfig);
    const judged = JSON.parse(judgeManifestText(projectConfig));
    expect({ ...judged, dev: undefined }).toEqual({ ...original, dev: undefined });
    expect(judged.dev.emulator).toEqual({ ...original.dev.emulator, ...JUDGE_EMULATOR });
    const crlf = '{\r\n  "a": 1\r\n}\r\n';
    expect(judgeManifestText(crlf)).toMatch(/^\{\r\n  "a": 1,\r\n  "dev": \{\r\n[\s\S]*\}\r\n$/);
    expect(judgeManifestText('{"a":1}')).not.toMatch(/\r|\n$/);
  });

  it('leaves the normal build without an emulator', () => {
    const { emulator } = normalizeProjectDevOptions(JSON.parse(projectConfig));
    expect(emulator?.injectOnBuild ?? false).toBe(false);
  });
});

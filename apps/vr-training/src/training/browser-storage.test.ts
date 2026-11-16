import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './accessibility-settings.js';
import { browserStorage } from './browser-storage.js';

describe('storage denied at the browser property', () => {
  it('keeps accessibility defaults and URL overrides usable without throwing', () => {
    const denied = { get localStorage(): Storage { throw new Error('SecurityError'); } };
    const storage = browserStorage(denied);
    expect(storage).toBeUndefined();
    const settings = loadSettings(storage, '?contrast=high&captions=XL');
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, highContrast: true, captionSize: 'XL' });
    expect(() => saveSettings(storage, settings)).not.toThrow();
  });

  it('allows environments without browser storage', () => {
    expect(browserStorage({})).toBeUndefined();
  });
});

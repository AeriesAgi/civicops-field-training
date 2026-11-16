import { describe, expect, it } from 'vitest';
import { loadSettings } from '../training/accessibility-settings';
import { loadGuidance } from '../training/guidance';
import { loadTitleOptions, parseTitleStore, postureOffset, preShiftEnabled, saveTitleOptions, savedVolume, SEATED_OFFSET_M, TITLE_OPTIONS_KEY } from './title-options';

function memory(): Storage {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, clear: () => data.clear(), key: () => null, get length() { return data.size; } } as Storage;
}

describe('title screen options', () => {
  it('defaults to hands-on first: pre-shift questions off, standing, 70% volume', () => {
    const options = loadTitleOptions(memory());
    expect(options.preShift).toBe(false);
    expect(options.posture).toBe('standing');
    expect(options.volume).toBe(0.7);
    expect(preShiftEnabled(undefined)).toBe(false);
  });

  it('sanitises a corrupt or hostile store', () => {
    expect(parseTitleStore({ volume: 9, posture: 'lying', preShift: 'yes' })).toEqual({ version: 1, volume: 1, posture: 'standing', preShift: false });
    expect(parseTitleStore({ volume: Number.NaN })).toMatchObject({ volume: 0.7 });
    expect(parseTitleStore([1, 2])).toMatchObject({ volume: 0.7 });
    const store = memory(); store.setItem(TITLE_OPTIONS_KEY, '{not json');
    expect(savedVolume(store)).toBe(0.7);
  });

  it('round-trips every option through the shared stores', () => {
    const store = memory();
    const settings = saveTitleOptions(store, {
      volume: 0.33, guidance: 'unguided', reducedMotion: true, captions: false, captionSize: 'L', highContrast: true, posture: 'seated', preShift: true,
    });
    expect(settings.benchHeightOffset).toBe(SEATED_OFFSET_M);
    expect(settings.quickStartSeen).toBe(true);
    const back = loadTitleOptions(store);
    expect(back).toMatchObject({ volume: 0.3, guidance: 'unguided', reducedMotion: true, captions: false, captionSize: 'L', highContrast: true, posture: 'seated', preShift: true });
    expect(loadSettings(store, '').reducedMotion).toBe(true);
    expect(loadGuidance(store, '')).toBe('unguided');
    expect(preShiftEnabled(store)).toBe(true);
  });

  it('lowers the bench only when seated', () => {
    expect(postureOffset('standing')).toBe(0);
    expect(postureOffset('seated')).toBeLessThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, dwellTick, handedX, loadSettings, nextCaptionSize, parseSettings, pulse, saveSettings, SETTINGS_KEY, withinReach } from './accessibility-settings';

const memory = () => { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map }; };

describe('accessibility settings', () => {
  it('persists and reloads every option', () => {
    const store = memory();
    const changed = { ...DEFAULT_SETTINGS, oneHanded: true, captionSize: 'XL' as const, reducedMotion: true, leftHanded: true, dwellSelect: true, speechRate: 0.8, benchHeightOffset: -0.2 };
    saveSettings(store, changed);
    expect(loadSettings(store)).toEqual(changed);
  });
  it('sanitises bad and unknown values', () => {
    const parsed = parseSettings({ oneHanded: 'yes', captionSize: 'XXL', reachM: 9, speechRate: Number.NaN, name: 'Thabo' });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, reachM: 0.75 });
    expect('name' in parsed).toBe(false);
    const store = memory(); store.setItem(SETTINGS_KEY, '{broken');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });
  it('honours URL overrides', () => {
    expect(loadSettings(memory(), '?contrast=high&motion=reduced')).toMatchObject({ highContrast: true, reducedMotion: true });
  });
  it('cycles caption sizes, mirrors for left hand and limits reach', () => {
    expect(['M', 'L', 'XL'].map((s) => nextCaptionSize(s as 'M'))).toEqual(['L', 'XL', 'M']);
    expect(handedX(0.3, { leftHanded: true })).toBe(-0.3);
    const r = withinReach(0.6, 0.8, 0.55);
    expect(Math.hypot(r.dx, r.dz)).toBeCloseTo(0.55);
    expect(withinReach(0.1, 0.1, 0.55)).toEqual({ dx: 0.1, dz: 0.1 });
  });
  it('turns pulses off with reduced motion', () => {
    expect(pulse(0.1, { reducedMotion: true })).toBe(pulse(2.7, { reducedMotion: true }));
    expect(pulse(0.1, { reducedMotion: false })).not.toBe(pulse(0.6, { reducedMotion: false }));
  });
  it('dwell selects once after 1.2 s and resets when gaze moves', () => {
    let s = dwellTick({ target: '', sinceMs: 0, fired: false }, 'yes', 0).state;
    expect(dwellTick(s, 'yes', 1100).select).toBeUndefined();
    const hit = dwellTick(s, 'yes', 1200);
    expect(hit.select).toBe('yes');
    expect(dwellTick(hit.state, 'yes', 2000).select).toBeUndefined();
    s = dwellTick(hit.state, 'no', 2100).state;
    expect(dwellTick(s, 'no', 2200).progress).toBeCloseTo(100 / 1200);
    expect(dwellTick(s, '', 2300).state.target).toBe('');
  });
});

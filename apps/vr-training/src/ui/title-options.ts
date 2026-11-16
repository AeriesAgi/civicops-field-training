import { loadSettings, saveSettings, type AccessibilitySettings, type CaptionSize, type KeyValueStore } from '../training/accessibility-settings.js';
import { loadGuidance, saveGuidance, type GuidanceMode } from '../training/guidance.js';

/**
 * Options chosen on the title screen. Accessibility and guidance keep their existing
 * shared stores, so every lesson and the in-headset board read the same choices.
 * Volume, posture and the optional pre-shift briefing live in a small title store.
 */
export type Posture = 'standing' | 'seated';

export interface TitleOptions {
  volume: number;
  guidance: GuidanceMode;
  reducedMotion: boolean;
  captions: boolean;
  captionSize: CaptionSize;
  highContrast: boolean;
  posture: Posture;
  /** Six pre-shift knowledge checks before a field lesson. Off by default: hands-on first. */
  preShift: boolean;
}

export const TITLE_OPTIONS_KEY = 'civicops.title.v1';
export const SEATED_OFFSET_M = -0.16;

interface TitleStore { version: 1; volume: number; posture: Posture; preShift: boolean }
const DEFAULT_TITLE_STORE: TitleStore = { version: 1, volume: 0.7, posture: 'standing', preShift: false };

export function parseTitleStore(raw: unknown): TitleStore {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const volume = typeof value.volume === 'number' && Number.isFinite(value.volume)
    ? Math.round(Math.min(1, Math.max(0, value.volume)) * 10) / 10 : DEFAULT_TITLE_STORE.volume;
  return {
    version: 1,
    volume,
    posture: value.posture === 'seated' ? 'seated' : 'standing',
    preShift: value.preShift === true,
  };
}

function readTitleStore(store: KeyValueStore | undefined): TitleStore {
  try { const raw = store?.getItem(TITLE_OPTIONS_KEY); return raw ? parseTitleStore(JSON.parse(raw)) : { ...DEFAULT_TITLE_STORE }; } catch { return { ...DEFAULT_TITLE_STORE }; }
}

export function loadTitleOptions(store: KeyValueStore | undefined, search = ''): TitleOptions {
  const title = readTitleStore(store);
  const a11y = loadSettings(store, search);
  return {
    volume: title.volume, posture: title.posture, preShift: title.preShift,
    guidance: loadGuidance(store, search),
    reducedMotion: a11y.reducedMotion, captions: a11y.captions, captionSize: a11y.captionSize, highContrast: a11y.highContrast,
  };
}

/** Bench offset applied to the field rig: seated lowers the work, standing keeps the authored height. */
export function postureOffset(posture: Posture): number {
  return posture === 'seated' ? SEATED_OFFSET_M : 0;
}

/** Persist into the shared stores. Returns the accessibility settings now in force. */
export function saveTitleOptions(store: KeyValueStore | undefined, options: TitleOptions): AccessibilitySettings {
  const current = loadSettings(store, '');
  const next: AccessibilitySettings = {
    ...current,
    reducedMotion: options.reducedMotion, captions: options.captions, captionSize: options.captionSize,
    highContrast: options.highContrast, benchHeightOffset: postureOffset(options.posture),
    // The title screen replaces the first-run quick-start card.
    quickStartSeen: true,
  };
  saveSettings(store, next);
  saveGuidance(store, options.guidance);
  try {
    store?.setItem(TITLE_OPTIONS_KEY, JSON.stringify(parseTitleStore({ volume: options.volume, posture: options.posture, preShift: options.preShift })));
  } catch { /* storage blocked: options stay for this visit */ }
  return next;
}

export function savedVolume(store: KeyValueStore | undefined): number {
  return readTitleStore(store).volume;
}

export function preShiftEnabled(store: KeyValueStore | undefined): boolean {
  return readTitleStore(store).preShift;
}

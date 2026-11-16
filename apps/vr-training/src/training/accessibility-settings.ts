/**
 * Shared, persisted accessibility settings for every module and the AR assist.
 * Stored locally only; contains no identity data.
 */
export type CaptionSize = 'M' | 'L' | 'XL';
export interface AccessibilitySettings {
  version: 1;
  oneHanded: boolean;
  gazePinch: boolean;
  pokeOnly: boolean;
  captions: boolean;
  captionSize: CaptionSize;
  highContrast: boolean;
  reducedMotion: boolean;
  leftHanded: boolean;
  /** Metres added to bench / card height, seated and wheelchair friendly. */
  benchHeightOffset: number;
  /** Maximum comfortable reach in metres; interactables are pulled within it. */
  reachM: number;
  speechRate: number;
  dwellSelect: boolean;
  /** Set once the first-run accessibility quick-start has been shown. */
  quickStartSeen: boolean;
}

export const SETTINGS_KEY = 'civicops.accessibility.v1';
export const DWELL_MS = 1200;
export const DEFAULT_SETTINGS: Readonly<AccessibilitySettings> = {
  version: 1, oneHanded: false, gazePinch: false, pokeOnly: false, captions: true, captionSize: 'M', highContrast: false,
  reducedMotion: false, leftHanded: false, benchHeightOffset: 0, reachM: 0.55, speechRate: 1, dwellSelect: false, quickStartSeen: false,
};

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** Tolerant parse: unknown keys dropped, bad values replaced with defaults. */
export function parseSettings(raw: unknown): AccessibilitySettings {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const d = DEFAULT_SETTINGS;
  return {
    version: 1,
    oneHanded: bool(value.oneHanded, d.oneHanded), gazePinch: bool(value.gazePinch, d.gazePinch), pokeOnly: bool(value.pokeOnly, d.pokeOnly),
    captions: bool(value.captions, d.captions),
    captionSize: value.captionSize === 'L' || value.captionSize === 'XL' ? value.captionSize : 'M',
    highContrast: bool(value.highContrast, d.highContrast), reducedMotion: bool(value.reducedMotion, d.reducedMotion),
    leftHanded: bool(value.leftHanded, d.leftHanded),
    benchHeightOffset: clamp(value.benchHeightOffset, -0.4, 0.4, d.benchHeightOffset),
    reachM: clamp(value.reachM, 0.35, 0.75, d.reachM),
    speechRate: clamp(value.speechRate, 0.6, 1.6, d.speechRate),
    dwellSelect: bool(value.dwellSelect, d.dwellSelect), quickStartSeen: bool(value.quickStartSeen, d.quickStartSeen),
  };
}

export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadSettings(store: KeyValueStore | undefined, search = ''): AccessibilitySettings {
  let settings = DEFAULT_SETTINGS as AccessibilitySettings;
  try { const raw = store?.getItem(SETTINGS_KEY); if (raw) settings = parseSettings(JSON.parse(raw)); } catch { settings = { ...DEFAULT_SETTINGS }; }
  const params = new URLSearchParams(search);
  if (params.get('contrast') === 'high') settings = { ...settings, highContrast: true };
  if (params.get('motion') === 'reduced') settings = { ...settings, reducedMotion: true };
  const captions = params.get('captions');
  if (captions === 'M' || captions === 'L' || captions === 'XL') settings = { ...settings, captionSize: captions };
  if (params.get('hand') === 'left') settings = { ...settings, leftHanded: true };
  return { ...settings };
}

export function saveSettings(store: KeyValueStore | undefined, settings: AccessibilitySettings): void {
  try { store?.setItem(SETTINGS_KEY, JSON.stringify(parseSettings(settings))); } catch { /* storage full or blocked: settings stay for this session */ }
}

export const CAPTION_SCALE: Readonly<Record<CaptionSize, number>> = { M: 1, L: 1.25, XL: 1.5 };
export function nextCaptionSize(size: CaptionSize): CaptionSize { return size === 'M' ? 'L' : size === 'L' ? 'XL' : 'M'; }

/** Mirror a lateral offset for left-handed layout. */
export function handedX(x: number, settings: Pick<AccessibilitySettings, 'leftHanded'>): number { return settings.leftHanded ? -x : x; }

/** Pull a point within comfortable reach of the seated shoulder (horizontal distance only). */
export function withinReach(dx: number, dz: number, reachM: number): { dx: number; dz: number } {
  const d = Math.hypot(dx, dz);
  if (d <= reachM || d === 0) return { dx, dz };
  return { dx: (dx / d) * reachM, dz: (dz / d) * reachM };
}

/** Pulse amplitude for highlights; zero when reduced motion is on. */
export function pulse(elapsedS: number, settings: Pick<AccessibilitySettings, 'reducedMotion'>, base = 0.55, amp = 0.25): number {
  return settings.reducedMotion ? base + amp : base + amp * Math.sin(elapsedS * 3);
}

/**
 * Gaze dwell selection for users who cannot pinch reliably.
 * Looking at one target for DWELL_MS selects it once; looking away resets.
 */
export interface DwellState { target: string; sinceMs: number; fired: boolean }
export function dwellTick(state: DwellState, target: string, nowMs: number, dwellMs = DWELL_MS): { state: DwellState; select?: string; progress: number } {
  if (!target) return { state: { target: '', sinceMs: nowMs, fired: false }, progress: 0 };
  if (target !== state.target) return { state: { target, sinceMs: nowMs, fired: false }, progress: 0 };
  const progress = Math.min(1, (nowMs - state.sinceMs) / dwellMs);
  if (progress >= 1 && !state.fired) return { state: { ...state, fired: true }, select: target, progress: 1 };
  return { state, progress };
}

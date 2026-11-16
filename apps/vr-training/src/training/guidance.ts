/**
 * Guided practice vs unguided assessment. Stored locally only; no identity data.
 * Judges can set ?guidance=unguided (or guided) on the training URL.
 */
export type GuidanceMode = 'guided' | 'unguided';

export const DEFAULT_GUIDANCE: GuidanceMode = 'guided';
export const GUIDANCE_KEY = 'civicops.training.guidance.v1';
export const UNGUIDED_BRIEF = "This is an unguided assessment. I'll only step in if something is unsafe.";

export interface GuidanceStore {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

export function parseGuidance(raw: unknown): GuidanceMode {
  if (raw === 'guided' || raw === 'unguided') return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const mode = (raw as { mode?: unknown }).mode;
    if (mode === 'guided' || mode === 'unguided') return mode;
  }
  return DEFAULT_GUIDANCE;
}

export function saveGuidance(store: GuidanceStore | undefined, mode: GuidanceMode): void {
  try { store?.setItem?.(GUIDANCE_KEY, JSON.stringify({ version: 1, mode })); } catch { /* storage may be denied */ }
}

export function loadGuidance(store?: GuidanceStore, search = ''): GuidanceMode {
  let mode = DEFAULT_GUIDANCE;
  try {
    const raw = store?.getItem(GUIDANCE_KEY);
    if (raw) {
      try { mode = parseGuidance(JSON.parse(raw)); } catch { mode = parseGuidance(raw); }
    }
  } catch {
    mode = DEFAULT_GUIDANCE;
  }
  const query = search.startsWith('?') ? search.slice(1) : search;
  const fromUrl = new URLSearchParams(query).get('guidance');
  if (fromUrl === 'guided' || fromUrl === 'unguided') {
    mode = fromUrl;
    saveGuidance(store, mode);
  }
  return mode;
}

export function volunteersInstruction(mode: GuidanceMode): boolean {
  return mode === 'guided';
}

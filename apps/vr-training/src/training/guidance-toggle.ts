import { saveGuidance, type GuidanceMode, type GuidanceStore } from './guidance.js';

/** The board's in-headset switch between guided practice and unguided assessment. */
export function nextGuidance(mode: GuidanceMode): GuidanceMode {
  return mode === 'guided' ? 'unguided' : 'guided';
}

export function guidanceToggleLabel(mode: GuidanceMode): string {
  return mode === 'guided' ? 'Guided practice' : 'Unguided assessment';
}

/** The URL with any ?guidance= judge override removed, so a choice made in the headset sticks. */
export function searchWithoutGuidance(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('guidance');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/** Save the headset choice and return the search string every module should load with next. */
export function chooseGuidance(store: GuidanceStore | undefined, search: string, mode: GuidanceMode): string {
  saveGuidance(store, mode);
  return searchWithoutGuidance(search);
}

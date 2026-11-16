import { UNGUIDED_BRIEF, type GuidanceMode } from './guidance';
import { assessmentFeedback } from './assessment-cues';
import { RAIN_STEPS } from './roads-incident';
import type { RoadsState } from './roads-procedure';

/**
 * Roads rain incident copy for guided practice or unguided assessment.
 * The reducer answers a correct incident step with the next phase's instruction.
 * Guided keeps that. Unguided swaps it for a plain acknowledgement, so the trainee
 * decides the next action. Success feedback also drops trailing next-step cues. Unsafe stops, out-of-order reviews and requested hints
 * are untouched, and step notes in the attempt record are never rewritten.
 */
export function roadsGuidedFeedback(previous: RoadsState, next: RoadsState, mode: GuidanceMode): RoadsState {
  if (mode !== 'unguided' || next.failed) return next;
  const from = previous.rainPhase, to = next.rainPhase;
  if (!from || !to || from === to || next.feedback !== RAIN_STEPS[to].instruction) return assessmentFeedback(next, mode);
  return { ...next, feedback: `Recorded: ${RAIN_STEPS[from].action}.` };
}

/** Steps-panel caption during the incident. Unguided never volunteers the phase instruction. */
export function roadsIncidentCaption(state: RoadsState, mode: GuidanceMode): string {
  const phase = state.rainPhase;
  return mode === 'unguided' || !phase ? state.feedback : RAIN_STEPS[phase].instruction;
}

/** Opening state for a fresh attempt. Unguided shows the assessment brief instead of the first instruction. */
export function roadsOpening(state: RoadsState, mode: GuidanceMode): RoadsState {
  return mode === 'unguided' ? { ...state, feedback: UNGUIDED_BRIEF } : state;
}
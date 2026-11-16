import { UNGUIDED_BRIEF, type GuidanceMode } from './guidance';
import type { PreparationState } from './programme-state';
import { TRAINING_PROGRAMMES } from './programmes';

/** Neutral retry for a non-critical mistake in an unguided assessment. It never names the right answer. */
export const UNGUIDED_RETRY = 'Not confirmed. Re-read the brief and check your answer.';

export interface PreShiftView {
  /** Progress label on the department board. */
  progress: string;
  /** Feedback text under the current check. */
  feedback: string;
  /** Instructor line for this view, if any. */
  spoken?: string;
}

/**
 * Pre-shift board copy for guided practice or unguided assessment.
 * Guided reads each check aloud and coaches every mistake.
 * Unguided gives the assessment brief, reads no prompts and keeps non-critical
 * mistakes neutral, but a safety stop still speaks its full remediation.
 * The attempt record keeps the remediation either way, for the debrief.
 */
export function preShiftView(state: PreparationState, mode: GuidanceMode): PreShiftView {
  const programme = TRAINING_PROGRAMMES[state.moduleId];
  const check = programme.checks[state.index];
  const unguided = mode === 'unguided';
  if (state.phase === 'stopped') return { progress: 'SAFETY STOP / ATTEMPT FAILED', feedback: state.feedback, spoken: state.feedback };
  if (state.phase === 'ready') return { progress: 'PRE-SHIFT COMPLETE / READY', feedback: state.feedback, spoken: state.feedback };
  const progress = `${unguided ? 'UNGUIDED' : 'PRE-SHIFT'} / ${check.phase.toUpperCase()} / ${state.index + 1} OF ${programme.checks.length}`;
  if (!unguided) return { progress, feedback: state.feedback, spoken: `${check.prompt} ${state.feedback}` };
  const last = state.steps[state.steps.length - 1];
  const feedback = state.steps.length === 0 ? UNGUIDED_BRIEF : last && last.outcome !== 'correct' ? UNGUIDED_RETRY : state.feedback;
  return { progress, feedback, spoken: feedback };
}
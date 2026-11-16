import { UNGUIDED_BRIEF, type GuidanceMode } from './guidance';

/**
 * Step caption for guided practice or unguided assessment.
 * Guided shows the authored step caption. Unguided shows the latest reducer
 * feedback (acknowledgements, safety stops, requested hints). A bare step
 * instruction becomes the assessment brief and a restated completed instruction
 * becomes a plain acknowledgement, so it never volunteers the next action.
 * `compact` shortens real feedback only; it runs after the instruction checks.
 */
export const STEP_RECORDED = 'Step recorded.';
export function guidanceCaption(mode: GuidanceMode, guidedCaption: string, feedback: string, instructions: readonly string[], compact: (text: string) => string = (text) => text): string {
  if (mode !== 'unguided') return guidedCaption;
  if (!feedback || instructions.includes(feedback)) return UNGUIDED_BRIEF;
  if (instructions.some((instruction) => feedback === `${instruction} Complete.`)) return STEP_RECORDED;
  return compact(feedback);
}

/** Short controls-panel status for unguided runs. It states the mode, never a step. */
export const UNGUIDED_STATUS = 'Unguided assessment.\nYou decide each action.';

/** Controls-panel step status. Unguided swaps the authored step copy for the mode notice. */
export function guidanceStatus(mode: GuidanceMode, guidedStatus: string): string {
  return mode === 'unguided' ? UNGUIDED_STATUS : guidedStatus;
}

/** Water step title. The seized-valve route "Plan A then D" is coaching, so unguided keeps the plain title. */
export function waterStepTitle(stepId: string, alternate: boolean, mode: GuidanceMode, title: string): string {
  return stepId === 'identify-valves' && alternate && mode !== 'unguided' ? 'Plan A then D' : title;
}
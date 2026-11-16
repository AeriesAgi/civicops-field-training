import { volunteersInstruction, type GuidanceMode } from './guidance';
import type { RainPhase } from './roads-incident';
import { WATER_FEEDBACK } from './water-procedure';

/**
 * Unguided assessment contract for on-screen cues. Guided practice is unchanged.
 * Unguided keeps every control usable and every safety stop, requested hint and
 * explain-why answer, but stops cues that name the next action or the SOP answer.
 */

/** Current-step title. Unguided numbers the step instead of naming the action. */
export function assessmentStepTitle(mode: GuidanceMode, guidedTitle: string, order: number, total: number): string {
  return mode === 'unguided' ? `Step ${order} of ${total}` : guidedTitle;
}

const INCIDENT_ORDER: readonly RainPhase[] = ['refuge', 'radio', 'traffic', 'tape', 'assist', 'record', 'schedule'];

/** Roads rain incident title. Unguided numbers the phase instead of naming it. */
export function incidentStepTitle(mode: GuidanceMode, guidedTitle: string, phase: RainPhase): string {
  const index = INCIDENT_ORDER.indexOf(phase);
  return mode === 'unguided' && index >= 0 ? `Incident step ${index + 1} of ${INCIDENT_ORDER.length}` : guidedTitle;
}

/** Target glow, idle hints and automatic gesture demos are practice coaching only. */
export function automaticCoaching(mode: GuidanceMode): boolean {
  return volunteersInstruction(mode);
}

export const WATER_SEIZED_UNGUIDED = 'B is seized. Do not force it. Report it to control and replan the isolation.';
export const WATER_SEIZED_UNGUIDED_SHORT = 'B is seized. Do not force it. Report it to control.';

/** Reducer feedback that ends with a next-step cue, and its unguided acknowledgement. */
export const UNGUIDED_FEEDBACK: Readonly<Record<string, string>> = {
  [WATER_FEEDBACK.seized]: WATER_SEIZED_UNGUIDED,
  'Washout open. Trapped pressure drains; read the gauge and confirm zero flow.': 'Washout open. Trapped pressure drains.',
  'Driver brief acknowledged. Van parked in the upstream service bay. Check the beacon before unloading.': 'Driver brief acknowledged. Van parked in the upstream service bay.',
  'Crew brief acknowledged. Take the protected pavement route to both refuges. Keep STOP displayed; confirm sight lines before releasing traffic.': 'Crew brief acknowledged. Crew moving to both refuges.',
  'Both marshals on station, outside traffic. STOP displayed. Check sight lines and run the zone audit.': 'Both marshals on station, outside traffic. STOP displayed.',
  'Zone check clear. Poke Run traffic for the demonstration. An authorised person decides real actions.': 'Zone check clear. An authorised person decides real actions.',
};

/** Display feedback for the mode. Step notes in the attempt record are never rewritten. */
export function assessmentFeedback<T extends { feedback: string }>(state: T, mode: GuidanceMode): T {
  if (mode !== 'unguided') return state;
  const feedback = UNGUIDED_FEEDBACK[state.feedback];
  return feedback ? { ...state, feedback } : state;
}

/** Water network panel status. Unguided reports facts the trainee has met, never the route. */
export function waterNetworkStatus(mode: GuidanceMode, schematicChecked: boolean, alternate: boolean, recovering: boolean): string {
  if (schematicChecked) return `ROUTE ${alternate ? 'A-D' : 'A-B'} / C PROTECTED`;
  if (mode !== 'unguided') return alternate ? 'B SEIZED / USE A-D' : 'A-D: use if B seized';
  return alternate && recovering ? 'B SEIZED / REPLAN' : 'PLAN THE ISOLATION';
}

/** Valve key guide. Unguided keeps how the control works and leaves the closing rate to the trainee. */
export function waterTurnGuide(mode: GuidanceMode, seated: boolean): string {
  if (mode === 'unguided') return seated ? 'Roll clockwise to turn.\nLift up to move key.' : 'Lift cover. Seat key.\nRoll to turn. Regrip.';
  return seated ? 'Roll clockwise slowly.\nLift up to move key.' : 'Lift cover. Seat key.\nRoll slowly. Regrip.';
}

/** Roads zone status. The blind-bend prompt is coaching; unguided keeps the neutral status. */
export function roadsZoneStatus(mode: GuidanceMode, guidedStatus: string): string {
  return mode === 'unguided' && guidedStatus === 'BEND / Warn earlier' ? 'Place freely. Check your zone.' : guidedStatus;
}
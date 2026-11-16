import { PROCEDURE_MESSAGES, type ProcedureMessageId, type ProcedureState, type StepId } from './procedure.js';
import type { VoiceLine } from './instructor-voice.js';

export type StepLineKind = 'instruction' | 'hint' | 'why' | 'success';
export type GeneralLineId =
  | 'raise-hands' | 'greeting' | 'complete' | 'unsafe' | 'out-of-order'
  | 'first-target' | 'micro-offer' | 'micro-off' | 'micro-lock' | 'micro-tag'
  | 'first-lock-stamp' | 'returning-choice' | 'drill-timeout' | 'daily-start'
  | 'schematic-checked' | 'one-hand-enabled' | 'one-hand-disabled'
  | 'gaze-pinch-enabled' | 'gaze-pinch-disabled' | 'backfeed-unavailable';
export type InstructorLineId = `${StepId}.${StepLineKind}` | `event.${ProcedureMessageId}` | GeneralLineId;
export interface InstructorLine extends VoiceLine { readonly id: InstructorLineId; }
type StepScript = Readonly<Record<StepLineKind, InstructorLine>>;

/** One source for captions, device speech, rendered voice files and future agent replies. */
export const INSTRUCTOR_SCRIPT = {
  steps: {
    'identify-circuit': {
      instruction: { id: 'identify-circuit.instruction', text: 'Match bay 3 / SL-3 to your work order.' },
      hint: { id: 'identify-circuit.hint', text: 'Check the work-order schematic. Then poke bay 3, SL-3.' },
      why: { id: 'identify-circuit.why', text: 'Matching the schematic prevents isolating a different circuit.' },
      success: { id: 'identify-circuit.success', text: 'SL-3 identified. Now let control know.' },
    },
    'notify-control': {
      instruction: { id: 'notify-control.instruction', text: 'Notify control before switching off.' },
      hint: { id: 'notify-control.hint', text: 'Poke the Notify control action.' },
      why: { id: 'notify-control.why', text: 'Control needs to know which supply is being isolated.' },
      success: { id: 'notify-control.success', text: 'Control notified. You can switch SL-3 off.' },
    },
    'switch-off': {
      instruction: { id: 'switch-off.instruction', text: 'Poke the SL-3 switch to turn it OFF.' },
      hint: { id: 'switch-off.hint', text: 'Poke the highlighted SL-3 switch. Look for OFF.' },
      why: { id: 'switch-off.why', text: 'Switching off removes the normal supply. A dead test still follows.' },
      success: { id: 'switch-off.success', text: 'SL-3 switched off. Secure it with your personal lock.' },
    },
    'apply-lock': {
      instruction: { id: 'apply-lock.instruction', text: 'Pinch the padlock. Place it on the isolator.' },
      hint: { id: 'apply-lock.hint', text: 'Pinch the red padlock. Release it into the glowing lock seat.' },
      why: { id: 'apply-lock.why', text: 'Your personal lock prevents another person restoring the supply.' },
      success: { id: 'apply-lock.success', text: 'Your lock is seated. Attach the danger tag.' },
    },
    'apply-tag': {
      instruction: { id: 'apply-tag.instruction', text: 'Pinch the danger tag. Place it on your lock.' },
      hint: { id: 'apply-tag.hint', text: 'Pinch the red danger tag. Release it beside your seated lock.' },
      why: { id: 'apply-tag.why', text: 'The tag explains who isolated the supply and why.' },
      success: { id: 'apply-tag.success', text: 'Tag attached. Now try to switch SL-3 back on.' },
    },
    'try-start': {
      instruction: { id: 'try-start.instruction', text: 'Try to switch SL-3 back on. Your lock should stop it.' },
      hint: { id: 'try-start.hint', text: 'Poke the locked SL-3 switch. It must not move to ON.' },
      why: { id: 'try-start.why', text: 'Trying the control proves the lock really holds the supply off.' },
      success: { id: 'try-start.success', text: 'The lock held. SL-3 stays off. Pick up the tester and prove it.' },
    },
    'prove-tester': {
      instruction: { id: 'prove-tester.instruction', text: 'Touch the proving unit. Confirm 230 V.' },
      hint: { id: 'prove-tester.hint', text: 'Pinch the tester. Touch its probe to the proving unit.' },
      why: { id: 'prove-tester.why', text: 'A known live source shows the tester works before your dead test.' },
      success: { id: 'prove-tester.success', text: 'Tester proved at 230 volts. Test the SL-3 terminals.' },
    },
    'test-dead': {
      instruction: { id: 'test-dead.instruction', text: 'Touch the SL-3 terminals. Confirm 0 V.' },
      hint: { id: 'test-dead.hint', text: 'Use the tester probe on SL-3. Keep your bare hands clear.' },
      why: { id: 'test-dead.why', text: 'A zero reading checks that no supply remains at the work point.' },
      success: { id: 'test-dead.success', text: 'Zero volts confirmed on SL-3. Re-prove your tester.' },
    },
    're-prove-tester': {
      instruction: { id: 're-prove-tester.instruction', text: 'Return to the proving unit. Confirm 230 V again.' },
      hint: { id: 're-prove-tester.hint', text: 'Touch the tester probe to the proving unit once more.' },
      why: { id: 're-prove-tester.why', text: 'Re-proving confirms the tester did not fail during your dead test.' },
      success: { id: 're-prove-tester.success', text: 'Tester re-proved. Complete your final safety confirmation.' },
    },
    'safe-to-work': {
      instruction: { id: 'safe-to-work.instruction', text: 'Hold Safe to work. Release after the ring fills.' },
      hint: { id: 'safe-to-work.hint', text: 'Hold your fingertip on Safe to work until the ring fills.' },
      why: { id: 'safe-to-work.why', text: 'This final check confirms isolation and prove-test-prove are complete.' },
      success: { id: 'safe-to-work.success', text: 'Isolation checked. Your practice result is ready.' },
    },
  } satisfies Readonly<Record<StepId, StepScript>>,
  events: {
    'touch-terminals': { id: 'event.touch-terminals', text: 'Pause. Your hand reached the terminals before a dead test. Use the tester first.' },
    'secondary-before-primary': { id: 'event.secondary-before-primary', text: 'Secure the primary supply first. Then isolate and lock the secondary source.' },
    'secondary-isolated': { id: 'event.secondary-isolated', text: 'Secondary supply switched off. Apply its lock before testing again.' },
    'secondary-locked': { id: 'event.secondary-locked', text: 'Secondary supply locked. Repeat the dead test on SL-3.' },
    'skip-wrong-step': { id: 'event.skip-wrong-step', text: 'Only the highlighted step can be skipped. Follow the current-step card.' },
    'step-skipped': { id: 'event.step-skipped', text: 'Step skipped. It remains incomplete in your practice record.' },
    'unsafe-stopped': { id: 'event.unsafe-stopped', text: 'The practice has paused so we can review that action calmly.' },
    'safe-too-soon': { id: 'event.safe-too-soon', text: 'Pause. Isolation and prove-test-prove must be complete before confirming safe to work.' },
    'wrong-breaker-dead-test': { id: 'event.wrong-breaker-dead-test', text: 'Pause. A different breaker is off. The work-order circuit can still be live.' },
    'wrong-circuit-dead-test': { id: 'event.wrong-circuit-dead-test', text: 'Pause. That was a different circuit. SL-3 still needs its own dead test.' },
    'wrong-breaker-switch': { id: 'event.wrong-breaker-switch', text: 'That switch feeds a different circuit. Match SL-3 to the work-order schematic.' },
    'wrong-circuit-identify': { id: 'event.wrong-circuit-identify', text: 'Check the schematic again. Your work order names bay 3, SL-3.' },
    'mislabelled-breaker': { id: 'event.mislabelled-breaker', text: 'The label and schematic differ. Check the work order to confirm bay 3, SL-3.' },
    'missing-prerequisite': { id: 'event.missing-prerequisite', text: 'An earlier safety action is incomplete. Follow the highlighted step before continuing.' },
    'backfeed-live': { id: 'event.backfeed-live', text: 'The tester reads 230 volts. Isolate and lock the secondary supply, then test again.' },
    'circuit-live': { id: 'event.circuit-live', text: 'Pause. SL-3 is still live. Keep clear and review the isolation before trying again.' },
    'secondary-unlocked': { id: 'event.secondary-unlocked', text: 'The secondary supply is off but unsecured. Apply its lock before the dead test.' },
    'out-of-order': { id: 'event.out-of-order', text: 'Complete the highlighted step first. Each safety check supports the next.' },
    'try-start-held': { id: 'event.try-start-held', text: 'The switch will not move. Your lock holds SL-3 off.' },
    'critical-skipped': { id: 'event.critical-skipped', text: 'That safety check was skipped. Repeat the practice with every critical check complete.' },
  } satisfies Readonly<Record<ProcedureMessageId, InstructorLine>>,
  general: {
    'raise-hands': { id: 'raise-hands', text: 'Raise your hands. Either hand works.' },
    greeting: { id: 'greeting', text: 'Welcome, crew. Let us isolate the streetlight feeder safely.' },
    complete: { id: 'complete', text: 'Isolation checked. Review your results before your next practice.' },
    unsafe: { id: 'unsafe', text: 'Pause. Let us review that action, then practise again.' },
    'out-of-order': { id: 'out-of-order', text: 'Check the highlighted step before continuing.' },
    'first-target': { id: 'first-target', text: 'There you are. Poke the glowing SL-3 target.' },
    'micro-offer': { id: 'micro-offer', text: 'Try First lock: switch off, lock, then tag. Or begin the full lesson.' },
    'micro-off': { id: 'micro-off', text: 'First, poke the glowing SL-3 switch to turn it off.' },
    'micro-lock': { id: 'micro-lock', text: 'Pinch your personal padlock. Place it in the glowing seat.' },
    'micro-tag': { id: 'micro-tag', text: 'Now pinch the danger tag. Place it beside your lock.' },
    'first-lock-stamp': { id: 'first-lock-stamp', text: 'First lock earned. You are ready for the full isolation lesson.' },
    'returning-choice': { id: 'returning-choice', text: "Welcome back. Continue the lesson, or try today's daily drill." },
    'drill-timeout': { id: 'drill-timeout', text: 'Take your time. Continue with the full isolation lesson.' },
    'daily-start': { id: 'daily-start', text: "Today's drill is ready. Match SL-3 to the work-order schematic." },
    'schematic-checked': { id: 'schematic-checked', text: 'Schematic checked. Bay 3 feeds SL-3.' },
    'one-hand-enabled': { id: 'one-hand-enabled', text: 'Either hand works. Your tools are now closer together.' },
    'one-hand-disabled': { id: 'one-hand-disabled', text: 'Either hand works. Your tools are back in their usual seats.' },
    'gaze-pinch-enabled': { id: 'gaze-pinch-enabled', text: 'Look at a target, then pinch to select.' },
    'gaze-pinch-disabled': { id: 'gaze-pinch-disabled', text: 'Direct hand interaction is ready. Poke a target or pinch a tool.' },
    'backfeed-unavailable': { id: 'backfeed-unavailable', text: 'This bench practises a single supply. Choose a standard lesson or daily drill.' },
  } satisfies Readonly<Record<GeneralLineId, InstructorLine>>,
} as const;

export const INSTRUCTOR_LINES = {
  raiseHands: INSTRUCTOR_SCRIPT.general['raise-hands'].text,
  greeting: INSTRUCTOR_SCRIPT.general.greeting.text,
  complete: INSTRUCTOR_SCRIPT.general.complete.text,
  unsafe: INSTRUCTOR_SCRIPT.general.unsafe.text,
  outOfOrder: INSTRUCTOR_SCRIPT.general['out-of-order'].text,
} as const;

export const STEP_CAPTIONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(INSTRUCTOR_SCRIPT.steps).map(([id, lines]) => [id, lines.instruction.text]),
);

export const INSTRUCTOR_LINE_BY_ID: Readonly<Record<InstructorLineId, InstructorLine>> = Object.fromEntries([
  ...Object.values(INSTRUCTOR_SCRIPT.steps).flatMap((step) => Object.values(step)),
  ...Object.values(INSTRUCTOR_SCRIPT.events), ...Object.values(INSTRUCTOR_SCRIPT.general),
].map((line) => [line.id, line])) as Record<InstructorLineId, InstructorLine>;

/** Exact reducer messages take precedence over generated order/skip messages. */
export function procedureMessageId(feedback: string): ProcedureMessageId | undefined {
  for (const id of Object.keys(PROCEDURE_MESSAGES) as ProcedureMessageId[]) {
    if (PROCEDURE_MESSAGES[id] === feedback) return id;
  }
  if (feedback.startsWith('Complete ') && feedback.endsWith(' first.')) return 'out-of-order';
  if (feedback.startsWith('Critical step skipped: ')) return 'critical-skipped';
  return undefined;
}

/** Unsafe stops append skipped rows: select the actual new action, never the last skipped row. */
export function outcomeLine(previous: ProcedureState, next: ProcedureState): InstructorLine | undefined {
  if (previous === next) return undefined;
  if (next.criticalErrors.length > previous.criticalErrors.length) {
    const id = procedureMessageId(next.criticalErrors[next.criticalErrors.length - 1]);
    if (id) return INSTRUCTOR_SCRIPT.events[id];
  }
  const messageId = procedureMessageId(next.feedback);
  if (messageId) return INSTRUCTOR_SCRIPT.events[messageId];
  const result = next.steps[previous.steps.length];
  if (result?.outcome === 'correct' && result.stepId in INSTRUCTOR_SCRIPT.steps) {
    return INSTRUCTOR_SCRIPT.steps[result.stepId as StepId].success;
  }
  return undefined;
}

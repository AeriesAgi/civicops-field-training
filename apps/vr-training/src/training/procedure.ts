import type { StepResult, TrainingScenario, TrainingStep } from './contracts';
import { elecLotoModule, WORK_ORDER_CIRCUIT } from './modules/elec-loto';
import { nextProcedureStep, procedureTimestamp, recordProcedureOutcome, stopUnsafeProcedure, type ProcedureOutcomeState } from './procedure-engine';

export type StepId =
  | 'identify-circuit' | 'notify-control' | 'switch-off' | 'apply-lock'
  | 'apply-tag' | 'try-start' | 'prove-tester' | 'test-dead' | 're-prove-tester' | 'safe-to-work';

/** Stable, browser-free feedback causes keep the spoken script exhaustive. */
export const PROCEDURE_MESSAGES = {
  'touch-terminals': 'Hand touched the terminals before a successful dead test.',
  'secondary-before-primary': 'Isolate and lock the primary source before the secondary source.',
  'secondary-isolated': 'Secondary source isolated. Apply its lock.',
  'secondary-locked': 'Secondary source locked. Repeat the dead test.',
  'skip-wrong-step': 'Only the current step can be skipped.',
  'step-skipped': 'Step skipped by the trainee.',
  'unsafe-stopped': 'Attempt stopped after an unsafe action.',
  'safe-too-soon': 'Safe to work was confirmed before isolation and prove-test-prove were complete.',
  'wrong-breaker-dead-test': 'A different breaker was switched off; the work-order circuit is still live.',
  'wrong-circuit-dead-test': 'The trainee tested a different circuit as dead; SL-3 remains unverified.',
  'wrong-breaker-switch': 'Wrong breaker switched off. The work-order circuit remains live.',
  'wrong-circuit-identify': 'Check the schematic: the work-order circuit is SL-3.',
  'mislabelled-breaker': 'The breaker label differs from the schematic. Confirm SL-3 using the work order.',
  'missing-prerequisite': 'A required earlier physical safety action is incomplete.',
  'backfeed-live': '230 V: backfeed detected. Isolate and lock the secondary source, then repeat the test.',
  'circuit-live': 'SL-3 is still live. Do not declare it dead.',
  'secondary-unlocked': 'Lock the secondary isolator before completing the dead test.',
  'out-of-order': 'Complete {step} first.',
  'try-start-held': 'Start attempt blocked: your lock holds SL-3 OFF. Isolation verified.',
  'critical-skipped': 'Critical step skipped: {stepId}.',
} as const;

export type ProcedureMessageId = keyof typeof PROCEDURE_MESSAGES;

export type ProcedureEvent = StepId
  | { type: 'identify-circuit'; breakerId: string; schematicChecked?: boolean }
  | { type: 'switch-off'; breakerId: string }
  | { type: 'test-dead'; circuitId?: string }
  | { type: 'touch-terminals' }
  | { type: 'isolate-secondary' }
  | { type: 'lock-secondary' }
  | { type: 'skip'; stepId?: StepId };

export interface PhysicalState {
  identified: boolean;
  notified: boolean;
  breakerOff: boolean;
  lockApplied: boolean;
  tagApplied: boolean;
  /** The trainee tried to restore SL-3 and the lock held it OFF. */
  startTried: boolean;
  testerProved: boolean;
  deadTested: boolean;
  testerReproved: boolean;
  secondaryOff: boolean;
  secondaryLocked: boolean;
  wrongBreakerOff: boolean;
}

export interface ProcedureState extends ProcedureOutcomeState {
  physical: PhysicalState;
}

const physicalField: Record<Exclude<StepId, 'safe-to-work'>, keyof PhysicalState> = {
  'identify-circuit': 'identified', 'notify-control': 'notified',
  'switch-off': 'breakerOff', 'apply-lock': 'lockApplied', 'apply-tag': 'tagApplied',
  'try-start': 'startTried',
  'prove-tester': 'testerProved', 'test-dead': 'deadTested', 're-prove-tester': 'testerReproved',
};

export function start(scenario: TrainingScenario): ProcedureState {
  if (scenario.moduleId !== elecLotoModule.id) throw new Error('Scenario belongs to a different training module.');
  return {
    scenario: { ...scenario, variations: [...scenario.variations] },
    steps: [], criticalErrors: [], hintsUsed: 0, completed: false, failed: false,
    physical: {
      identified: false, notified: false, breakerOff: false, lockApplied: false,
      tagApplied: false, startTried: false, testerProved: false, deadTested: false, testerReproved: false,
      secondaryOff: false, secondaryLocked: false, wrongBreakerOff: false,
    },
    lastEventAtMs: 0,
    feedback: 'Raise your hands. Check the work-order schematic and find SL-3.',
  };
}

export function currentStep(state: ProcedureState): TrainingStep | undefined {
  return nextProcedureStep(state, elecLotoModule);
}

/** Electrical state only: a lock prevents reconnection but does not itself remove voltage. */
export function getVoltage(state: ProcedureState): 0 | 230 {
  return state.physical.breakerOff
    && (!state.scenario.variations.includes('backfeed') || state.physical.secondaryOff) ? 0 : 230;
}

function timestamp(state: ProcedureState, atMs: number): number {
  return procedureTimestamp(state, atMs);
}

function record(state: ProcedureState, stepId: string, outcome: StepResult['outcome'], atMs: number, note: string): ProcedureState {
  return recordProcedureOutcome(state, stepId, outcome, atMs, note);
}

function critical(state: ProcedureState, message: string): ProcedureState {
  return { ...state, failed: true, criticalErrors: [...state.criticalErrors, message] };
}

function unsafe(state: ProcedureState, stepId: string, atMs: number, message: string): ProcedureState {
  return stopUnsafeProcedure(state, elecLotoModule, stepId, atMs, message);
}

function outOfOrder(state: ProcedureState, stepId: string, atMs: number, message: string): ProcedureState {
  const next = record(state, stepId, 'out-of-order', atMs, message);
  return elecLotoModule.steps.find((step) => step.id === stepId)?.critical ? critical(next, message) : next;
}

export function hint(state: ProcedureState, atMs = 0, source: 'requested' | 'automatic' = 'requested'): ProcedureState {
  const step = currentStep(state);
  if (!step) return state;
  return {
    ...state, hintsUsed: state.hintsUsed + (source === 'requested' ? 1 : 0), lastEventAtMs: timestamp(state, atMs),
    feedback: `Hint: ${step.label}.`,
  };
}

/** Immutable reducer. Scene interactions supply events; this module has no XR or browser dependency. */
export function perform(state: ProcedureState, event: ProcedureEvent, atMs = 0): ProcedureState {
  if (state.completed) return state;
  const time = timestamp(state, atMs);
  const type = typeof event === 'string' ? event : event.type;
  const expected = currentStep(state);
  if (!expected) return state;

  if (type === 'touch-terminals') {
    return state.physical.deadTested ? state
      : unsafe(state, 'touch-terminals', time, PROCEDURE_MESSAGES['touch-terminals']);
  }
  if (type === 'isolate-secondary' || type === 'lock-secondary') {
    if (!state.scenario.variations.includes('backfeed')) return state;
    const ready = state.physical.breakerOff && state.physical.lockApplied;
    if (!ready || (type === 'lock-secondary' && !state.physical.secondaryOff)) {
      return outOfOrder(state, 'switch-off', time, PROCEDURE_MESSAGES['secondary-before-primary']);
    }
    return {
      ...state, physical: { ...state.physical, [type === 'isolate-secondary' ? 'secondaryOff' : 'secondaryLocked']: true },
      lastEventAtMs: time,
      feedback: PROCEDURE_MESSAGES[type === 'isolate-secondary' ? 'secondary-isolated' : 'secondary-locked'],
    };
  }
  if (type === 'skip') {
    const requested = typeof event !== 'string' && event.type === 'skip' ? event.stepId : undefined;
    if (requested && requested !== expected.id) return outOfOrder(state, requested, time, PROCEDURE_MESSAGES['skip-wrong-step']);
    const next = record(state, expected.id, 'skipped', time, PROCEDURE_MESSAGES['step-skipped']);
    return expected.critical ? critical(next, PROCEDURE_MESSAGES['critical-skipped'].replace('{stepId}', expected.id)) : next;
  }
  if (type === 'safe-to-work' && (expected.id !== type || !state.physical.testerReproved || !state.physical.deadTested)) {
    return unsafe(state, type, time, PROCEDURE_MESSAGES['safe-too-soon']);
  }
  if (type === 'test-dead' && state.physical.wrongBreakerOff && !state.physical.breakerOff) {
    return unsafe(state, type, time, PROCEDURE_MESSAGES['wrong-breaker-dead-test']);
  }
  if (type === 'test-dead' && typeof event !== 'string' && event.type === 'test-dead'
    && event.circuitId !== undefined && event.circuitId !== WORK_ORDER_CIRCUIT) {
    return unsafe(state, type, time, PROCEDURE_MESSAGES['wrong-circuit-dead-test']);
  }
  if (type === 'switch-off' && typeof event !== 'string' && event.type === 'switch-off'
    && event.breakerId !== WORK_ORDER_CIRCUIT) {
    return outOfOrder({ ...state, physical: { ...state.physical, wrongBreakerOff: true } }, type, time,
      PROCEDURE_MESSAGES['wrong-breaker-switch']);
  }
  if (type === 'identify-circuit' && typeof event !== 'string' && event.type === 'identify-circuit'
    && event.breakerId !== WORK_ORDER_CIRCUIT) {
    return outOfOrder(state, type, time, PROCEDURE_MESSAGES['wrong-circuit-identify']);
  }
  if (type !== expected.id) return outOfOrder(state, type, time, PROCEDURE_MESSAGES['out-of-order'].replace('{step}', expected.label.toLowerCase()));
  if (type === 'identify-circuit' && state.scenario.variations.includes('mislabelled-breaker')
    && (typeof event === 'string' || event.type !== 'identify-circuit' || !event.schematicChecked)) {
    return outOfOrder(state, type, time, PROCEDURE_MESSAGES['mislabelled-breaker']);
  }

  // Skipping a noncritical step never grants its physical prerequisite.
  const prerequisiteMet: Record<StepId, boolean> = {
    'identify-circuit': true,
    'notify-control': state.physical.identified,
    'switch-off': state.physical.identified && state.physical.notified,
    'apply-lock': state.physical.breakerOff,
    'apply-tag': state.physical.lockApplied,
    'try-start': state.physical.breakerOff && state.physical.lockApplied && state.physical.tagApplied,
    'prove-tester': state.physical.lockApplied && state.physical.tagApplied && state.physical.startTried,
    'test-dead': state.physical.testerProved && state.physical.breakerOff && state.physical.lockApplied,
    're-prove-tester': state.physical.deadTested,
    'safe-to-work': state.physical.testerReproved && state.physical.deadTested,
  };
  const stepId = type as StepId;
  if (!prerequisiteMet[stepId]) return outOfOrder(state, type, time, PROCEDURE_MESSAGES['missing-prerequisite']);
  if (type === 'test-dead') {
    if (getVoltage(state) !== 0 && state.scenario.variations.includes('backfeed')) {
      return { ...state, lastEventAtMs: time, feedback: PROCEDURE_MESSAGES['backfeed-live'] };
    }
    if (getVoltage(state) !== 0) return unsafe(state, type, time, PROCEDURE_MESSAGES['circuit-live']);
    if (state.scenario.variations.includes('backfeed') && !state.physical.secondaryLocked) {
      return outOfOrder(state, type, time, PROCEDURE_MESSAGES['secondary-unlocked']);
    }
  }
  const next = record(state, type, 'correct', time,
    type === 'notify-control' ? 'Simulated CivicOps note: control notified; SL-3 isolation starting.'
      : type === 'test-dead' ? '0 V: SL-3 successfully tested dead.'
        : type === 'try-start' ? PROCEDURE_MESSAGES['try-start-held'] : `${expected.label}: complete.`);
  return {
    ...next,
    physical: type === 'safe-to-work' ? state.physical : { ...state.physical, [physicalField[stepId as Exclude<StepId, 'safe-to-work'>]]: true },
    completed: type === 'safe-to-work',
  };
}

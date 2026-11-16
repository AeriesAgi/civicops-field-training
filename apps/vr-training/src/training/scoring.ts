import {roadsAssessmentModule} from './modules/roads-zone';
import type { AccessibilityProfile, TrainingAttempt, TrainingModule } from './contracts';
import { defaultCrewForModule, trainingModuleById } from './modules/module-registry';
import type { ProcedureOutcomeState } from './procedure-engine';

export const defaultAccessibility: AccessibilityProfile = {
  oneHanded: false, gazePinch: false, highContrast: false, captions: true, seated: true, benchHeightOffset: 0,
};

export interface AttemptOptions {
  startedAt: string;
  completedAt: string;
  attemptId?: string;
  accessibility?: AccessibilityProfile;
  device?: TrainingAttempt['device'];
  traineeId?: string;
  crewId?: string;
  inputMode?: TrainingAttempt['inputMode'];
  instructorMode?: TrainingAttempt['instructor']['mode'];
}

export function score(state: ProcedureOutcomeState): number {
  const orderErrors = state.steps.filter((step) => step.outcome === 'out-of-order').length;
  return Math.max(0, Math.min(100, 100 - orderErrors * 10 - state.hintsUsed * 5));
}

function moduleForState(state: ProcedureOutcomeState): TrainingModule {
  const module = trainingModuleById(state.scenario.moduleId);
  if (!module) throw new Error('A registered training module is required for scoring.');
  return module;
}

export function passed(state: ProcedureOutcomeState, module: TrainingModule = moduleForState(state)): boolean {
  module=roadsAssessmentModule(state.scenario,module);
  if (module.id !== state.scenario.moduleId) throw new Error('Scenario belongs to a different training module.');
  return state.completed && !state.failed && state.criticalErrors.length === 0
    && !state.steps.some((step) => step.outcome === 'unsafe'
      || (step.outcome !== 'correct' && module.steps.some((definition) => definition.id === step.stepId && definition.critical)))
    && module.steps.every((definition) => state.steps.some((step) => step.stepId === definition.id && step.outcome === 'correct'))
    && score(state) >= module.passMark;
}

const trim = (value: string, length: number): string => value.slice(0, length);

/** Emit the canonical v1 contract. Reject invalid identifiers rather than silently changing idempotency keys. */
export function buildAttempt(state: ProcedureOutcomeState, options: AttemptOptions, module: TrainingModule = moduleForState(state)): TrainingAttempt {
  if (!state.completed) throw new Error('Complete or stop the attempt before exporting results.');
  module=roadsAssessmentModule(state.scenario,module);
  if (module.id !== state.scenario.moduleId) throw new Error('Scenario belongs to a different training module.');
  const startTime = Date.parse(options.startedAt);
  const endTime = Date.parse(options.completedAt);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    throw new Error('Attempt timestamps must be valid dates in chronological order.');
  }
  const attemptId = options.attemptId ?? globalThis.crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
    throw new Error('attemptId must be a UUID.');
  }
  const crewId = options.crewId ?? defaultCrewForModule(module);
  if (!/^[a-z]+-[0-9]{2}$/.test(crewId)) throw new Error('crewId must use the department-01 format.');
  const accessibility = options.accessibility ?? defaultAccessibility;
  if (!Number.isFinite(accessibility.benchHeightOffset)) throw new Error('Bench height must be finite.');
  // Preserve safety evidence when repeated taps produce more than the schema permits.
  const safetyResults = state.steps.filter((step) => step.outcome === 'unsafe');
  const otherResults = state.steps.filter((step) => step.outcome !== 'unsafe');
  const retained = state.steps.length <= 64 ? state.steps : [...otherResults.slice(-(64 - safetyResults.length)), ...safetyResults].slice(-64);
  return {
    schema: 'civicops.training.attempt.v1', attemptId,
    moduleId: module.id, moduleVersion: module.version,
    scenarioId: trim(state.scenario.id, 80), traineeId: trim(options.traineeId ?? 'demo-trainee', 80), crewId,
    startedAt: new Date(startTime).toISOString(), completedAt: new Date(endTime).toISOString(),
    durationMs: Math.min(3_600_000, Math.round(endTime - startTime)),
    steps: retained.map((step) => ({ ...step, stepId: trim(step.stepId, 60), ...(step.note ? { note: trim(step.note, 200) } : {}) })),
    criticalErrors: state.criticalErrors.slice(0, 32).map((message) => trim(message, 120)),
    score: score(state), passed: passed(state, module), inputMode: options.inputMode ?? (accessibility.gazePinch ? 'gaze-hands' : 'hands'),
    accessibility: { ...accessibility, benchHeightOffset: Math.max(-0.4, Math.min(0.4, accessibility.benchHeightOffset)) },
    device: { ...(options.device ?? { runtime: 'emulated', deviceName: 'IWSDK browser emulator' }), deviceName: trim(options.device?.deviceName ?? 'IWSDK browser emulator', 60) },
    instructor: { mode: options.instructorMode ?? 'scripted', hintsRequested: state.hintsUsed },
  };
}

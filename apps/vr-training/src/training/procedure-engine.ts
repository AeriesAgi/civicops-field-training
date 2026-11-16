import type { StepResult, TrainingModule, TrainingScenario, TrainingStep } from './contracts';

/** Shared outcome contract. Department reducers own physical state, never scoring or certificates. */
export interface ProcedureOutcomeState {
  scenario: TrainingScenario;
  steps: StepResult[];
  criticalErrors: string[];
  hintsUsed: number;
  completed: boolean;
  failed: boolean;
  lastEventAtMs: number;
  feedback: string;
}

export function nextProcedureStep(state: ProcedureOutcomeState, module: TrainingModule): TrainingStep | undefined {
  if (state.completed) return undefined;
  return module.steps.find((step) => !state.steps.some((result) => result.stepId === step.id
    && (result.outcome === 'correct' || result.outcome === 'skipped')));
}

export function procedureTimestamp(state: ProcedureOutcomeState, atMs: number): number {
  return Math.max(state.lastEventAtMs, Number.isFinite(atMs) ? Math.max(0, Math.round(atMs)) : 0);
}

export function recordProcedureOutcome<T extends ProcedureOutcomeState>(
  state: T, stepId: string, outcome: StepResult['outcome'], atMs: number, note: string,
): T {
  return {
    ...state,
    steps: [...state.steps, { stepId, outcome, atMs, hintsUsed: state.hintsUsed, note }],
    lastEventAtMs: atMs,
    feedback: note,
  };
}

export function stopUnsafeProcedure<T extends ProcedureOutcomeState>(
  state: T, module: TrainingModule, stepId: string, atMs: number, message: string,
): T {
  const next = recordProcedureOutcome(state, stepId, 'unsafe', atMs, message);
  const unfinished = module.steps.filter((step) => !next.steps.some((result) => result.stepId === step.id
    && (result.outcome === 'correct' || result.outcome === 'unsafe' || result.outcome === 'skipped')));
  return {
    ...next, completed: true, failed: true,
    criticalErrors: [...next.criticalErrors, message],
    steps: [...next.steps, ...unfinished.map((step): StepResult => ({
      stepId: step.id, outcome: 'skipped', atMs, hintsUsed: state.hintsUsed,
      note: 'Attempt stopped after an unsafe action.',
    }))],
  };
}

import type { StepResult, TrainingAttempt, TrainingModule } from './contracts';
import { stopUnsafeProcedure, type ProcedureOutcomeState } from './procedure-engine';
import { buildAttempt, type AttemptOptions } from './scoring';
import { trainingModuleById } from './modules/module-registry';
import { TRAINING_PROGRAMMES } from './programmes';

export interface PreparationState {
  moduleId: string;
  index: number;
  phase: 'checking' | 'ready' | 'stopped';
  steps: StepResult[];
  feedback: string;
}
export function startPreparation(moduleId: string): PreparationState {
  if (!TRAINING_PROGRAMMES[moduleId]) throw new Error('A registered programme is required.');
  return { moduleId, index: 0, phase: 'checking', steps: [], feedback: 'Read the job brief. Check each answer before entering the site.' };
}
export function answerPreparation(state: PreparationState, choice: number): PreparationState {
  if (state.phase !== 'checking' || choice !== 0 && choice !== 1) return state;
  const programme = TRAINING_PROGRAMMES[state.moduleId];
  const check = programme.checks[state.index];
  const correct = check.correct === choice;
  const outcome = correct ? 'correct' : check.critical ? 'unsafe' : 'out-of-order';
  const steps = [...state.steps, { stepId: `pre-${check.id}`, outcome, atMs: 0, hintsUsed: 0, note: correct ? `Pre-shift ${check.phase} confirmed.` : check.remediation } satisfies StepResult];
  return { ...state, steps, index: state.index + (correct ? 1 : 0),
    phase: !correct && check.critical ? 'stopped' : correct && state.index + 1 === programme.checks.length ? 'ready' : 'checking',
    feedback: correct ? 'Check recorded. Keep checking conditions as the job changes.' : check.remediation };
}
/** Module launch is the only writer. No URL flag or caller can manufacture ready evidence. */
let active: PreparationState | undefined;
export function activatePreparation(state: PreparationState | undefined): void {
  if (state && (state.phase !== 'ready' || state.steps.some(step => step.outcome === 'unsafe')
    || !TRAINING_PROGRAMMES[state.moduleId]?.checks.every(check => state.steps.some(step => step.stepId === `pre-${check.id}` && step.outcome === 'correct')))) {
    throw new Error('Every briefing, hazard and PPE check must pass before entering the site.');
  }
  active = state ? { ...state, steps: state.steps.map(step => ({ ...step })) } : undefined;
}
/** Called on runtime attempt creation, never during rendering; reducers remain browser free. */
export function prepareProcedure<T extends ProcedureOutcomeState>(state: T): T {
  if (!active || active.moduleId !== state.scenario.moduleId) return state;
  return { ...state, steps: [...active.steps.map(step => ({ ...step })), ...state.steps] };
}
export type CompetencyOutcome = 'pass' | 'conditional' | 'fail' | 'refresher-due';
export function competencyAssessment(attempt: TrainingAttempt, module: TrainingModule, expiresAt?: string, now = new Date()): {
  outcome: CompetencyOutcome; safety: string; accuracy: string; pace: string; remediation: string;
} {
  const programme = TRAINING_PROGRAMMES[module.id];
  const unsafe = attempt.criticalErrors.length > 0 || attempt.steps.some(step => step.outcome === 'unsafe'
    || step.outcome !== 'correct' && module.steps.some(definition => definition.critical && definition.id === step.stepId));
  const critical = module.steps.filter(step => step.critical);
  const safetyCount = critical.filter(step => attempt.steps.some(result => result.stepId === step.id && result.outcome === 'correct')).length;
  const complete = module.steps.every(step => attempt.steps.some(result => result.stepId === step.id && result.outcome === 'correct'));
  const errors = attempt.steps.filter(step => step.outcome === 'out-of-order' || step.outcome === 'skipped').length;
  const expired = expiresAt !== undefined && (!Number.isFinite(Date.parse(expiresAt)) || !Number.isFinite(now.getTime()) || Date.parse(expiresAt) <= now.getTime());
  const outcome: CompetencyOutcome = unsafe || safetyCount < critical.length || !complete ? 'fail'
    : !attempt.passed ? 'conditional' : expired ? 'refresher-due' : 'pass';
  const mistake = attempt.steps.find(step => step.outcome === 'unsafe' || step.outcome === 'out-of-order');
  return { outcome, safety: unsafe ? 'Safety stop: review with supervisor' : `Safety gates: ${safetyCount}/${critical.length}`,
    accuracy: `Procedure: ${errors} correction${errors === 1 ? '' : 's'}`,
    pace: attempt.steps.some(step => step.note?.includes('Pace target exceeded')) ? 'Pace: review triage target with supervisor' : attempt.durationMs > (programme?.minutes ?? 10) * 60_000 ? 'Pace: extra practice suggested' : 'Pace: within practice timebox',
    remediation: mistake?.note ?? (outcome === 'refresher-due' ? 'Repeat the assigned refresher; past practice has expired.' : outcome === 'conditional' ? 'Repeat independently before earning a practice pass.' : 'Debrief: explain your isolation, boundaries and handover to your supervisor.') };
}

/** Preserve an unsafe pre-shift decision as one failed canonical practice attempt. */
export function buildPreparationFailure(state: PreparationState, options: AttemptOptions): TrainingAttempt {
  const last = state.steps[state.steps.length - 1];
  const module = trainingModuleById(state.moduleId);
  if (state.phase !== 'stopped' || last?.outcome !== 'unsafe' || !module) throw new Error('A stopped preparation is required.');
  const procedure: ProcedureOutcomeState = {
    scenario: { id: `${module.id}-pre-shift`, moduleId: module.id, seed: 0, title: 'Pre-shift site assessment', variations: [] },
    steps: state.steps.slice(0, -1), criticalErrors: [], hintsUsed: 0, completed: false, failed: false, lastEventAtMs: 0, feedback: state.feedback,
  };
  return buildAttempt(stopUnsafeProcedure(procedure, module, last.stepId, 0, state.feedback), options, module);
}

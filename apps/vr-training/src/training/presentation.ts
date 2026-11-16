import type { TrainingAttempt, TrainingModule } from './contracts.js';
import { trainingModuleById } from './modules/module-registry';
import { nextProcedureStep, type ProcedureOutcomeState } from './procedure-engine';

/** Scene actions are gated independently from safety checks in the reducer. */
export function contextAction(step: string | undefined, complete: boolean): string | undefined {
  if (complete) return undefined;
  return step === 'notify-control' || step === 'safe-to-work' ? step : undefined;
}

export function resultStats(attempt: TrainingAttempt, module: TrainingModule | undefined = trainingModuleById(attempt.moduleId)): { time: string; errors: number; critical: number } {
  const seconds = Math.max(0, Math.round(attempt.durationMs / 1000));
  const criticalIds = module?.steps.filter((step) => step.critical).map((step) => step.id) ?? [];
  return {
    time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    errors: attempt.steps.filter(step => step.outcome !== 'correct' && step.outcome !== 'skipped').length,
    critical: criticalIds.filter(id => attempt.steps.some(step => step.stepId === id && step.outcome === 'correct')).length,
  };
}

export function checklist(state: ProcedureOutcomeState, stepId: string, order: number, module: TrainingModule | undefined = trainingModuleById(state.scenario.moduleId)): string {
  if (state.steps.some(step => step.stepId === stepId && step.outcome === 'correct')) return `[x] ${order}`;
  return `${module && nextProcedureStep(state, module)?.id === stepId ? '>' : 'o'} ${order}`;
}

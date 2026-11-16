import type { TrainingAttempt } from '../training/contracts.js';
import { elecLotoModule } from '../training/modules/elec-loto.js';
import { currentStep, type ProcedureState } from '../training/procedure.js';
import { INSTRUCTOR_SCRIPT } from '../training/instructor-script.js';
import { score } from '../training/scoring.js';
import { resultStats } from '../training/presentation.js';
import type { GuidanceMode } from '../training/guidance.js';
import { contextAction } from '../training/presentation.js';

export type StepStatus = 'done' | 'current' | 'todo' | 'missed';
export interface LessonStepView { id: string; order: number; label: string; status: StepStatus; critical: boolean }
export interface LessonView {
  moduleId: string;
  title: string;
  steps: LessonStepView[];
  current?: { id: string; order: number; label: string; instruction: string };
  caption: string;
  score: number;
  hints: number;
  errors: number;
  completed: boolean;
  failed: boolean;
  held?: string;
  action?: 'notify-control' | 'safe-to-work';
  reading?: string;
}

/** Desktop HUD model for the Electrical lesson. Unguided assessment never names the next action. */
export function lessonView(state: ProcedureState, options: { caption: string; guidance: GuidanceMode; held?: string; reading?: string }): LessonView {
  const step = currentStep(state);
  const steps = elecLotoModule.steps.map((definition): LessonStepView => {
    const results = state.steps.filter(result => result.stepId === definition.id);
    const done = results.some(result => result.outcome === 'correct');
    const missed = !done && results.some(result => result.outcome !== 'correct');
    return {
      id: definition.id, order: definition.order, critical: definition.critical,
      label: options.guidance === 'unguided' && !done ? `Step ${definition.order}` : definition.label,
      status: done ? 'done' : definition.id === step?.id ? 'current' : missed ? 'missed' : 'todo',
    };
  });
  const guided = options.guidance === 'guided';
  return {
    moduleId: elecLotoModule.id,
    title: 'Streetlight fault · isolate SL-3',
    steps,
    current: step ? {
      id: step.id, order: step.order,
      label: guided ? step.label : `Step ${step.order} of ${elecLotoModule.steps.length}`,
      instruction: guided ? INSTRUCTOR_SCRIPT.steps[step.id as keyof typeof INSTRUCTOR_SCRIPT.steps]?.instruction.text ?? '' : '',
    } : undefined,
    caption: options.caption,
    score: score(state),
    hints: state.hintsUsed,
    errors: state.steps.filter(result => result.outcome !== 'correct' && result.outcome !== 'skipped').length,
    completed: state.completed,
    failed: state.failed,
    held: options.held,
    action: contextAction(step?.id, state.completed) as LessonView['action'],
    reading: options.reading,
  };
}

export interface ResultView {
  passed: boolean;
  score: number;
  time: string;
  errors: number;
  critical: string;
  headline: string;
  steps: { order: number; label: string; ok: boolean }[];
}

export function resultView(attempt: TrainingAttempt): ResultView {
  const stats = resultStats(attempt, elecLotoModule);
  const criticalTotal = elecLotoModule.steps.filter(step => step.critical).length;
  return {
    passed: attempt.passed, score: attempt.score, time: stats.time, errors: stats.errors,
    critical: `${stats.critical} / ${criticalTotal}`,
    headline: attempt.passed ? 'Isolation complete. Safe to work.' : attempt.criticalErrors.length > 0 ? 'Stopped for safety. Review and try again.' : 'Below the pass mark. Try again.',
    steps: elecLotoModule.steps.map(step => ({
      order: step.order, label: step.label,
      ok: attempt.steps.some(result => result.stepId === step.id && result.outcome === 'correct'),
    })),
  };
}

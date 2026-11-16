import {practiceRole} from './certification-display.js';
import { competencyAssessment } from './programme-state.js';
import type { Certification, TrainingAttempt, TrainingModule } from './contracts.js';
import type { ComeBackSummary } from './daily-drill.js';
import { resultStats } from './presentation.js';

export interface ModuleResultInput {
  attempt: TrainingAttempt;
  module: TrainingModule;
  certification: Certification;
  comeback: ComeBackSummary;
  daily: { status: 'ready' | 'completed'; variation: string };
  departmentLabel: string;
  completeEyebrow: string;
  feedback: string;
  /** Caption preference: essential evidence remains in the step/error counts. Defaults to true. */
  showSafetyFeedback?: boolean;
  /** Show a failed practice score only when no unsafe outcome or critical error was recorded. */
  showScoreOnNoncriticalFailure?: boolean;
}

export interface ResultElementProperties {
  text?: string;
  display?: 'flex' | 'none';
  backgroundColor?: string;
  height?: number;
  width?: number;
}

/** The common result asset, addressed only through its public UIKitML methods. */
export interface ResultsPanelTarget {
  getElementById(id: string): { setProperties(properties: ResultElementProperties): void } | null | undefined;
}

export interface ModuleResultModel {
  stepWidth:number;
  text: Readonly<Record<string, string>>;
  visible: Readonly<Record<string, boolean>>;
  body: { backgroundColor: string; height: number };
}

const LADDER = ['bronze', 'silver', 'gold'] as const;
const COUNT_WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
const DAILY_LABELS: Readonly<Record<string, string>> = {
  standard: 'STANDARD ROUTE',
  'seized-valve': 'SEIZED VALVE',
  'mislabelled-breaker': 'MISLABELLED BREAKER',
  'hidden-bend': 'HIDDEN BEND',
  'deteriorating-casualty': 'DETERIORATING CASUALTY',
};

function ladderName(_moduleId:string,level:string):string{return practiceRole(level as Certification['level']);}

/** Pure presentation shared by departments; evidence and certification remain caller-owned. */
export function buildModuleResultModel(input: ModuleResultInput): ModuleResultModel {
  const { attempt, module, certification, comeback, daily } = input;
  if (attempt.moduleId !== module.id || certification.moduleId !== module.id) {
    throw new Error('Results require evidence and certification from the selected module.');
  }
  const stats = resultStats(attempt, module);
  const prepared = attempt.steps.some(step => step.stepId === 'pre-briefing');
  const competency = competencyAssessment(attempt, module, certification.expiresAt);
  const criticalCount = module.steps.filter(definition => definition.critical).length;
  const checks = COUNT_WORDS[module.steps.length] ?? `${module.steps.length}`;
  const unsafe = attempt.criticalErrors.length > 0 || attempt.steps.some(step => step.outcome === 'unsafe');
  const conditional = prepared && competency.outcome === 'conditional';
  const practiceScore = conditional || !attempt.passed && input.showScoreOnNoncriticalFailure === true && !unsafe;
  const text: Record<string, string> = {
    'result-title': conditional ? 'CONDITIONAL' : attempt.passed ? 'PASS' : practiceScore ? 'FAIL' : 'STOPPED',
    'competency-summary': `${competency.safety} / ${competency.accuracy}`,
    'debrief-feedback': competency.remediation,
    'pace-feedback': competency.pace,
    'result-eyebrow': conditional ? 'CIVICOPS / SUPERVISED REFRESHER' : attempt.passed ? input.completeEyebrow : practiceScore ? 'CIVICOPS / PRACTICE PAUSED' : 'CIVICOPS / SAFETY ACTION REQUIRED',
    score: `${attempt.score}`,
    'result-time': `${stats.time} TAKEN / ${practiceScore ? 'NOT PASSED / SCORE OUT OF 100' : 'SAFETY SCORE OUT OF 100'}`,
    'result-hints': `${attempt.instructor.hintsRequested}`,
    'result-errors': `${stats.errors}`,
    'result-critical': `${stats.critical} / ${criticalCount}`,
    'result-checks-title': `YOUR ${checks} SAFETY CHECK${module.steps.length === 1 ? '' : 'S'}`,
    'result-safety-note': input.feedback,
    certification: `${input.departmentLabel} / ${ladderName(module.id, certification.level)} / ${certification.passes} PASS${certification.passes === 1 ? '' : 'ES'}`,
    'cert-next-goal': certification.level==='gold'?'Supervisor practice level. Keep refresher evidence current.':certification.level==='silver'?'Next: Supervisor / five 90+ passes across three days.':certification.level==='bronze'?`Next: Operator / ${certification.passes} of 3 passes at 80+.`:'Trainee -> Assistant / complete one safe passing attempt.',
    'return-streak': `STREAK / ${comeback.streakDays} DAY${comeback.streakDays === 1 ? '' : 'S'}`,
    'refresher-due': `REFRESHER / ${comeback.nextRefresherAt?.slice(0, 10) ?? 'After your first pass'}`,
    'daily-status': `TODAY / ${daily.status.toUpperCase()} / ${DAILY_LABELS[daily.variation] ?? daily.variation.replace(/-/g, ' ').toUpperCase()}`,
    'sync-status': 'Saved on this device.',
  };
  if (conditional) text['cert-next-goal'] = 'Repeat with supervision; no practice pass awarded.';
  const visible: Record<string, boolean> = { 'programme-debrief': prepared, score: attempt.passed || practiceScore, 'result-safety-note': !attempt.passed && (input.showSafetyFeedback ?? true) };
  for (let order = 1; order <= 13; order++) {
    const definition = module.steps.find(step => step.order === order);
    visible[`result-step-${order}`] = definition !== undefined;
    text[`result-step-${order}`] = `${definition && attempt.steps.some(result => result.stepId === definition.id && result.outcome === 'correct') ? '[x]' : '!'} ${order}`;
  }
  for (let index = 0; index < LADDER.length; index++) {
    text[`cert-${LADDER[index]}`] = `${index <= LADDER.findIndex(level => level === certification.level) ? '[x]' : 'o'} ${ladderName(module.id, LADDER[index])}`;
  }
  return { stepWidth:module.steps.length>10?3.9:module.steps.length>9?5.4:6.1,text, visible, body: { backgroundColor: conditional ? '#5b440f' : attempt.passed ? '#114d38' : '#65252a', height: (visible['result-safety-note'] ? 72 : 63) + (prepared ? 13 : 0) } };
}

/** Called once at completion, never from a frame loop. */
export function presentModuleResults(panel: ResultsPanelTarget, input: ModuleResultInput): void {
  const model = buildModuleResultModel(input);
  for (const [id, text] of Object.entries(model.text)) panel.getElementById(id)?.setProperties({ text });
  for (const [id, visible] of Object.entries(model.visible)) panel.getElementById(id)?.setProperties({ display: visible ? 'flex' : 'none' });
  for(let order=1;order<=13;order++)panel.getElementById(`result-step-${order}`)?.setProperties({width:model.stepWidth});
  panel.getElementById('result-body')?.setProperties(model.body);
}

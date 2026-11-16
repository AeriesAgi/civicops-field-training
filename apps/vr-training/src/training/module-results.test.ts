import {roadsRainModule} from './modules/roads-zone';
import { describe, expect, it } from 'vitest';
import type { Certification, TrainingAttempt, TrainingModule } from './contracts.js';
import { defaultAccessibility } from './scoring.js';
import { waterBurstModule } from './modules/water-burst.js';
import { elecLotoModule } from './modules/elec-loto.js';
import { buildModuleResultModel, presentModuleResults, type ModuleResultInput, type ResultElementProperties } from './module-results.js';

function input(module: TrainingModule = waterBurstModule): ModuleResultInput {
  const attempt: TrainingAttempt = {
    schema: 'civicops.training.attempt.v1', attemptId: '00000000-0000-4000-8000-000000000000',
    moduleId: module.id, moduleVersion: module.version, scenarioId: `${module.id}-standard`,
    traineeId: 'demo-trainee', crewId: 'water-01', startedAt: '2026-10-09T10:00:00.000Z',
    completedAt: '2026-10-09T10:01:05.000Z', durationMs: 65_000,
    steps: module.steps.map(step => ({ stepId: step.id, outcome: 'correct', atMs: step.order * 1_000, hintsUsed: 0 })),
    criticalErrors: [], score: 100, passed: true, inputMode: 'hands', accessibility: { ...defaultAccessibility },
    device: { runtime: 'emulated', deviceName: 'IWSDK browser emulator' }, instructor: { mode: 'scripted', hintsRequested: 0 },
  };
  const certification: Certification = {
    certificationId: module.certificationId, moduleId: module.id, traineeId: attempt.traineeId,
    crewId: attempt.crewId, level: 'bronze', passes: 1, bestScore: 100,
    streakDays: 1, evidenceAttemptIds: [attempt.attemptId],
  };
  return {
    module, attempt, certification, comeback: { streakDays: 1, nextRefresherAt: '2026-10-16T10:01:05.000Z' },
    daily: { status: 'ready', variation: 'standard' }, departmentLabel: 'WATER',
    completeEyebrow: 'CIVICOPS / WATER ISOLATION COMPLETE', feedback: 'Isolation checks completed.',
  };
}

describe('shared department results', () => {
  it('reports Water evidence with all seven checks and correct singular return copy', () => {
    const model = buildModuleResultModel(input());
    expect(model.text['result-critical']).toBe('4 / 4');
    expect(model.text['result-checks-title']).toBe('YOUR SEVEN SAFETY CHECKS');
    expect(model.text['result-time']).toBe('1:05 TAKEN / SAFETY SCORE OUT OF 100');
    expect(model.text.certification).toBe('WATER / ASSISTANT / 1 PASS');
    expect(model.text['return-streak']).toBe('STREAK / 1 DAY');
    expect(model.text['refresher-due']).toBe('REFRESHER / 2026-10-16');
    expect(model.visible['result-step-7']).toBe(true);
    expect(model.visible['result-step-8']).toBe(false);
    expect(model.visible['result-safety-note']).toBe(false);
  });

  it('shows the actual stopped safety evidence without a misleading passing score', () => {
    const value = input();
    value.attempt.passed = false;
    value.attempt.steps = [
      { stepId: 'make-area-safe', outcome: 'correct', atMs: 1_000, hintsUsed: 0 },
      { stepId: 'close-valves', outcome: 'unsafe', atMs: 2_000, hintsUsed: 1 },
      { stepId: 'identify-valves', outcome: 'skipped', atMs: 2_000, hintsUsed: 0 },
    ];
    value.feedback = 'Close valves slowly before draining.';
    value.attempt.instructor.hintsRequested = 1;
    const model = buildModuleResultModel(value);
    expect(model.text['result-title']).toBe('STOPPED');
    expect(model.text['result-eyebrow']).toBe('CIVICOPS / SAFETY ACTION REQUIRED');
    expect(model.text['result-critical']).toBe('1 / 4');
    expect(model.text['result-errors']).toBe('1');
    expect(model.text['result-hints']).toBe('1');
    expect(model.text['result-step-4']).toBe('! 4');
    expect(model.visible.score).toBe(false);
    expect(model.visible['result-safety-note']).toBe(true);
    expect(model.text['result-safety-note']).toBe(value.feedback);
    expect(model.body).toEqual({ backgroundColor: '#65252a', height: 72 });
  });

  it('restores check visibility when the common panel changes department or retries', () => {
    const properties = new Map<string, ResultElementProperties>();
    const panel = { getElementById: (id: string) => ({ setProperties: (changes: ResultElementProperties) => properties.set(id, { ...properties.get(id), ...changes }) }) };
    const failed = input();
    failed.attempt.passed = false;
    presentModuleResults(panel, failed);
    expect(properties.get('result-step-8')?.display).toBe('none');
    expect(properties.get('score')?.display).toBe('none');
    const electrical = input(elecLotoModule);
    electrical.departmentLabel = 'ELECTRICAL';
    presentModuleResults(panel, electrical);
    expect(properties.get('result-step-8')?.display).toBe('flex');
    expect(properties.get('result-step-9')?.display).toBe('flex');
    expect(properties.get('score')?.display).toBe('flex');
    expect(properties.get('result-safety-note')?.display).toBe('none');
    expect(properties.get('result-checks-title')?.text).toBe('YOUR TEN SAFETY CHECKS');
    expect(properties.get('result-body')).toEqual({ backgroundColor: '#114d38', height: 63 });
  });

  it('shows all thirteen rain checks within the common row and restores widths for another lesson',()=>{
    const model=buildModuleResultModel(input(roadsRainModule));
    expect(model.text['result-checks-title']).toBe('YOUR 13 SAFETY CHECKS');
    for(let i=1;i<=13;i++)expect(model.visible[`result-step-${i}`]).toBe(true);
    expect(model.stepWidth*13+.5*12).toBeLessThan(59.6);
    expect(buildModuleResultModel(input(elecLotoModule)).stepWidth).toBe(5.4);
  });

  it('keeps certification and streak plural copy and the same ladder goals across departments', () => {
    const value = input();
    value.certification.passes = 3;
    value.certification.level = 'silver';
    value.comeback.streakDays = 0;
    const model = buildModuleResultModel(value);
    expect(model.text.certification).toBe('WATER / OPERATOR / 3 PASSES');
    expect(model.text['return-streak']).toBe('STREAK / 0 DAYS');
    expect(model.text['cert-bronze']).toBe('[x] ASSISTANT');
    expect(model.text['cert-silver']).toBe('[x] OPERATOR');
    expect(model.text['cert-gold']).toBe('o SUPERVISOR');
    expect(model.text['cert-next-goal']).toBe('Next: Supervisor / five 90+ passes across three days.');
  });

  it('displays the selected daily scenario, including new department variations', () => {
    const value = input();
    value.daily = { status: 'completed', variation: 'hidden-bend' };
    expect(buildModuleResultModel(value).text['daily-status']).toBe('TODAY / COMPLETED / HIDDEN BEND');
    value.daily = { status: 'ready', variation: 'seized-valve' };
    expect(buildModuleResultModel(value).text['daily-status']).toBe('TODAY / READY / SEIZED VALVE');
  });

  it('preserves the Electrical captions preference without hiding safety counts or expanding an empty card', () => {
    const value = input(elecLotoModule);
    value.attempt.passed = false;
    value.attempt.criticalErrors = ['Tester verification was skipped.'];
    value.attempt.steps[5].outcome = 'unsafe';
    value.showSafetyFeedback = false;
    value.showScoreOnNoncriticalFailure = true;
    const model = buildModuleResultModel(value);
    expect(model.visible['result-safety-note']).toBe(false);
    expect(model.visible.score).toBe(false);
    expect(model.text['result-title']).toBe('STOPPED');
    expect(model.text['result-critical']).toBe('5 / 6');
    expect(model.text['result-errors']).toBe('1');
    expect(model.body).toEqual({ backgroundColor: '#65252a', height: 63 });
    value.showSafetyFeedback = true;
    expect(buildModuleResultModel(value).body.height).toBe(72);
  });

  it('keeps a visible below-pass practice score with an explicit failed label and no certificate claim', () => {
    const value = input(elecLotoModule);
    value.departmentLabel = 'ELECTRICAL';
    value.attempt.passed = false;
    value.attempt.score = 60;
    value.attempt.instructor.hintsRequested = 8;
    value.certification.level = 'none';
    value.certification.passes = 0;
    value.daily = { status: 'ready', variation: 'mislabelled-breaker' };
    value.showSafetyFeedback = false;
    value.showScoreOnNoncriticalFailure = true;
    const model = buildModuleResultModel(value);
    expect(model.visible.score).toBe(true);
    expect(model.text.score).toBe('60');
    expect(model.text['result-title']).toBe('FAIL');
    expect(model.text['result-time']).toBe('1:05 TAKEN / NOT PASSED / SCORE OUT OF 100');
    expect(model.text['result-hints']).toBe('8');
    expect(model.text['result-critical']).toBe('6 / 6');
    expect(model.text.certification).toBe('ELECTRICAL / TRAINEE / 0 PASSES');
    expect(model.text['daily-status']).toBe('TODAY / READY / MISLABELLED BREAKER');
    expect(model.visible['result-step-9']).toBe(true);
    expect(model.body).toEqual({ backgroundColor: '#65252a', height: 63 });
  });

  it('prevents the practice-score option revealing any unsafe outcome even without a critical-error string', () => {
    const value = input(elecLotoModule);
    value.attempt.passed = false;
    value.attempt.steps[5].outcome = 'unsafe';
    value.showScoreOnNoncriticalFailure = true;
    const model = buildModuleResultModel(value);
    expect(model.visible.score).toBe(false);
    expect(model.text['result-title']).toBe('STOPPED');
    expect(model.visible['result-safety-note']).toBe(true);
  });

  it('rejects evidence from another department before touching the result panel', () => {
    const value = input();
    value.attempt.moduleId = elecLotoModule.id;
    expect(() => buildModuleResultModel(value)).toThrow('selected module');
    value.attempt.moduleId = value.module.id;
    value.certification.moduleId = elecLotoModule.id;
    expect(() => buildModuleResultModel(value)).toThrow('selected module');
  });
  it('shows conditional preparation practice with a score and explicit no-pass remediation', () => {
    const value = input();
    value.attempt.steps.unshift({ stepId: 'pre-briefing', outcome: 'correct', atMs: 0, hintsUsed: 0 });
    value.attempt.passed = false; value.attempt.score = 70;
    const model = buildModuleResultModel(value);
    expect(model.text['result-title']).toBe('CONDITIONAL');
    expect(model.visible.score).toBe(true); expect(model.visible['programme-debrief']).toBe(true);
    expect(model.text['cert-next-goal']).toContain('no practice pass');
    expect(model.body.backgroundColor).toBe('#5b440f');
  });

  it('keeps a critical procedure error failed even after every correct outcome exists', () => {
    const value = input();
    value.attempt.steps.unshift({ stepId: 'pre-briefing', outcome: 'correct', atMs: 0, hintsUsed: 0 });
    value.attempt.steps.push({ stepId: 'close-valves', outcome: 'out-of-order', atMs: 100, hintsUsed: 0 });
    value.attempt.passed = false; value.attempt.score = 90;
    const model = buildModuleResultModel(value);
    expect(model.text['result-title']).toBe('STOPPED');
    expect(model.visible.score).toBe(false); expect(model.visible['programme-debrief']).toBe(true);
  });

});

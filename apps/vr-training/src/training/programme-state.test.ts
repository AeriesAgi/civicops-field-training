import { afterEach, describe, expect, it } from 'vitest';
import { TRAINING_PROGRAMMES } from './programmes';
import { activatePreparation, answerPreparation, buildPreparationFailure, competencyAssessment, prepareProcedure, startPreparation } from './programme-state';
import { start, perform } from './procedure';
import { createScenario, elecLotoModule } from './modules/elec-loto';
import { buildAttempt, passed, score } from './scoring';
import { trainingModuleById } from './modules/module-registry';
import { TrainingProgress, type StorageLike } from './progress';

afterEach(() => activatePreparation(undefined));
const options = { startedAt: '2026-10-19T08:00:00Z', completedAt: '2026-10-19T08:05:00Z' };
function electrical() {
  let state = prepareProcedure(start(createScenario()));
  for (const event of ['identify-circuit', 'notify-control', 'switch-off', 'apply-lock', 'apply-tag', 'try-start', 'prove-tester', 'test-dead', 're-prove-tester', 'safe-to-work'] as const) state = perform(state, event, state.lastEventAtMs + 1000);
  return state;
}
function memory(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } };
}
describe('municipal programme preparation and competency', () => {
  it.each(Object.values(TRAINING_PROGRAMMES))('$moduleId has a full, ordered briefing/hazard/PPE gate', programme => {
    const module = trainingModuleById(programme.moduleId)!;
    expect(programme.checks).toHaveLength(6);
    expect(programme.checks.map(check => check.phase)).toEqual(['briefing', 'hazards', 'hazards', 'hazards', 'ppe', 'ppe']);
    expect(new Set(programme.checks.map(check => check.id)).size).toBe(programme.checks.length);
    expect(programme.checks.some(check => check.critical)).toBe(true);
    let state = startPreparation(module.id);
    for (const check of programme.checks) {
      expect(() => activatePreparation(state)).toThrow();
      state = answerPreparation(state, check.correct);
    }
    expect(state.phase).toBe('ready');
    activatePreparation(state);
    const prepared = prepareProcedure({ ...start(createScenario()), scenario: { ...createScenario(), moduleId: module.id } });
    expect(prepared.steps).toHaveLength(6);
    expect(prepared.steps.every(step => step.outcome === 'correct')).toBe(true);
    expect(answerPreparation(state, 0)).toBe(state);
  });
  it('holds a wrong answer at its gate and carries remediation into the scored attempt', () => {
    let prep = startPreparation('elec-loto');
    prep = answerPreparation(prep, 1);
    expect(prep.index).toBe(0); expect(prep.feedback).toContain('supervisor');
    for (const check of TRAINING_PROGRAMMES['elec-loto'].checks) prep = answerPreparation(prep, check.correct);
    activatePreparation(prep);
    const state = electrical();
    expect(score(state)).toBe(90); expect(passed(state)).toBe(true);
    const attempt = buildAttempt(state, options);
    expect(attempt.steps[0]).toMatchObject({ stepId: 'pre-briefing', outcome: 'out-of-order' });
    const store = new TrainingProgress(memory());
    expect(store.record(attempt, elecLotoModule).level).toBe('bronze');
    expect(competencyAssessment(attempt, elecLotoModule).remediation).toContain('supervisor');
  });
  it.each(Object.values(TRAINING_PROGRAMMES))('$moduleId stops immediately for each unsafe site decision', programme => {
    for (let target = 0; target < programme.checks.length; target++) {
      if (!programme.checks[target].critical) continue;
      let state = startPreparation(programme.moduleId);
      for (let i = 0; i < target; i++) state = answerPreparation(state, programme.checks[i].correct);
      state = answerPreparation(state, 1 - programme.checks[target].correct);
      const attempt = buildPreparationFailure(state, options);
      expect(attempt.passed).toBe(false); expect(attempt.criticalErrors).toHaveLength(1);
      expect(attempt.steps.filter(step => step.outcome === 'unsafe')).toHaveLength(1);
      expect(new TrainingProgress(memory()).record(attempt, trainingModuleById(programme.moduleId)!).level).toBe('none');
      expect(state.phase).toBe('stopped'); expect(state.steps[state.steps.length - 1]?.outcome).toBe('unsafe');
      expect(() => activatePreparation(state)).toThrow();
      expect(answerPreparation(state, programme.checks[target].correct)).toBe(state);
    }
  });
  it('rejects forged ready state, invalid choices and unknown programmes', () => {
    const state = startPreparation('elec-loto');
    expect(() => activatePreparation({ ...state, phase: 'ready' })).toThrow();
    expect(() => buildPreparationFailure(state, options)).toThrow();
    for (const choice of [-1, 2, NaN, Infinity]) expect(answerPreparation(state, choice)).toBe(state);
    expect(() => startPreparation('unknown')).toThrow();
  });
  it('scopes preparation to its department and copies accepted evidence', () => {
    let state = startPreparation('water-burst');
    for (const check of TRAINING_PROGRAMMES[state.moduleId].checks) state = answerPreparation(state, check.correct);
    activatePreparation(state); state.steps.length = 0;
    expect(prepareProcedure(start(createScenario())).steps).toEqual([]);
    expect(prepareProcedure({ ...start(createScenario()), scenario: { ...createScenario(), moduleId: 'water-burst' } }).steps).toHaveLength(6);
  });
  it('places safety before accuracy and pace; conditional never awards a pass', () => {
    const attempt = buildAttempt(electrical(), options);
    const assessment = competencyAssessment({ ...attempt, durationMs: 3_600_000 }, elecLotoModule);
    expect(assessment.outcome).toBe('pass'); expect(assessment.pace).toContain('extra practice');
    expect(competencyAssessment({ ...attempt, criticalErrors: ['Unsafe touch'] }, elecLotoModule).outcome).toBe('fail');
    const conditional = { ...attempt, passed: false, score: 75 };
    expect(competencyAssessment(conditional, elecLotoModule).outcome).toBe('conditional');
    expect(new TrainingProgress(memory()).record(conditional, elecLotoModule).level).toBe('none');
    expect(competencyAssessment(attempt, elecLotoModule, '2026-10-19T09:00:00Z', new Date('2026-10-19T09:00:00Z')).outcome).toBe('refresher-due');
    expect(competencyAssessment(attempt, elecLotoModule, 'invalid').outcome).toBe('refresher-due');
  });
});

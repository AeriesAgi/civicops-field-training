import { activatePreparation, answerPreparation, prepareProcedure, startPreparation } from './programme-state';
import { TRAINING_PROGRAMMES } from './programmes';
import type { ProcedureOutcomeState } from './procedure-engine';
import { describe, expect, it } from 'vitest';
import { createScenario as createElectricalScenario, elecLotoModule } from './modules/elec-loto';
import { perform, start } from './procedure';
import { createWaterScenario, waterBurstModule } from './modules/water-burst';
import { performWater, startWater } from './water-procedure';
import { createGoodRoadsLayout, roadsRequirements } from './roads-geometry';
import { performRoads, startRoads } from './roads-procedure';
import { createRoadsScenario, roadsZoneModule } from './modules/roads-zone';
import { createFireScenario, sceneSafetyModule } from './modules/scene-safety';
import { goodFireEvents, performFire, startFire } from './scene-safety-procedure';
import { buildAttempt, passed, score } from './scoring';
import { TrainingProgress, type StorageLike } from './progress';
import type { TrainingAttempt, TrainingModule } from './contracts';
import { ASSIST_MODULES, answerStep, currentFieldStep, holdGate, resumeAfterRecheck, startCrewGuide } from './field-assist';
import { appendFieldStep, verifyFieldLog, type FieldStepLogEntry } from './field-step-log';
import type { AssistHazardCode, AssistStepLog } from './assist-contract';

const timestamps = { startedAt: '2026-10-11T10:00:00.000Z', completedAt: '2026-10-11T10:05:00.000Z', attemptId: 'e2e00001-0000-4000-8000-000000000001' };

function preShift<T extends ProcedureOutcomeState>(state: T): T {
  let preparation = startPreparation(state.scenario.moduleId);
  for (const check of TRAINING_PROGRAMMES[state.scenario.moduleId].checks) preparation = answerPreparation(preparation, check.correct);
  activatePreparation(preparation);
  const prepared = prepareProcedure(state);
  activatePreparation(undefined);
  expect(prepared.steps.filter(step => step.stepId.startsWith('pre-') && step.outcome === 'correct')).toHaveLength(6);
  return prepared;
}

function verifyCertification(attempt: TrainingAttempt, module: TrainingModule): void {
  expect(attempt.steps.filter(step => step.stepId.startsWith('pre-') && step.outcome === 'correct')).toHaveLength(6);
  const data = new Map<string, string>();
  const storage: StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  const progress = new TrainingProgress(storage);
  expect(progress.record(attempt, module)).toMatchObject({ moduleId: module.id, level: 'bronze', passes: 1, evidenceAttemptIds: [attempt.attemptId] });
  const restored = new TrainingProgress(storage);
  expect(restored.getAttempts()).toEqual([attempt]);
  expect(restored.certification(module, attempt.traineeId, attempt.crewId).level).toBe('bronze');
  for (const other of ASSIST_MODULES) if (other.id !== module.id) expect(restored.certification(other).passes).toBe(0);
}

describe('full module end-to-end playthroughs', () => {
  it.each([0, 1])('runs Electrical seed %i from circuit identification through prove-test-re-prove and scored evidence', (seed) => {
    let state = preShift(start(createElectricalScenario(seed)));
    for (const event of [
      { type: 'identify-circuit' as const, breakerId: 'sl-3', schematicChecked: true },
      'notify-control' as const, 'switch-off' as const, 'apply-lock' as const, 'apply-tag' as const, 'try-start' as const,
      'prove-tester' as const, 'test-dead' as const, 're-prove-tester' as const, 'safe-to-work' as const,
    ]) state = perform(state, event, state.lastEventAtMs + 1000);
    const attempt = buildAttempt(state, timestamps, elecLotoModule);
    expect(state.completed).toBe(true);
    expect(state.failed).toBe(false);
    expect(passed(state, elecLotoModule)).toBe(true);
    expect(score(state)).toBe(100);
    expect(attempt).toMatchObject({ moduleId: 'elec-loto', passed: true, score: 100 });
    verifyCertification(attempt, elecLotoModule);
  });

  it('runs Water from perimeter protection through controlled isolation and trench readiness', () => {
    let state = preShift(startWater(createWaterScenario()));
    const events = [
      'place-barriers', 'place-sign', 'set-spoil-back',
      { type: 'plan-isolation' as const, valves: ['A', 'B'] as const }, 'notify-control',
      { type: 'lift-cover' as const, valve: 'A' as const }, { type: 'seat-key' as const, valve: 'A' as const },
      { type: 'turn-valve' as const, valve: 'A' as const, deltaTurns: 3, elapsedMs: 5000 },
      { type: 'lift-cover' as const, valve: 'B' as const }, { type: 'seat-key' as const, valve: 'B' as const },
      { type: 'turn-valve' as const, valve: 'B' as const, deltaTurns: 3, elapsedMs: 5000 },
      'open-washout', 'confirm-isolation', 'check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding',
      'trench-safety', 'ready-for-repair',
    ] as const;
    for (const event of events) state = performWater(state, event, state.lastEventAtMs + 5000);
    const attempt = buildAttempt(state, timestamps, waterBurstModule);
    expect(state.completed).toBe(true);
    expect(state.failed).toBe(false);
    expect(passed(state, waterBurstModule)).toBe(true);
    expect(score(state)).toBe(100);
    expect(attempt).toMatchObject({ moduleId: 'water-burst', passed: true, score: 100 });
    verifyCertification(attempt, waterBurstModule);
  });

  it.each([0, 1, 2, 3])('runs Roads seed %i from full-scale placement through zone check and traffic', (seed) => {
    const scenario = createRoadsScenario(seed);
    let state = preShift(startRoads(scenario));
    const layout = createGoodRoadsLayout(scenario);
    const events = [
      ...(layout.vehicle ? [{ type: 'place' as const, kind: 'vehicle' as const, placement: layout.vehicle }] : []),
      { type: 'beacon' as const, on: layout.beaconOn },
      ...(layout.warning ? [{ type: 'place' as const, kind: 'warning' as const, placement: layout.warning }] : []),
      ...layout.cones.map(placement => ({ type: 'place' as const, kind: 'cone' as const, placement })),
      ...(layout.keepLeft ? [{ type: 'place' as const, kind: 'keep-left' as const, placement: layout.keepLeft }] : []),
      ...layout.barriers.map(placement => ({ type: 'place' as const, kind: 'barrier' as const, placement })),
      ...layout.flaggers.map(placement => ({ type: 'place' as const, kind: 'flagger' as const, placement })),
      'zone-check' as const, 'run-traffic' as const,
    ];
    for (const event of events) state = performRoads(state, event, state.lastEventAtMs + 1000);
    const attempt = buildAttempt(state, timestamps, roadsZoneModule);
    expect(roadsRequirements(scenario).minimumTaperLength).toBeGreaterThan(5);
    expect(state.completed).toBe(true);
    expect(state.failed).toBe(false);
    expect(passed(state, roadsZoneModule)).toBe(true);
    expect(score(state)).toBe(100);
    expect(attempt).toMatchObject({ moduleId: 'roads-zone', passed: true, score: 100 });
    verifyCertification(attempt, roadsZoneModule);
  });

  it.each([0, 1])('runs Fire and EMS seed %i from blocker placement through triage and handover', (seed) => {
    const scenario = createFireScenario(seed);
    let state = preShift(startFire(scenario));
    for (const event of goodFireEvents(scenario)) state = performFire(state, event, state.lastEventAtMs + 1000);
    const attempt = buildAttempt(state, timestamps, sceneSafetyModule);
    expect(state.completed).toBe(true);
    expect(state.failed).toBe(false);
    expect(passed(state, sceneSafetyModule)).toBe(true);
    expect(score(state)).toBe(100);
    expect(attempt).toMatchObject({ moduleId: 'scene-safety', passed: true, score: 100 });
    expect(state.handover?.cableStatus).toBe('treat-as-live');
    verifyCertification(attempt, sceneSafetyModule);
  });

  it.each(ASSIST_MODULES)('runs On-site Assist $id through stop, human recheck, every gate and verified structured evidence', async (module) => {
    let guide = startCrewGuide(module);
    let log: FieldStepLogEntry[] = [];
    let atMs = 0;
    let stopped = false;
    const record = async (step: AssistStepLog['step'], outcome: AssistStepLog['outcome'], hazards: AssistHazardCode[] = []) => {
      log = await appendFieldStep(log, {
        workOrderRef: 'CIV-2026-00042', workOrderTypeCode: 'TRAINING', workerId: 'wk-1234abcd',
        step: { schema: 'civicops.assist.step.v1', option: 'utility-isolation', step, outcome, hazards,
          decision: outcome === 'confirmed' ? 'human-confirmed' : 'human-review-required', atMs },
      });
    };
    while (guide.phase !== 'complete') {
      const step = currentFieldStep(guide)!;
      if (step.stopGate && !stopped) {
        guide = answerStep(guide, 'not-sure', ++atMs);
        await record('request-human-review', 'stopped', step.hazards);
        expect(answerStep(guide, 'yes', ++atMs)).toBe(guide);
        expect(holdGate(guide, 5000, ++atMs)).toBe(guide);
        guide = resumeAfterRecheck(guide, 'yes', ++atMs);
        await record('request-human-review', 'needs-review', step.hazards);
        stopped = true;
      } else guide = answerStep(guide, 'yes', ++atMs);
      if (step.stopGate) {
        expect(holdGate(guide, 999, ++atMs)).toBe(guide);
        guide = holdGate(guide, 1000, atMs += 1000);
      }
      await record(step.stopGate ? 'check-isolation' : 'assess-hazards', 'confirmed', step.hazards);
    }
    await record('confirm-readiness', 'confirmed');
    expect(stopped).toBe(true);
    expect(guide.log.filter(entry => entry.outcome === 'confirmed').map(entry => entry.stepId)).toEqual(module.steps.map(step => step.id));
    expect(log).toHaveLength(module.steps.length + 3);
    expect(log.filter(entry => entry.step.step === 'confirm-readiness')).toHaveLength(1);
    expect(log[log.length - 1]?.step).toMatchObject({ step: 'confirm-readiness', decision: 'human-confirmed' });
    expect(log.filter(entry => entry.step.decision === 'human-review-required').map(entry => entry.step.outcome)).toEqual(['stopped', 'needs-review']);
    expect(await verifyFieldLog(log)).toBe(-1);
  });
});

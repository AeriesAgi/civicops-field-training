import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import attemptSchema from '../../../../contracts/training/attempt.v1.schema.json';
import { createScenario } from './modules/elec-loto';
import { createRoadsDailyDrill, createRoadsScenario, ROADS_SAFETY_NOTICE, ROADS_SCALE_NOTICE, roadsStepLines, roadsZoneModule } from './modules/roads-zone';
import { buildAttempt, passed, score } from './scoring';
import { currentRoadsStep, hintRoads, performRoads, startRoads, type RoadsEvent, type RoadsState } from './roads-procedure';
import { createFaultyRoadsLayout, createGoodRoadsLayout, type RoadsLayout } from './roads-geometry';
import { DailyDrillProgress, FIRST_MINUTES_STORAGE_KEY, comeBackSummary } from './daily-drill';
import { PROGRESS_STORAGE_KEY, TrainingProgress, type StorageLike } from './progress';
import { resultStats } from './presentation';

function run(state: RoadsState, ...events: RoadsEvent[]): RoadsState {
  return events.reduce((next, event) => performRoads(next, event, next.lastEventAtMs + 1000), state);
}
function layoutEvents(layout: RoadsLayout): RoadsEvent[] {
  return [
    ...(layout.vehicle ? [{ type: 'place' as const, kind: 'vehicle' as const, placement: layout.vehicle }] : []),
    { type: 'beacon', on: layout.beaconOn },
    ...(layout.warning ? [{ type: 'place' as const, kind: 'warning' as const, placement: layout.warning }] : []),
    ...layout.cones.map((placement): RoadsEvent => ({ type: 'place', kind: 'cone', placement })),
    ...layout.delineators.map((placement): RoadsEvent => ({ type: 'place', kind: 'delineator', placement })),
    ...(layout.keepLeft ? [{ type: 'place' as const, kind: 'keep-left' as const, placement: layout.keepLeft }] : []),
    ...layout.barriers.map((placement): RoadsEvent => ({ type: 'place', kind: 'barrier', placement })),
    ...layout.flaggers.map((placement): RoadsEvent => ({ type: 'place', kind: 'flagger', placement })),
  ];
}
function placed(state = startRoads(), layout = createGoodRoadsLayout(state.scenario)): RoadsState {
  return run(state, ...layoutEvents(layout));
}
function complete(state = placed()): RoadsState { return run(state, 'zone-check', 'run-traffic'); }
const options = { startedAt: '2026-10-09T10:00:00.000Z', completedAt: '2026-10-09T10:05:00.000Z', attemptId: '0d98232f-0eb3-4b8a-9401-63b09eca0d8d' };
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateAttempt = ajv.compile(attemptSchema);


describe('Roads shared-engine procedure', () => {
  it.each([0, 1, 2, 3])('completes seven steps with no critical errors for seed %i', (seed) => {
    const state = complete(placed(startRoads(createRoadsScenario(seed))));
    expect(state.completed).toBe(true);
    expect(state.failed).toBe(false);
    expect(state.steps.filter((step) => step.outcome === 'correct').map((step) => step.stepId)).toEqual(roadsZoneModule.steps.map((step) => step.id));
    expect(state.criticalErrors).toEqual([]);
    expect(passed(state, roadsZoneModule)).toBe(true);
    expect(score(state)).toBe(100);
    expect(currentRoadsStep(state)).toBeUndefined();
    const attempt = buildAttempt(state, options, roadsZoneModule);
    expect(attempt).toMatchObject({ moduleId: 'roads-zone', score: 100, passed: true });
    expect(validateAttempt(attempt), JSON.stringify(validateAttempt.errors)).toBe(true);
  });

  it('allows placement in any order while preserving the work-before-warning gate', () => {
    const state = run(startRoads(), ...layoutEvents(createGoodRoadsLayout()).reverse());
    expect(state.failed).toBe(false);
    expect(state.steps.filter((step) => step.outcome === 'correct')).toHaveLength(6);
    expect(passed(complete(state), roadsZoneModule)).toBe(true);
  });

  it('keeps Run traffic behind a fresh Zone check', () => {
    const state = run(placed(), 'run-traffic');
    expect(state.completed).toBe(false);
    expect(state.trafficRunning).toBe(false);
    expect(state.steps.some((step) => step.outcome === 'out-of-order')).toBe(true);
    expect(passed(complete(state), roadsZoneModule)).toBe(true);
    expect(score(complete(state))).toBe(90);
  });

  it('invalidates a previous check and physical step after a part moves', () => {
    const checked = run(placed(), 'zone-check');
    const moved = run(checked, { type: 'place', kind: 'cone', placement: { ...checked.layout.cones[0], x: 0.018 } });
    expect(moved.zoneChecked).toBe(false);
    expect(moved.zoneCheck).toBeUndefined();
    expect(moved.steps.some((step) => step.stepId === 'cone-taper' && step.outcome === 'correct')).toBe(false);
    expect(checked.layout.cones[0].x).toBe(-4.5);
    expect(moved.layoutVersion).toBe(checked.layoutVersion + 1);
  });

  it('invalidates a previous check even for a still-valid millimetre adjustment', () => {
    const checked = run(placed(), 'zone-check');
    const moved = run(checked, { type: 'place', kind: 'cone', placement: { ...checked.layout.cones[0], x: checked.layout.cones[0].x + 0.001 } });
    expect(moved.zoneChecked).toBe(false);
    expect(run(moved, 'run-traffic').trafficRunning).toBe(false);
    expect(complete(moved).failed).toBe(false);
  });

  it('shows ruler help only after a mistake and allows a scored repair', () => {
    let state = placed(startRoads(), createFaultyRoadsLayout('cone-spacing'));
    expect(state.ghostRulerVisible).toBe(false);
    state = run(state, 'zone-check');
    expect(state.completed).toBe(false);
    expect(state.failed).toBe(false);
    expect(state.ghostRulerVisible).toBe(true);
    expect(state.zoneCheck?.valid).toBe(false);
    const fixed = complete(placed(state));
    expect(passed(fixed, roadsZoneModule)).toBe(true);
    expect(score(fixed)).toBe(90);
  });

  it('does not penalise repeated Zone check pokes on unchanged faulty geometry', () => {
    const checked = run(placed(startRoads(), createFaultyRoadsLayout('taper-too-short')), 'zone-check');
    expect(run(checked, 'zone-check', 'zone-check')).toBe(checked);
    expect(score(checked)).toBe(90);
  });

  it('makes repeated placements, removals and beacon edges idempotent', () => {
    const state = placed();
    expect(run(state, ...layoutEvents(createGoodRoadsLayout()))).toBe(state);
    expect(run(state, { type: 'remove', kind: 'cone', id: 'missing' }, { type: 'remove', kind: 'warning', id: 'missing' })).toBe(state);
    const checked = run(state, 'zone-check');
    expect(run(checked, 'zone-check')).toBe(checked);
  });

  it('uses immutable finite monotonic event timestamps', () => {
    const initial = startRoads();
    const first = performRoads(initial, { type: 'beacon', on: true }, 15.7);
    const last = performRoads(first, { type: 'place', kind: 'warning', placement: createGoodRoadsLayout().warning! }, Number.NaN);
    expect(first.lastEventAtMs).toBe(16);
    expect(last.lastEventAtMs).toBe(16);
    expect(initial.layout.beaconOn).toBe(false);
    expect(first.layout.warning).toBeUndefined();
    expect(initial.steps).toEqual([]);
  });

  it('rejects nonfinite placement and leaves the physical state unchanged', () => {
    const state = startRoads();
    const next = run(state, { type: 'place', kind: 'cone', placement: { id: 'bad', x: NaN, z: 0, yaw: 0 } });
    expect(next.layout).toBe(state.layout);
    expect(next.layoutVersion).toBe(0);
    expect(next.feedback).toContain('finite');
  });

  it('removes individual placed parts and loses their prerequisite', () => {
    let state = placed();
    state = run(state, { type: 'remove', kind: 'cone', id: 'cone-2' });
    expect(state.layout.cones).toHaveLength(5);
    expect(currentRoadsStep(state)?.id).toBe('cone-taper');
    state = run(state, { type: 'remove', kind: 'warning', id: 'warning' });
    expect(state.layout.warning).toBeUndefined();
    expect(currentRoadsStep(state)?.id).toBe('advance-warning');
  });

  it('accepts an optional shoulder delineator through the same placement, check and traffic procedure', () => {
    const layout = createGoodRoadsLayout();
    layout.delineators.push({ id: 'delineator-1', x: -10, z: 4.65, yaw: 0 });
    const state = complete(placed(startRoads(), layout));
    expect(state.layout.delineators).toEqual(layout.delineators);
    expect(state.layout.cones).toHaveLength(6);
    expect(state.failed).toBe(false);
    expect(passed(state, roadsZoneModule)).toBe(true);
    expect(score(state)).toBe(100);
  });

  it('moves and removes a distinct delineator immutably, invalidating any previous audit', () => {
    const marker = { id: 'delineator-1', x: -10, z: 4.65, yaw: 0 };
    const checked = run(placed(), { type: 'place', kind: 'delineator', placement: marker }, 'zone-check');
    expect(run(checked, { type: 'place', kind: 'delineator', placement: marker })).toBe(checked);
    const moved = run(checked, { type: 'place', kind: 'delineator', placement: { ...marker, z: 0 } });
    expect(checked.layout.delineators).toEqual([marker]);
    expect(moved.layout.delineators).toHaveLength(1);
    expect(moved.layout.cones).toEqual(checked.layout.cones);
    expect(moved.zoneChecked).toBe(false);
    expect(moved.steps.some((step) => step.stepId === 'protect-work-area' && step.outcome === 'correct')).toBe(false);
    const removed = run(moved, { type: 'remove', kind: 'delineator', id: marker.id });
    expect(removed.layout.delineators).toEqual([]);
    expect(run(removed, { type: 'remove', kind: 'delineator', id: marker.id })).toBe(removed);
    expect(passed(complete(removed), roadsZoneModule)).toBe(true);
  });

  it('reset creates a fresh attempt with the same seeded scenario', () => {
    const state = complete(placed(startRoads(createRoadsScenario(3))));
    const reset = run(state, 'reset');
    expect(reset).toEqual(startRoads(createRoadsScenario(3)));
    expect(reset.layout).not.toBe(state.layout);
    expect(reset.hintsUsed).toBe(0);
  });

  it('uses the shared hint counter and has an instruction/why for every step', () => {
    const state = hintRoads(startRoads(), 100);
    expect(state.hintsUsed).toBe(1);
    expect(state.feedback).toContain('Hint:');
    expect(roadsZoneModule.steps.every((step) => roadsStepLines[step.id as keyof typeof roadsStepLines].why)).toBe(true);
    const ended = complete();
    expect(hintRoads(ended)).toBe(ended);
    expect(run(ended, 'zone-check', 'run-traffic', 'begin-work')).toBe(ended);
  });

  it('rejects scenarios from another department and mismatched scoring definitions', () => {
    expect(() => startRoads(createScenario())).toThrow('different');
    expect(() => passed(complete(), { ...roadsZoneModule, id: 'wrong' })).toThrow('different');
    expect(() => buildAttempt(complete(), options, { ...roadsZoneModule, id: 'wrong' })).toThrow('different');
  });
});

describe('Roads critical action gates', () => {
  it.each(['advance-warning-missing', 'advance-warning-distance', 'warning-facing-away'] as const)('stops work before usable advance warning: %s', (fault) => {
    const state = run(placed(startRoads(), createFaultyRoadsLayout(fault)), 'begin-work');
    expect(state).toMatchObject({ completed: true, failed: true, trafficRunning: false });
    expect(state.criticalErrors[0]).toContain('before advance warning');
    expect(passed(state, roadsZoneModule)).toBe(false);
  });

  it.each(['vehicle-in-work-area', 'taper-too-short', 'pedestrian-route-blocked', 'delineator-in-live-lane', 'flagger-in-live-lane'] as const)('stops unsafe Run traffic for %s and retains an instructor cause', (fault) => {
    const state = run(placed(startRoads(), createFaultyRoadsLayout(fault)), 'zone-check', 'run-traffic');
    expect(state).toMatchObject({ completed: true, failed: true, trafficRunning: true, ghostRulerVisible: true });
    expect(state.trafficFault?.code).toBe(fault);
    expect(state.criticalErrors[0]).toContain('Unsafe traffic demonstration');
    expect(state.steps.some((step) => step.outcome === 'unsafe')).toBe(true);
    expect(passed(state, roadsZoneModule)).toBe(false);
    expect(buildAttempt(state, options, roadsZoneModule).passed).toBe(false);
  });

  it('records a faulty traffic demonstration as unsafe even for a missing directional board', () => {
    const state = run(placed(startRoads(), createFaultyRoadsLayout('keep-left-missing')), 'run-traffic');
    expect(state.failed).toBe(true);
    expect(state.trafficFault?.code).toBe('keep-left-missing');
    expect(passed(state, roadsZoneModule)).toBe(false);
  });

  it('stops a critical skip without granting its physical prerequisite', () => {
    const state = run(startRoads(), { type: 'skip' });
    expect(state.failed).toBe(true);
    expect(state.layout.vehicle).toBeUndefined();
    expect(state.criticalErrors[0]).toContain('skipped');
  });

  it('requires readiness and a human decision rather than authorising real work', () => {
    const state = run(placed(), 'begin-work');
    expect(state.completed).toBe(false);
    expect(state.feedback).toContain('authorised person');
    const checked = run(placed(), 'zone-check', 'begin-work');
    expect(checked.completed).toBe(false);
    expect(checked.feedback).toContain('decides');
    expect(ROADS_SAFETY_NOTICE).toContain('SOPs');
    expect(ROADS_SCALE_NOTICE).toContain('Full-scale');
  });

  it('reloads structured evidence from a real unsafe taper attempt without granting a pass or certificate', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const stopped = run(placed(startRoads(), createFaultyRoadsLayout('taper-too-short')), 'zone-check', 'run-traffic');
    expect(stopped.completed).toBe(true);
    expect(stopped.failed).toBe(true);
    expect(stopped.trafficRunning).toBe(true); // The learner can observe the demonstration before leaving.
    const attempt = buildAttempt(stopped, options, roadsZoneModule);
    const progress = new TrainingProgress(storage);
    expect(progress.record(attempt, roadsZoneModule)).toMatchObject({ level: 'none', passes: 0, evidenceAttemptIds: [] });
    expect(values.has(PROGRESS_STORAGE_KEY)).toBe(true);
    const reloaded = new TrainingProgress(storage);
    expect(reloaded.getAttempts()).toEqual([attempt]);
    const retained = reloaded.getAttempts()[0];
    expect(retained.passed).toBe(false);
    expect(retained.steps.some(step => step.stepId === 'cone-taper' && step.outcome === 'unsafe')).toBe(true);
    expect(retained.criticalErrors[0]).toContain('taper');
    expect(retained).not.toHaveProperty('layout');
    expect(retained).not.toHaveProperty('trafficFault');
    expect(reloaded.certification(roadsZoneModule)).toMatchObject({ level: 'none', passes: 0, evidenceAttemptIds: [] });
    expect(reloaded.certification(roadsZoneModule).issuedAt).toBeUndefined();
  });

  it('prevents unsafe geometry from granting certificates or daily completion', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const daily = new DailyDrillProgress(storage);
    const drill = createRoadsDailyDrill(new Date(options.startedAt));
    const stopped = run(placed(startRoads(drill.scenario), createFaultyRoadsLayout('flagger-in-live-lane', drill.scenario)), 'run-traffic');
    const attempt = buildAttempt(stopped, options, roadsZoneModule);
    expect(new TrainingProgress(storage).record(attempt)).toMatchObject({ level: 'none', moduleId: 'roads-zone', passes: 0 });
    expect(daily.recordDailyPass(attempt)).toBe(false);
  });
});

describe('Roads seeded return loop and shared evidence', () => {
  it('makes deterministic UTC variants with both speeds and a blind bend', () => {
    const drills = Array.from({ length: 12 }, (_, index) => createRoadsDailyDrill(new Date(`2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`)));
    expect(new Set(drills.map((drill) => drill.seed))).toEqual(new Set([0, 1, 2, 3]));
    expect(drills.some((drill) => drill.scenario.variations.includes('blind-bend'))).toBe(true);
    expect(createRoadsDailyDrill(new Date('2026-10-09T00:00:00Z'))).toEqual(createRoadsDailyDrill(new Date('2026-10-09T23:59:59Z')));
    expect(createRoadsScenario(3, ['unknown', 'blind-bend', 'blind-bend']).variations).toEqual(['blind-bend']);
    expect(createRoadsScenario(3, []).variations).toEqual([]);
    expect(createRoadsScenario(NaN).seed).toBe(0);
  });

  it('uses the same cert ladder, local store, result card stats and expiry for Roads', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const attempt = buildAttempt(complete(), options, roadsZoneModule);
    const progress = new TrainingProgress(storage);
    expect(progress.record(attempt)).toMatchObject({ level: 'bronze', moduleId: 'roads-zone', expiresAt: '2027-10-09T10:05:00.000Z' });
    expect(resultStats(attempt)).toEqual({ time: '5:00', errors: 0, critical: 5 });
    expect(new TrainingProgress(storage).getAttempts()).toHaveLength(1);
  });

  it('persists Roads daily markers by module and rejects a different seeded scenario', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const daily = new DailyDrillProgress(storage);
    const drill = daily.moduleDailyStatus(roadsZoneModule, new Date(options.startedAt));
    const attempt = buildAttempt(complete(placed(startRoads(drill.scenario))), options, roadsZoneModule);
    expect(daily.recordDailyPass({ ...attempt, scenarioId: createRoadsScenario((drill.seed + 1) % 4).id })).toBe(false);
    expect(daily.recordDailyPass(attempt)).toBe(true);
    const marker = JSON.parse(values.get(FIRST_MINUTES_STORAGE_KEY)!);
    expect(marker.moduleDailyCompletedDays['roads-zone']).toEqual(['2026-10-09']);
    expect(marker.dailyCompletedDays).toEqual([]);
    expect(new DailyDrillProgress(storage).moduleDailyStatus(roadsZoneModule, new Date(options.startedAt)).status).toBe('completed');
    expect(new DailyDrillProgress(storage).firstLockAt).toBeUndefined();
  });

  it('preserves a Roads daily pass for the start day when its attempt crosses midnight', () => {
    const daily = new DailyDrillProgress(undefined);
    const startedAt = '2026-10-09T23:58:00.000Z';
    const completedAt = '2026-10-10T00:03:00.000Z';
    const drill = daily.moduleDailyStatus(roadsZoneModule, new Date(startedAt));
    const attempt = buildAttempt(complete(placed(startRoads(drill.scenario))), { ...options, startedAt, completedAt }, roadsZoneModule);
    expect(daily.recordDailyPass(attempt)).toBe(true);
    expect(daily.moduleDailyStatus(roadsZoneModule, new Date(startedAt)).status).toBe('completed');
    expect(daily.moduleDailyStatus(roadsZoneModule, new Date(completedAt)).status).toBe('ready');
    expect(daily.recordDailyPass({ ...attempt, moduleId: 'not-registered' })).toBe(false);
  });

  it('keeps module-scoped return evidence and active daily completion when storage is unavailable', () => {
    const storage: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const daily = new DailyDrillProgress(storage);
    const drill = createRoadsDailyDrill(new Date(options.startedAt));
    const attempt = buildAttempt(complete(placed(startRoads(drill.scenario))), options, roadsZoneModule);
    expect(daily.recordDailyPass(attempt)).toBe(true);
    expect(daily.moduleDailyStatus(roadsZoneModule, new Date(options.startedAt)).status).toBe('completed');
    expect(comeBackSummary([attempt], new Date('2026-10-09T12:00:00Z'), { moduleId: 'roads-zone', crewId: 'roads-01' }))
      .toEqual({ streakDays: 1, nextRefresherAt: '2026-10-16T10:05:00.000Z' });
    expect(comeBackSummary([attempt], new Date('2026-10-09T12:00:00Z'))).toEqual({ streakDays: 0 });
  });

  it('records matching Roads daily passes without recording an Electrical pass', () => {
    const daily = new DailyDrillProgress(undefined);
    const drill = createRoadsDailyDrill(new Date(options.startedAt));
    const state = complete(placed(startRoads(drill.scenario)));
    const attempt = buildAttempt(state, options, roadsZoneModule);
    expect(daily.recordDailyPass(attempt)).toBe(true);
    expect(daily.recordDailyPass(attempt)).toBe(false);
    expect(daily.dailyStatus(new Date(options.startedAt)).status).toBe('ready');
    expect(daily.moduleDailyStatus(roadsZoneModule, new Date(options.startedAt)).status).toBe('completed');
  });
});

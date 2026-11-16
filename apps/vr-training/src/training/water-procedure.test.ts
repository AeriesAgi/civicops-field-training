import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import attemptSchema from '../../../../contracts/training/attempt.v1.schema.json';
import { comeBackSummary, DailyDrillProgress } from './daily-drill';
import { createScenario } from './modules/elec-loto';
import { createWaterDailyDrill, createWaterScenario, WATER_MAX_TURNS_PER_SECOND, WATER_VALVE_TURNS, waterBurstModule, waterStepLines } from './modules/water-burst';
import { TrainingProgress, type StorageLike } from './progress';
import { checklist, resultStats } from './presentation';
import { buildAttempt, passed, score } from './scoring';
import { checkValveTurnRate, currentWaterStep, getWaterFlow, getWaterPressure, hintWater, performWater, startWater, type WaterEvent, type WaterState, type WaterValveId } from './water-procedure';

function run(state: WaterState, ...events: WaterEvent[]): WaterState {
  return events.reduce((next, event) => performWater(next, event, next.lastEventAtMs + 5000), state);
}

function planned(scenario = createWaterScenario()): WaterState {
  return run(startWater(scenario), 'place-barriers', 'place-sign', 'set-spoil-back',
    { type: 'plan-isolation', valves: scenario.variations.includes('seized-valve') ? ['A', 'D'] : ['A', 'B'] }, 'notify-control');
}

function seat(state: WaterState, valve: WaterValveId): WaterState {
  return run(state, { type: 'lift-cover', valve }, { type: 'seat-key', valve });
}

function close(state: WaterState, valve: WaterValveId): WaterState {
  return run(seat(state, valve), { type: 'turn-valve', valve, deltaTurns: WATER_VALVE_TURNS, elapsedMs: 5000 });
}

function isolated(state = planned()): WaterState {
  return run(close(close(state, 'A'), state.scenario.variations.includes('seized-valve') ? 'D' : 'B'), 'open-washout', 'confirm-isolation');
}

function complete(state = isolated()): WaterState {
  return run(state, 'check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding', 'trench-safety', 'ready-for-repair');
}

const options = { startedAt: '2026-10-08T10:00:00.000Z', completedAt: '2026-10-08T10:05:00.000Z', attemptId: '0d98232f-0eb3-4b8a-9401-63b09eca0d8d' };
const validator = new Ajv2020({ allErrors: true });
addFormats(validator);
const validateAttempt = validator.compile(attemptSchema);

describe('water burst procedure', () => {
  it('completes all seven steps through physical prerequisites and the shared scorer', () => {
    const state = complete();
    expect(state.steps.filter((step) => step.outcome === 'correct').map((step) => step.stepId)).toEqual(waterBurstModule.steps.map((step) => step.id));
    expect(state.completed).toBe(true);
    expect(state.failed).toBe(false);
    expect(state.criticalErrors).toEqual([]);
    expect(passed(state)).toBe(true);
    expect(score(state)).toBe(100);
    expect(currentWaterStep(state)).toBeUndefined();
    const attempt = buildAttempt(state, options);
    expect(attempt).toMatchObject({ moduleId: 'water-burst', crewId: 'water-01', passed: true, score: 100 });
    expect(validateAttempt(attempt), JSON.stringify(validateAttempt.errors)).toBe(true);
  });

  it('requires barriers, sign and spoil setback before the area-safe step completes', () => {
    let state = run(startWater(), 'place-sign', 'place-barriers');
    expect(currentWaterStep(state)?.id).toBe('make-area-safe');
    state = run(state, 'set-spoil-back');
    expect(currentWaterStep(state)?.id).toBe('identify-valves');
  });

  it('keeps planning and notification as real prerequisites', () => {
    const noPlan = run(startWater(), 'place-barriers', 'place-sign', 'set-spoil-back', 'notify-control');
    expect(noPlan.physical.notified).toBe(false);
    const noNotify = seat(run(startWater(), 'place-barriers', 'place-sign', 'set-spoil-back', { type: 'plan-isolation', valves: ['A', 'B'] }), 'A');
    const next = run(noNotify, { type: 'turn-valve', valve: 'A', deltaTurns: 1, elapsedMs: 2000 });
    expect(next.physical.valves.A.turns).toBe(0);
    expect(next.feedback).toContain('notify');
  });

  it('rejects the hospital branch on the plan without operating it', () => {
    const state = run(startWater(), 'place-barriers', 'place-sign', 'set-spoil-back', { type: 'plan-isolation', valves: ['A', 'C'] });
    expect(state.physical.schematicChecked).toBe(false);
    expect(state.physical.valves.C.turns).toBe(0);
    expect(state.feedback).toContain('hospital');
  });

  it('requires a lifted cover and a seated key, with one key on one valve', () => {
    let state = run(planned(), { type: 'seat-key', valve: 'A' }, { type: 'turn-valve', valve: 'A', deltaTurns: 1, elapsedMs: 2000 });
    expect(state.physical.valves.A.turns).toBe(0);
    state = seat(state, 'A');
    state = seat(state, 'B');
    expect(state.physical.valves.A.keySeated).toBe(false);
    expect(state.physical.valves.B.keySeated).toBe(true);
  });

  it('counts controlled partial turns and reduces the jet continuously', () => {
    let state = seat(planned(), 'A');
    expect(getWaterFlow(state)).toBe(1);
    expect(getWaterPressure(state)).toBe(4);
    state = run(state, { type: 'turn-valve', valve: 'A', deltaTurns: 1, elapsedMs: 2000 });
    expect(state.physical.valves.A.turns).toBe(1);
    expect(getWaterFlow(state)).toBeCloseTo(0.8833333);
    state = run(state, { type: 'turn-valve', valve: 'A', deltaTurns: 2, elapsedMs: 3000 });
    expect(getWaterFlow(state)).toBeCloseTo(0.65);
    state = run(seat(state, 'B'), { type: 'turn-valve', valve: 'B', deltaTurns: 1.5, elapsedMs: 3000 });
    expect(getWaterFlow(state)).toBeCloseTo(0.325);
  });

  it('snaps only floating-point dust at closed/open boundaries without treating a real partial turn as closed', () => {
    let state = seat(planned(), 'A');
    for (let index = 0; index < 12; index += 1) state = run(state, { type: 'turn-valve', valve: 'A', deltaTurns: 0.249999999, elapsedMs: 500 });
    expect(state.physical.valves.A.turns).toBe(3);
    const b = close(state, 'B');
    expect(getWaterFlow(b)).toBe(0);
    const partial = run(seat(planned(), 'A'), { type: 'turn-valve', valve: 'A', deltaTurns: 2.99, elapsedMs: 5000 });
    expect(partial.physical.valves.A.turns).toBe(2.99);
    expect(close(partial, 'B').physical.valves.B.turns).toBe(0);
    const reopened = run(seat(state, 'A'), { type: 'turn-valve', valve: 'A', deltaTurns: -2.999999999, elapsedMs: 5000 });
    expect(reopened.physical.valves.A.turns).toBe(0);
  });

  it('closes a valve whose measured turns already read 3.00, so the panel never shows 3.00 and stalls', () => {
    // Real 12 Nov 2026 IWER hand run: valve B accumulated 2.999875 turns and showed "B: 3.00 of 3".
    const a = close(planned(), 'A');
    const b = run(seat(a, 'B'), { type: 'turn-valve', valve: 'B', deltaTurns: 2.999875, elapsedMs: 5000 });
    expect(b.physical.valves.B.turns).toBe(3);
    expect(getWaterFlow(b)).toBe(0);
    const short = run(seat(a, 'B'), { type: 'turn-valve', valve: 'B', deltaTurns: 2.994, elapsedMs: 5000 });
    expect(short.physical.valves.B.turns).toBe(2.994);
  });

  it('finishes measured IWER wrist rolls without losing the valve order or pressure gate', () => {
    let state=planned();
    // Real vr13 hand run: 12 quarter turns accumulated to 2.9999375, shown as 3.00.
    for(const valve of ['A','B'] as const) {
      state=seat(state,valve);
      for(let i=0;i<12;i++)state=run(state,{type:'turn-valve',valve,deltaTurns:.2499948,elapsedMs:500});
      expect(state.physical.valves[valve].turns).toBe(3);
      expect(state.physical.isolationConfirmed).toBe(false);
    }
    expect(currentWaterStep(state)?.id).toBe('confirm-isolation');
    expect(run(state,'confirm-isolation').physical.isolationConfirmed).toBe(false);
    expect(run(state,'open-washout','confirm-isolation').physical.isolationConfirmed).toBe(true);
  });

  it('rejects wrong closure order, keeps flow and permits a scored recovery', () => {
    const wrong = run(seat(planned(), 'B'), { type: 'turn-valve', valve: 'B', deltaTurns: 3, elapsedMs: 5000 });
    expect(wrong.physical.valves.B.turns).toBe(0);
    expect(getWaterFlow(wrong)).toBe(1);
    expect(wrong.failed).toBe(false);
    expect(wrong.feedback).toContain('A before');
    const recovered = complete(isolated(wrong));
    expect(score(recovered)).toBe(90);
    expect(passed(recovered)).toBe(true);
  });

  it('retains trapped pressure until washout drainage and requires positive confirmation', () => {
    const shut = close(close(planned(), 'A'), 'B');
    expect(getWaterFlow(shut)).toBe(0);
    expect(getWaterPressure(shut)).toBe(1.2);
    expect(run(shut, 'confirm-isolation').physical.isolationConfirmed).toBe(false);
    const drained = run(shut, 'open-washout');
    expect(getWaterPressure(drained)).toBe(0.1);
    expect(drained.physical.isolationConfirmed).toBe(false);
    expect(run(drained, 'confirm-isolation').physical.isolationConfirmed).toBe(true);
  });

  it('rejects washout before closure and trench checks before isolation', () => {
    const state = run(planned(), 'open-washout', 'check-shoring');
    expect(state.physical.washoutOpen).toBe(false);
    expect(state.physical.shoringChecked).toBe(false);
  });

  it.each(['check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding'] as const)('requires the %s trench check', (missing) => {
    const checks = ['check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding'] as const;
    const state = run(isolated(), ...checks.filter((check) => check !== missing), 'trench-safety');
    expect(state.physical.trenchChecked).toBe(false);
  });

  it('invalidates isolation and trench confirmation when an isolating valve is reopened', () => {
    const checked = run(isolated(), 'check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding', 'trench-safety');
    const opened = run(seat(checked, 'A'), { type: 'turn-valve', valve: 'A', deltaTurns: -1, elapsedMs: 2000 });
    expect(opened.physical.isolationConfirmed).toBe(false);
    expect(opened.physical.trenchChecked).toBe(false);
    expect(currentWaterStep(opened)?.id).toBe('close-valves');
    expect(getWaterFlow(opened)).toBe(0); // downstream B is still closed; confirmation remains mandatory.
  });

  it('makes repeat hand touch edges idempotent', () => {
    const state = planned();
    expect(run(state, 'place-barriers', 'place-sign', 'set-spoil-back', 'notify-control', { type: 'plan-isolation', valves: ['A', 'B'] })).toBe(state);
    const seated = seat(state, 'A');
    expect(run(seated, { type: 'lift-cover', valve: 'A' }, { type: 'seat-key', valve: 'A' })).toBe(seated);
  });

  it('uses immutable inputs and monotonic finite timestamps', () => {
    const initial = startWater();
    const next = performWater(initial, 'place-barriers', 15.7);
    const last = performWater(next, 'place-sign', Number.NaN);
    expect(initial.physical.barriersPlaced).toBe(false);
    expect(initial.steps).toEqual([]);
    expect(last.lastEventAtMs).toBe(16);
    expect(next.physical.signPlaced).toBe(false);
  });

  it('counts hints and exposes a why for every step', () => {
    const state = hintWater(startWater(), 100);
    expect(state.hintsUsed).toBe(1);
    expect(state.steps).toEqual([]);
    expect(state.feedback).toContain('one metre');
    expect(waterBurstModule.steps.every((step) => waterStepLines[step.id].instruction && waterStepLines[step.id].why)).toBe(true);
    const ended = complete();
    expect(hintWater(ended)).toBe(ended);
    expect(run(ended, 'enter-trench')).toBe(ended);
  });

  it('rejects cross-department scenarios and mismatched scoring definitions', () => {
    expect(() => startWater(createScenario())).toThrow('different');
    expect(() => passed(complete(), { ...waterBurstModule, id: 'wrong' })).toThrow('different');
    expect(() => buildAttempt(complete(), options, { ...waterBurstModule, id: 'wrong' })).toThrow('different');
  });

  it('fails closed when scoring an unregistered department instead of applying electrical defaults', () => {
    const unknown = { ...complete(), scenario: { ...createWaterScenario(), moduleId: 'not-registered' } };
    expect(() => passed(unknown)).toThrow('registered');
    expect(() => buildAttempt(unknown, options)).toThrow('registered');
    // Definitions supplied by the shared engine can support later modules without a scorer fork.
    expect(buildAttempt(unknown, options, { ...waterBurstModule, id: 'not-registered' }).moduleId).toBe('not-registered');
  });
});

describe('water critical error gates', () => {
  it.each(['place-barriers', 'place-sign', 'set-spoil-back'] as const)('stops operation with missing %s', (missing) => {
    const protections = ['place-barriers', 'place-sign', 'set-spoil-back'] as const;
    const state = seat(run(startWater(), ...protections.filter((step) => step !== missing)), 'A');
    const stopped = run(state, { type: 'turn-valve', valve: 'A', deltaTurns: 1, elapsedMs: 2000 });
    expect(stopped.completed).toBe(true);
    expect(stopped.failed).toBe(true);
    expect(stopped.criticalErrors).toHaveLength(1);
    expect(passed(stopped)).toBe(false);
  });

  it('stops an unauthorized critical-customer closure and preserves human authorization semantics', () => {
    const state = seat(planned(), 'C');
    const stopped = run(state, { type: 'turn-valve', valve: 'C', deltaTurns: 1, elapsedMs: 2000 });
    expect(stopped.criticalErrors[0]).toContain('hospital');
    expect(stopped.physical.valves.C.turns).toBe(0);
    const allowed = run(state, { type: 'authorise-critical-customer', authorised: true }, { type: 'turn-valve', valve: 'C', deltaTurns: 1, elapsedMs: 2000 });
    expect(allowed.failed).toBe(false);
    expect(allowed.physical.valves.C.turns).toBe(1);
    expect(getWaterFlow(allowed)).toBe(1);
  });

  it('stops a rapid closure with a water-hammer cause', () => {
    const stopped = run(seat(planned(), 'A'), { type: 'turn-valve', valve: 'A', deltaTurns: 1, elapsedMs: 500 });
    expect(stopped.completed).toBe(true);
    expect(stopped.criticalErrors[0]).toContain('Water hammer');
    expect(stopped.physical.valves.A.turns).toBe(0);
    expect(buildAttempt(stopped, options).passed).toBe(false);
  });

  it('stops unshored or otherwise unchecked trench entry', () => {
    const stopped = run(isolated(), 'enter-trench');
    expect(stopped.failed).toBe(true);
    expect(stopped.criticalErrors[0]).toContain('shoring');
    const safe = run(isolated(), 'check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding', 'trench-safety', 'enter-trench');
    expect(safe.failed).toBe(false);
    expect(safe.feedback).toContain('authorised person');
  });

  it('fails critical skip and early repair readiness without granting safety state', () => {
    expect(run(startWater(), { type: 'skip' })).toMatchObject({ completed: true, failed: true });
    expect(run(startWater(), 'ready-for-repair')).toMatchObject({ completed: true, failed: true });
    const skipped = run(startWater(), 'place-barriers', 'place-sign', 'set-spoil-back', { type: 'skip' });
    expect(skipped.physical.schematicChecked).toBe(false);
    expect(run(skipped, 'notify-control').physical.notified).toBe(false);
  });
});

describe('valve-rate validation and daily alternate route', () => {
  it('accepts the exact turn-rate boundary and controlled opening', () => {
    expect(checkValveTurnRate(WATER_MAX_TURNS_PER_SECOND, 1000)).toBe('valid');
    expect(checkValveTurnRate(-0.5, 1000)).toBe('valid');
    expect(checkValveTurnRate(0.751, 1000)).toBe('too-fast');
  });

  it.each([[Number.NaN, 1000], [1, Number.NaN], [1, 0], [1, -1], [Infinity, 1000], [4, 10000]])('rejects invalid turn sample %s / %s', (turns, duration) => {
    expect(checkValveTurnRate(turns, duration)).toBe('invalid');
  });

  it('makes seized B require the alternate A-D route and does not force it', () => {
    const scenario = createWaterScenario(1);
    const state = planned(scenario);
    expect(currentWaterStep(state)?.label).toContain('alternate D');
    const seized = run(seat(state, 'B'), { type: 'turn-valve', valve: 'B', deltaTurns: 1, elapsedMs: 2000 });
    expect(seized.physical.valves.B.turns).toBe(0);
    expect(seized.feedback).toContain('seized');
    const ended = complete(isolated(seized));
    expect(ended.physical.valves.D.turns).toBe(3);
    expect(ended.physical.valves.C.turns).toBe(0);
    expect(passed(ended)).toBe(true);
  });

  it('creates deterministic standard and seized daily drills with unique scenario IDs', () => {
    const drill = createWaterDailyDrill(new Date('2026-10-08T23:59:00Z'));
    expect(drill).toEqual(createWaterDailyDrill(new Date('2026-10-08T00:00:00Z')));
    const variants = [8, 9, 10, 11].map((day) => createWaterDailyDrill(new Date(`2026-10-${String(day).padStart(2, '0')}T00:00:00Z`)).variation);
    expect(new Set(variants)).toEqual(new Set(['standard', 'seized-valve']));
    expect(createWaterScenario(1, []).variations).toEqual([]);
    expect(createWaterScenario(1, ['unknown', 'seized-valve', 'seized-valve']).variations).toEqual(['seized-valve']);
    expect(createWaterScenario(Number.NaN).seed).toBe(0);
  });

  it('uses the existing cert ladder, expiry, local evidence and return loop for Water', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const progress = new TrainingProgress(storage);
    const attempt = buildAttempt(complete(), options);
    expect(progress.record(attempt)).toMatchObject({ level: 'bronze', moduleId: 'water-burst', crewId: 'water-01', expiresAt: '2027-10-08T10:05:00.000Z' });
    expect(progress.certification(waterBurstModule).passes).toBe(1);
    expect(comeBackSummary(progress.getAttempts(), new Date('2026-10-08T12:00:00Z'), { moduleId: 'water-burst', crewId: 'water-01' }))
      .toEqual({ streakDays: 1, nextRefresherAt: '2026-10-15T10:05:00.000Z' });
    expect(new TrainingProgress(storage).getAttempts()).toHaveLength(1);
  });

  it('uses shared result and checklist rendering for the department definition', () => {
    expect(checklist(startWater(), 'make-area-safe', 1)).toBe('> 1');
    expect(checklist(planned(), 'make-area-safe', 1)).toBe('[x] 1');
    expect(checklist(planned(), 'close-valves', 4)).toBe('> 4');
    expect(resultStats(buildAttempt(complete(), options))).toEqual({ time: '5:00', errors: 0, critical: 4 });
  });

  it('tracks Water daily evidence through the same local store without completing Electrical drills', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const progress = new DailyDrillProgress(storage);
    const now = new Date(options.startedAt);
    const drill = progress.moduleDailyStatus(waterBurstModule, now);
    expect(drill.status).toBe('ready');
    const attempt = buildAttempt(complete(isolated(planned(drill.scenario))), options);
    expect(progress.recordDailyPass(attempt)).toBe(true);
    expect(progress.recordDailyPass(attempt)).toBe(false);
    expect(progress.dailyStatus(now).status).toBe('ready');
    expect(new DailyDrillProgress(storage).moduleDailyStatus(waterBurstModule, now).status).toBe('completed');
    expect(progress.recordDailyPass({ ...attempt, passed: false })).toBe(false);
  });

  it('never grants Water certification or daily completion for a stopped critical attempt', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const daily = new DailyDrillProgress(storage);
    const drill = daily.moduleDailyStatus(waterBurstModule, new Date(options.startedAt));
    const stopped = run(planned(drill.scenario), 'enter-trench');
    const attempt = buildAttempt(stopped, options);
    expect(attempt.score).toBe(100);
    expect(attempt.passed).toBe(false);
    expect(new TrainingProgress(storage).record(attempt)).toMatchObject({ level: 'none', moduleId: 'water-burst', passes: 0 });
    expect(daily.recordDailyPass(attempt)).toBe(false);
    expect(daily.moduleDailyStatus(waterBurstModule, new Date(options.startedAt)).status).toBe('ready');
  });

  it('preserves Water start-day daily evidence across midnight and rejects another variant', () => {
    const daily = new DailyDrillProgress(undefined);
    const startedAt = '2026-10-08T23:58:00.000Z';
    const completedAt = '2026-10-09T00:03:00.000Z';
    const drill = daily.moduleDailyStatus(waterBurstModule, new Date(startedAt));
    const attempt = buildAttempt(complete(isolated(planned(drill.scenario))), { ...options, startedAt, completedAt });
    expect(daily.recordDailyPass({ ...attempt, scenarioId: createWaterScenario(drill.seed ? 0 : 1).id })).toBe(false);
    expect(daily.recordDailyPass(attempt)).toBe(true);
    expect(daily.moduleDailyStatus(waterBurstModule, new Date(startedAt)).status).toBe('completed');
    expect(daily.moduleDailyStatus(waterBurstModule, new Date(completedAt)).status).toBe('ready');
    expect(daily.recordDailyPass({ ...attempt, moduleId: 'not-registered' })).toBe(false);
  });
});

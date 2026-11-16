import { describe, expect, it } from 'vitest';
import type { TrainingAttempt } from './contracts.js';
import {
  comeBackSummary, dailyDrill, DailyDrillProgress, FIRST_MINUTES_STORAGE_KEY,
} from './daily-drill.js';
import { createScenario } from './modules/elec-loto.js';
import { waterBurstModule } from './modules/water-burst.js';
import { roadsZoneModule } from './modules/roads-zone.js';
import { sceneSafetyModule } from './modules/scene-safety.js';
import { GhostDemoTracker, type DemoGesture } from './onboarding.js';
import type { StorageLike } from './progress.js';

const now = new Date('2026-10-08T20:00:00.000Z');

function storage(): StorageLike {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); } };
}

function attempt(id = 'first', completedAt = '2026-10-08T10:00:00.000Z'): TrainingAttempt {
  const startedAt = new Date(Date.parse(completedAt) - 60_000).toISOString();
  return {
    schema: 'civicops.training.attempt.v1', attemptId: id,
    moduleId: 'elec-loto', moduleVersion: 1,
    scenarioId: createScenario(dailyDrill(new Date(startedAt)).seed).id,
    traineeId: 'demo-trainee', crewId: 'electricity-01', startedAt, completedAt, durationMs: 60_000,
    steps: [], criticalErrors: [], score: 100, passed: true, inputMode: 'hands',
    accessibility: { oneHanded: false, gazePinch: false, highContrast: false, captions: true, seated: true, benchHeightOffset: 0 },
    device: { runtime: 'emulated', deviceName: 'IWER' }, instructor: { mode: 'scripted', hintsRequested: 0 },
  };
}

describe('UTC daily-drill seeding', () => {
  it('has the same choice throughout a UTC day and on timezone-offset clocks', () => {
    const drill = dailyDrill(new Date('2026-10-08T00:00:00Z'));
    expect(dailyDrill(new Date('2026-10-08T23:59:59Z'))).toEqual(drill);
    expect(dailyDrill(new Date('2026-10-09T01:00:00+02:00'))).toEqual(drill);
    expect(drill.day).toBe('2026-10-08');
  });

  it('varies reproducibly over dates and never produces an unsupported backfeed', () => {
    const seeds = new Set<number>();
    for (let day = 1; day <= 31; day += 1) {
      const date = new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00Z`);
      const drill = dailyDrill(date);
      expect(dailyDrill(date)).toEqual(drill);
      expect([0, 1]).toContain(drill.seed);
      expect(createScenario(drill.seed).variations).not.toContain('backfeed');
      expect(drill.variation).toBe(drill.seed ? 'mislabelled-breaker' : 'standard');
      seeds.add(drill.seed);
    }
    expect([...seeds].sort()).toEqual([0, 1]);
  });

  it('switches the date at UTC midnight rather than South African midnight', () => {
    expect(dailyDrill(new Date('2026-10-08T23:59:59Z')).day).toBe('2026-10-08');
    expect(dailyDrill(new Date('2026-10-09T00:00:00Z')).day).toBe('2026-10-09');
  });
});

describe('local first-five-minutes and daily markers', () => {
  it('starts as a new visitor without a First lock stamp or daily completion', () => {
    const progress = new DailyDrillProgress(storage());
    expect(progress.isReturning()).toBe(false);
    expect(progress.firstLockAt).toBeUndefined();
    expect(progress.dailyStatus(now)).toMatchObject({ day: '2026-10-08', status: 'ready' });
  });

  it('records first meaningful onboarding completion and first lock once across visits', () => {
    const saved = storage();
    const progress = new DailyDrillProgress(saved);
    progress.recordOnboardingComplete(now);
    progress.recordFirstLock(now);
    progress.recordOnboardingComplete(new Date('2026-10-09T12:00:00Z'));
    progress.recordFirstLock(new Date('2026-10-09T12:00:00Z'));
    const returning = new DailyDrillProgress(saved);
    expect(returning.isReturning()).toBe(true);
    expect(returning.firstLockAt).toBe(now.toISOString());
  });

  it('does not infer returning from an awarded lock or a daily-marker-only save', () => {
    const progress = new DailyDrillProgress(storage());
    progress.recordFirstLock(now);
    progress.recordDailyPass(attempt());
    expect(progress.isReturning()).toBe(false);
  });

  it('persists a passing daily scenario, deduplicates it and resets status the next day', () => {
    const saved = storage();
    const progress = new DailyDrillProgress(saved);
    expect(progress.recordDailyPass(attempt())).toBe(true);
    expect(progress.recordDailyPass(attempt('second'))).toBe(false);
    const reloaded = new DailyDrillProgress(saved);
    expect(reloaded.dailyStatus(now).status).toBe('completed');
    expect(reloaded.dailyStatus(new Date('2026-10-09T10:00:00Z')).status).toBe('ready');
  });

  it('marks the selected start day when the daily pass crosses midnight', () => {
    const progress = new DailyDrillProgress(storage());
    const crossing = attempt('crossing', '2026-10-09T00:00:30Z');
    expect(crossing.startedAt).toBe('2026-10-08T23:59:30.000Z');
    expect(progress.recordDailyPass(crossing)).toBe(true);
    expect(progress.dailyStatus(now).status).toBe('completed');
    expect(progress.dailyStatus(new Date(crossing.completedAt)).status).toBe('ready');
  });

  it.each([waterBurstModule, roadsZoneModule, sceneSafetyModule])('retains $id daily completion across reload and subsequent saves', (module) => {
    const saved = storage();
    const progress = new DailyDrillProgress(saved);
    const drill = progress.moduleDailyStatus(module, now);
    const evidence = { ...attempt(), moduleId: module.id, moduleVersion: module.version, scenarioId: drill.scenario.id };
    expect(progress.recordDailyPass(evidence)).toBe(true);

    const reloaded = new DailyDrillProgress(saved);
    expect(reloaded.moduleDailyStatus(module, now).status).toBe('completed');
    expect(reloaded.recordDailyPass(evidence)).toBe(false);
    reloaded.recordGestureSeen('poke');
    expect(new DailyDrillProgress(saved).moduleDailyStatus(module, now).status).toBe('completed');
    expect(reloaded.moduleDailyStatus(module, new Date('2026-10-09T10:00:00Z')).status).toBe('ready');
  });

  it.each([
    { passed: false }, { score: 79 }, { score: 101 }, { score: 80.5 },
    { criticalErrors: ['unsafe'] }, { moduleId: 'road-zone' },
    { scenarioId: createScenario(2).id }, { startedAt: 'broken' },
    { startedAt: '2026-10-09T10:00:00Z' }, { completedAt: '2026-02-30T10:00:00Z' },
  ] as Partial<TrainingAttempt>[])('rejects ineligible daily evidence %j', (invalid) => {
    const progress = new DailyDrillProgress(storage());
    expect(progress.recordDailyPass({ ...attempt(), ...invalid })).toBe(false);
    expect(progress.dailyStatus(now).status).toBe('ready');
  });

  it.each(['{broken', '[]', 'null', '42', '{"schema":"old"}'])('tolerates a corrupt save %s', (raw) => {
    const saved = storage();
    saved.setItem(FIRST_MINUTES_STORAGE_KEY, raw);
    const progress = new DailyDrillProgress(saved);
    expect(progress.isReturning()).toBe(false);
    expect(progress.firstLockAt).toBeUndefined();
    expect(progress.dailyStatus(now).status).toBe('ready');
  });

  it('retains valid fields while filtering corrupt dates and duplicated daily days', () => {
    const saved = storage();
    saved.setItem(FIRST_MINUTES_STORAGE_KEY, JSON.stringify({
      schema: FIRST_MINUTES_STORAGE_KEY, onboardingCompletedAt: 'invalid', firstLockAt: now.toISOString(),
      dailyCompletedDays: ['2026-02-30', '2026-10-08', null, '2026-10-08', '2026-13-10', 'invalid'],
    }));
    const progress = new DailyDrillProgress(saved);
    expect(progress.isReturning()).toBe(false);
    expect(progress.firstLockAt).toBe(now.toISOString());
    expect(progress.dailyStatus(now).status).toBe('completed');
  });

  it('continues in memory when localStorage reads and writes are denied', () => {
    const progress = new DailyDrillProgress({
      getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); },
    });
    progress.recordOnboardingComplete(now);
    progress.recordFirstLock(now);
    expect(progress.recordDailyPass(attempt())).toBe(true);
    expect(progress.isReturning()).toBe(true);
    expect(progress.firstLockAt).toBe(now.toISOString());
    expect(progress.dailyStatus(now).status).toBe('completed');
  });

  it('ignores an invalid date without breaking later completion recording', () => {
    const progress = new DailyDrillProgress(storage());
    progress.recordOnboardingComplete(new Date('invalid'));
    progress.recordFirstLock(new Date('invalid'));
    expect(progress.isReturning()).toBe(false);
    expect(progress.firstLockAt).toBeUndefined();
    progress.recordOnboardingComplete(now);
    expect(progress.isReturning()).toBe(true);
  });
});

describe('learned gestures across visits', () => {
  it('keeps learned gestures after reload without marking partial onboarding complete', () => {
    const saved = storage();
    const progress = new DailyDrillProgress(saved);
    progress.recordGestureSeen('poke');
    progress.recordGestureSeen('pinch-grab');
    const reloaded = new DailyDrillProgress(saved);
    expect(reloaded.getSeenGestures()).toEqual(['poke', 'pinch-grab']);
    expect(reloaded.isReturning()).toBe(false);
    const demos = new GhostDemoTracker(reloaded.getSeenGestures());
    expect(demos.start('poke', 1_000)).toBe(false);
    expect(demos.start('place', 2_000)).toBe(true);
  });

  it('keeps success before an automatic demo learned on the next visit', () => {
    const saved = storage();
    const progress = new DailyDrillProgress(saved);
    const demos = new GhostDemoTracker(progress.getSeenGestures());
    expect(demos.succeed('poke')).toBe(false);
    progress.recordGestureSeen('poke');
    expect(demos.start('poke', 2_000)).toBe(false);
    const nextVisit = new GhostDemoTracker(new DailyDrillProgress(saved).getSeenGestures());
    expect(nextVisit.start('poke', 8_000)).toBe(false);
  });

  it('writes only the first occurrence of each allowed gesture', () => {
    const saved = storage();
    let writes = 0;
    const counted: StorageLike = {
      getItem: (key) => saved.getItem(key),
      setItem: (key, value) => { writes += 1; saved.setItem(key, value); },
    };
    const progress = new DailyDrillProgress(counted);
    progress.recordGestureSeen('place');
    progress.recordGestureSeen('place');
    progress.recordGestureSeen('unknown' as DemoGesture);
    progress.recordGestureSeen('hold-to-confirm');
    expect(writes).toBe(2);
    expect(new DailyDrillProgress(saved).getSeenGestures()).toEqual(['place', 'hold-to-confirm']);
  });

  it('accepts old v1 saves without losing the existing lock, daily or returning markers', () => {
    const saved = storage();
    const old = new DailyDrillProgress(saved);
    old.recordOnboardingComplete(now);
    old.recordFirstLock(now);
    old.recordDailyPass(attempt());
    const progress = new DailyDrillProgress(saved);
    expect(progress.getSeenGestures()).toEqual([]);
    progress.recordGestureSeen('poke');
    const reloaded = new DailyDrillProgress(saved);
    expect(reloaded.isReturning()).toBe(true);
    expect(reloaded.firstLockAt).toBe(now.toISOString());
    expect(reloaded.dailyStatus(now).status).toBe('completed');
    expect(reloaded.getSeenGestures()).toEqual(['poke']);
  });

  it('filters unknown, malformed and duplicate saved gestures', () => {
    const saved = storage();
    saved.setItem(FIRST_MINUTES_STORAGE_KEY, JSON.stringify({
      schema: FIRST_MINUTES_STORAGE_KEY, dailyCompletedDays: [],
      seenGestures: [null, 'poke', {}, 'place', 'poke', 'invalid', 'pinch-grab'],
    }));
    expect(new DailyDrillProgress(saved).getSeenGestures()).toEqual(['poke', 'place', 'pinch-grab']);
    saved.setItem(FIRST_MINUTES_STORAGE_KEY, JSON.stringify({
      schema: FIRST_MINUTES_STORAGE_KEY, seenGestures: 'poke',
    }));
    expect(new DailyDrillProgress(saved).getSeenGestures()).toEqual([]);
  });

  it('keeps learned gestures usable in memory when storage fails', () => {
    const progress = new DailyDrillProgress({
      getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); },
    });
    progress.recordGestureSeen('place');
    progress.recordGestureSeen('place');
    expect(progress.getSeenGestures()).toEqual(['place']);
    expect(new GhostDemoTracker(progress.getSeenGestures()).start('place', 1_000)).toBe(false);
  });

  it('returns copies so callers cannot rewrite learned gestures', () => {
    const progress = new DailyDrillProgress(storage());
    progress.recordGestureSeen('poke');
    const seen = progress.getSeenGestures();
    seen.push('place');
    seen[0] = 'hold-to-confirm';
    expect(progress.getSeenGestures()).toEqual(['poke']);
  });
});

describe('streak and seven-day refresher dates', () => {
  it('has no date or streak without a valid pass', () => {
    expect(comeBackSummary([], now)).toEqual({ streakDays: 0 });
    expect(comeBackSummary([{ ...attempt(), passed: false }], now)).toEqual({ streakDays: 0 });
  });

  it('uses the latest valid pass rather than the latest attempt or certification issue', () => {
    expect(comeBackSummary([
      attempt('yesterday', '2026-10-07T10:00:00Z'),
      { ...attempt('failure', '2026-10-08T11:00:00Z'), passed: false },
      attempt('today', '2026-10-08T09:00:00Z'),
    ], now)).toEqual({ streakDays: 2, nextRefresherAt: '2026-10-15T09:00:00.000Z' });
  });

  it('counts one pass per UTC day and preserves yesterday grace', () => {
    expect(comeBackSummary([
      attempt('six-a', '2026-10-06T10:00:00Z'), attempt('six-b', '2026-10-06T11:00:00Z'),
      attempt('seven', '2026-10-07T10:00:00Z'),
    ], now)).toEqual({ streakDays: 2, nextRefresherAt: '2026-10-14T10:00:00.000Z' });
  });

  it('resets a streak after a missing UTC day without discarding the refresher date', () => {
    expect(comeBackSummary([attempt('old', '2026-10-06T10:00:00Z')], now))
      .toEqual({ streakDays: 0, nextRefresherAt: '2026-10-13T10:00:00.000Z' });
  });

  it('uses UTC day boundaries for offsets and handles month/year crossings', () => {
    expect(comeBackSummary([
      attempt('same-utc-a', '2026-12-31T23:30:00-02:00'), attempt('same-utc-b', '2027-01-01T03:00:00Z'),
    ], new Date('2027-01-01T12:00:00Z')))
      .toEqual({ streakDays: 1, nextRefresherAt: '2027-01-08T03:00:00.000Z' });
  });

  it('filters unsafe, low-score, invalid-date, future and out-of-scope passes', () => {
    const valid = attempt();
    expect(comeBackSummary([
      valid, { ...attempt('unsafe'), criticalErrors: ['unsafe'] },
      { ...attempt('low'), score: 79 }, { ...attempt('date'), completedAt: 'invalid' },
      attempt('future', '2026-10-09T10:00:00Z'), { ...attempt('module'), moduleId: 'road-zone' },
      { ...attempt('trainee'), traineeId: 'second' }, { ...attempt('crew'), crewId: 'other' },
    ], now, { traineeId: 'demo-trainee', crewId: 'electricity-01' }))
      .toEqual({ streakDays: 1, nextRefresherAt: '2026-10-15T10:00:00.000Z' });
  });
});

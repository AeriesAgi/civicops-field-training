import { describe, expect, it } from 'vitest';
import type { TrainingAttempt } from './contracts.js';
import { elecLotoModule } from './modules/elec-loto.js';
import { addValidityMonths, PROGRESS_STORAGE_KEY, TrainingProgress, type StorageLike } from './progress.js';

function attempt(id = 'first', completedAt = '2026-10-08T10:00:00.000Z', score = 100): TrainingAttempt {
  return {
    schema: 'civicops.training.attempt.v1', attemptId: id,
    moduleId: 'elec-loto', moduleVersion: 1, scenarioId: 'elec-loto-standard-1',
    traineeId: 'demo-trainee', crewId: 'electricity-01',
    startedAt: '2026-10-08T09:59:00.000Z', completedAt, durationMs: 60_000,
    steps: [], criticalErrors: [], score, passed: score >= 80, inputMode: 'hands',
    accessibility: { oneHanded: false, gazePinch: false, highContrast: false, captions: true, seated: true, benchHeightOffset: 0 },
    device: { runtime: 'emulated', deviceName: 'IWER' },
    instructor: { mode: 'scripted', hintsRequested: 0 },
  };
}

function memoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); } };
}

const now = new Date('2026-10-08T23:00:00.000Z');

describe('TrainingProgress', () => {
  it('starts without a certification', () => {
    expect(new TrainingProgress(memoryStorage()).certification(elecLotoModule, undefined, undefined, now))
      .toMatchObject({ level: 'none', passes: 0, bestScore: 0, streakDays: 0, evidenceAttemptIds: [] });
  });

  it('issues bronze after one pass and persists the evidence', () => {
    const storage = memoryStorage();
    const progress = new TrainingProgress(storage);
    const first = attempt();
    expect(progress.record(first)).toMatchObject({ level: 'bronze', passes: 1, issuedAt: first.completedAt });
    expect(new TrainingProgress(storage).getAttempts()).toEqual([first]);
  });

  it('issues silver after three passes at or above 80', () => {
    const progress = new TrainingProgress(memoryStorage());
    for (let index = 0; index < 3; index += 1) progress.record(attempt(`${index}`, `2026-10-0${index + 6}T10:00:00Z`, 80));
    expect(progress.certification(elecLotoModule, undefined, undefined, now)).toMatchObject({
      level: 'silver', passes: 3, issuedAt: '2026-10-08T10:00:00Z', streakDays: 3,
    });
  });

  it('issues gold for five scores at least 90 spread over three distinct UTC days', () => {
    const progress = new TrainingProgress(memoryStorage());
    const days = [6, 6, 7, 7, 8];
    days.forEach((day, index) => progress.record(attempt(`${index}`, `2026-10-0${day}T10:00:00Z`, 90)));
    expect(progress.certification(elecLotoModule, undefined, undefined, now)).toMatchObject({ level: 'gold', passes: 5, streakDays: 3 });
  });

  it('does not issue gold when five high-score passes span only two days', () => {
    const progress = new TrainingProgress(memoryStorage());
    [7, 7, 7, 8, 8].forEach((day, index) => progress.record(attempt(`${index}`, `2026-10-0${day}T10:00:00Z`, 100)));
    expect(progress.certification(elecLotoModule).level).toBe('silver');
  });

  it('waits for a third high-score day even if more than five attempts are needed', () => {
    const progress = new TrainingProgress(memoryStorage());
    [6, 6, 6, 7, 7, 8].forEach((day, index) => progress.record(attempt(`${index}`, `2026-10-0${day}T10:00:00Z`, 90)));
    expect(progress.certification(elecLotoModule)).toMatchObject({ level: 'gold', issuedAt: '2026-10-08T10:00:00Z', passes: 6 });
  });

  it('does not use scores below 90 as gold evidence', () => {
    const progress = new TrainingProgress(memoryStorage());
    [6, 6, 7, 7, 8].forEach((day, index) => progress.record(attempt(`${index}`, `2026-10-0${day}T10:00:00Z`, 89)));
    expect(progress.certification(elecLotoModule).level).toBe('silver');
  });

  it('keeps failure evidence but excludes failed, low-score, and critical attempts from passes', () => {
    const progress = new TrainingProgress(memoryStorage());
    progress.record({ ...attempt('failed'), passed: false });
    progress.record({ ...attempt('low', undefined, 79), passed: true });
    progress.record({ ...attempt('unsafe'), criticalErrors: ['touch-live-terminals'] });
    expect(progress.getAttempts()).toHaveLength(3);
    expect(progress.certification(elecLotoModule)).toMatchObject({ level: 'none', passes: 0, bestScore: 100 });
  });

  it('separates module, trainee, and crew evidence', () => {
    const progress = new TrainingProgress(memoryStorage());
    progress.record({ ...attempt('module'), moduleId: 'road-works' });
    progress.record({ ...attempt('trainee'), traineeId: 'second-trainee' });
    progress.record({ ...attempt('crew'), crewId: 'electricity-02' });
    expect(progress.certification(elecLotoModule).passes).toBe(0);
    expect(progress.certification(elecLotoModule, 'second-trainee').passes).toBe(1);
    expect(progress.certification(elecLotoModule, 'demo-trainee', 'electricity-02').passes).toBe(1);
  });

  it('deduplicates attempt IDs during recording and loading', () => {
    const storage = memoryStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify([attempt(), attempt()]));
    const progress = new TrainingProgress(storage);
    progress.record({ ...attempt(), score: 80 });
    expect(progress.getAttempts()).toHaveLength(1);
    expect(progress.getAttempts()[0].score).toBe(100);
  });

  it('continues with session evidence when reads or writes are unavailable', () => {
    const progress = new TrainingProgress({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } });
    expect(progress.record(attempt()).level).toBe('bronze');
    expect(progress.getAttempts()).toHaveLength(1);
  });

  it.each(['{broken', '{"attempts":[]}', '[null,{},42]'])('ignores a corrupt saved value %s', (value) => {
    const storage = memoryStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, value);
    expect(new TrainingProgress(storage).getAttempts()).toEqual([]);
  });

  it('skips malformed entries while retaining valid stored evidence', () => {
    const storage = memoryStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify([
      attempt('valid'), { ...attempt('partial'), device: null },
      { ...attempt('steps'), steps: [null] }, { ...attempt('date'), completedAt: 'invalid' },
      { ...attempt('score'), score: 101 }, { ...attempt('profile'), accessibility: {} },
    ]));
    expect(new TrainingProgress(storage).getAttempts().map((saved) => saved.attemptId)).toEqual(['valid']);
  });

  it('returns copies so callers cannot modify stored evidence', () => {
    const progress = new TrainingProgress(memoryStorage());
    const first = attempt();
    progress.record(first);
    first.score = 0;
    const saved = progress.getAttempts();
    saved[0].criticalErrors.push('mutated');
    expect(progress.getAttempts()[0]).toMatchObject({ score: 100, criticalErrors: [] });
  });

  it('continues a streak through yesterday, with no penalty before today is complete', () => {
    const progress = new TrainingProgress(memoryStorage());
    progress.record(attempt('six', '2026-10-06T10:00:00Z'));
    progress.record(attempt('seven', '2026-10-07T10:00:00Z'));
    expect(progress.certification(elecLotoModule, undefined, undefined, now).streakDays).toBe(2);
  });

  it('resets an inactive daily streak and counts repeat passes on a day once', () => {
    const progress = new TrainingProgress(memoryStorage());
    progress.record(attempt('first', '2026-10-06T10:00:00Z'));
    progress.record(attempt('second', '2026-10-06T11:00:00Z'));
    expect(progress.certification(elecLotoModule, undefined, undefined, now).streakDays).toBe(0);
    expect(progress.certification(elecLotoModule, undefined, undefined, new Date('2026-10-06T12:00:00Z')).streakDays).toBe(1);
  });

  it('uses UTC dates for distinct days and streaks', () => {
    const progress = new TrainingProgress(memoryStorage());
    progress.record(attempt('a', '2026-10-07T23:30:00-02:00'));
    progress.record(attempt('b', '2026-10-08T01:45:00Z'));
    expect(progress.certification(elecLotoModule, undefined, undefined, now).streakDays).toBe(1);
  });

  it('does not extend the issue date on another same-level pass', () => {
    const progress = new TrainingProgress(memoryStorage());
    progress.record(attempt('first', '2026-10-06T10:00:00Z'));
    progress.record(attempt('second', '2026-10-07T10:00:00Z'));
    expect(progress.certification(elecLotoModule).issuedAt).toBe('2026-10-06T10:00:00Z');
  });

  it('sorts out-of-order saved attempts before determining the upgrade date', () => {
    const storage = memoryStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify([attempt('c', '2026-10-08T10:00:00Z'), attempt('a', '2026-10-06T10:00:00Z'), attempt('b', '2026-10-07T10:00:00Z')]));
    expect(new TrainingProgress(storage).certification(elecLotoModule).issuedAt).toBe('2026-10-08T10:00:00Z');
  });
});

describe('calendar certification validity', () => {
  it('clamps month-end expiry while retaining the UTC time', () => {
    expect(addValidityMonths('2026-01-31T14:30:45.000Z', 1)).toBe('2026-02-28T14:30:45.000Z');
  });

  it('handles leap years and year boundaries', () => {
    expect(addValidityMonths('2027-08-31T00:00:00Z', 6)).toBe('2028-02-29T00:00:00.000Z');
    expect(addValidityMonths('2028-02-29T00:00:00Z', 12)).toBe('2029-02-28T00:00:00.000Z');
  });
});

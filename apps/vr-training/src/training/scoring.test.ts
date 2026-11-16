import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import schema from '../../../../contracts/training/attempt.v1.schema.json';
import { createScenario, elecLotoModule } from './modules/elec-loto';
import { hint, perform, start, type ProcedureState, type StepId } from './procedure';
import { buildAttempt, defaultAccessibility, passed, score } from './scoring';
import { DEFAULT_SETTINGS } from './accessibility-settings';
import { attemptAccessibility, attemptDevice } from './attempt-context';

const options = {
  startedAt: '2026-10-08T10:00:00.000Z',
  completedAt: '2026-10-08T10:01:00.000Z',
  attemptId: '0d98232f-0eb3-4b8a-9401-63b09eca0d8d',
};
const validator = new Ajv2020({ allErrors: true });
addFormats(validator);
const validate = validator.compile(schema);

function complete(initial = start(createScenario())): ProcedureState {
  return elecLotoModule.steps.reduce((state, definition) => perform(state, definition.id as StepId, definition.order * 1000), initial);
}

describe('training attempt scoring', () => {
  it('exports the active accessibility profile and headed emulator provenance', () => {
    const accessibility = attemptAccessibility({ ...DEFAULT_SETTINGS, oneHanded: true, gazePinch: true,
      highContrast: true, captions: false, benchHeightOffset: -0.2 });
    const attempt = buildAttempt(complete(), { ...options, accessibility, device: attemptDevice(true, { IWER_DEVICE: {} }) });
    expect(attempt.accessibility).toEqual({ oneHanded: true, gazePinch: true, highContrast: true,
      captions: false, seated: true, benchHeightOffset: -0.2 });
    expect(attempt.inputMode).toBe('gaze-hands');
    expect(attempt.device.runtime).toBe('emulated');
    expect(validate(attempt), JSON.stringify(validate.errors)).toBe(true);
  });

  it('records native evidence only for an immersive session without the emulator', () => {
    expect(attemptDevice(true, {}).runtime).toBe('native');
    expect(attemptDevice(false, {}).runtime).toBe('emulated');
    expect(attemptDevice(false, { IWER_DEVICE: {} }).runtime).toBe('emulated');
  });

  it('awards 100 to a clean completed attempt and serializes the canonical contract', () => {
    const state = complete();
    const attempt = buildAttempt(state, options);
    expect(score(state)).toBe(100);
    expect(passed(state)).toBe(true);
    expect(attempt.passed).toBe(true);
    expect(attempt.durationMs).toBe(60_000);
    expect(attempt.crewId).toBe('electricity-01');
    expect(attempt.accessibility.seated).toBe(true);
    expect(validate(attempt), JSON.stringify(validate.errors)).toBe(true);
  });

  it('deducts ten per ordering mistake and five per hint, passing at exactly 80', () => {
    let state = start(createScenario());
    state = perform(state, 'notify-control', 100);
    state = hint(hint(state, 200), 300);
    state = complete(state);
    expect(score(state)).toBe(80);
    expect(passed(state)).toBe(true);
    expect(buildAttempt(state, options).instructor.hintsRequested).toBe(2);
  });

  it('fails below the pass mark even when every step is correctly completed', () => {
    let state = start(createScenario());
    for (let index = 0; index < 5; index++) state = hint(state, index);
    state = complete(state);
    expect(score(state)).toBe(75);
    expect(passed(state)).toBe(false);
  });

  it('fails an unsafe attempt even with a score of 100', () => {
    const state = perform(start(createScenario()), 'safe-to-work', 100);
    const attempt = buildAttempt(state, options);
    expect(attempt.score).toBe(100);
    expect(attempt.passed).toBe(false);
    expect(attempt.criticalErrors).toHaveLength(1);
    expect(validate(attempt), JSON.stringify(validate.errors)).toBe(true);
  });

  it('fails a critical ordering mistake even after the trainee completes the procedure', () => {
    const state = complete(perform(start(createScenario()), 'apply-lock', 100));
    expect(score(state)).toBe(90);
    expect(passed(state)).toBe(false);
    expect(buildAttempt(state, options).passed).toBe(false);
  });

  it('floors the score at zero', () => {
    let state = start(createScenario());
    for (let index = 0; index < 30; index++) state = hint(state, index);
    expect(score(state)).toBe(0);
  });

  it('refuses to export unfinished attempts and invalid dates or identifiers', () => {
    expect(() => buildAttempt(start(createScenario()), options)).toThrow('Complete');
    const state = complete();
    expect(() => buildAttempt(state, { ...options, completedAt: 'bad' })).toThrow('timestamps');
    expect(() => buildAttempt(state, { ...options, completedAt: '2026-10-07T00:00:00Z' })).toThrow('timestamps');
    expect(() => buildAttempt(state, { ...options, attemptId: 'not-a-uuid' })).toThrow('UUID');
    expect(() => buildAttempt(state, { ...options, crewId: 'incorrect' })).toThrow('crewId');
  });

  it('respects all schema length limits after repeated mistakes and preserves unsafe evidence', () => {
    let state = start(createScenario());
    for (let index = 0; index < 100; index++) state = perform(state, 'notify-control', index);
    state = perform(state, { type: 'touch-terminals' }, 101);
    state = { ...state, scenario: { ...state.scenario, id: 'x'.repeat(200) }, criticalErrors: Array(40).fill('x'.repeat(200)) };
    const attempt = buildAttempt(state, {
      ...options, completedAt: '2026-10-08T12:00:00Z', traineeId: 't'.repeat(200),
      device: { runtime: 'native', deviceName: 'd'.repeat(200) },
      accessibility: { ...defaultAccessibility, benchHeightOffset: 2 },
    });
    expect(attempt.steps).toHaveLength(64);
    expect(attempt.steps.some((step) => step.outcome === 'unsafe')).toBe(true);
    expect(attempt.durationMs).toBe(3_600_000);
    expect(attempt.accessibility.benchHeightOffset).toBe(0.4);
    expect(validate(attempt), JSON.stringify(validate.errors)).toBe(true);
  });

  it('uses gaze-hands when gaze-pinch accessibility is enabled and copies user preferences', () => {
    const accessibility = { ...defaultAccessibility, oneHanded: true, gazePinch: true };
    const attempt = buildAttempt(complete(), { ...options, accessibility });
    expect(attempt.inputMode).toBe('gaze-hands');
    accessibility.oneHanded = false;
    expect(attempt.accessibility.oneHanded).toBe(true);
    expect(validate(attempt), JSON.stringify(validate.errors)).toBe(true);
  });
});

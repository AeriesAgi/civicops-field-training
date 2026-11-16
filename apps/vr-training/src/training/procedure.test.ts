import { describe, expect, it } from 'vitest';
import { createScenario, elecLotoModule } from './modules/elec-loto';
import { currentStep, getVoltage, hint, perform, start, type ProcedureState, type StepId } from './procedure';

function through(step: StepId, initial = start(createScenario())): ProcedureState {
  let state = initial;
  for (const definition of elecLotoModule.steps) {
    state = perform(state, definition.id as StepId, definition.order * 1000);
    if (definition.id === step) break;
  }
  return state;
}

describe('electrical isolation procedure', () => {
  it('completes the ordered standard lesson and reports zero volts only after isolation', () => {
    const initial = start(createScenario());
    expect(getVoltage(initial)).toBe(230);
    expect(currentStep(initial)?.id).toBe('identify-circuit');
    const isolated = through('switch-off');
    expect(getVoltage(isolated)).toBe(0);
    const complete = through('safe-to-work');
    expect(complete.completed).toBe(true);
    expect(complete.failed).toBe(false);
    expect(complete.steps.map((step) => step.outcome)).toEqual(Array(10).fill('correct'));
    expect(complete.physical.testerReproved).toBe(true);
    expect(currentStep(complete)).toBeUndefined();
  });

  it('keeps prior state and scenario immutable', () => {
    const scenario = createScenario(1);
    const initial = start(scenario);
    scenario.variations.length = 0;
    const next = perform(initial, { type: 'identify-circuit', breakerId: 'sl-3', schematicChecked: true }, 1000);
    expect(initial.steps).toEqual([]);
    expect(initial.physical.identified).toBe(false);
    expect(initial.scenario.variations).toEqual(['mislabelled-breaker']);
    expect(next.physical.identified).toBe(true);
  });

  it('records a recoverable noncritical ordering mistake without advancing', () => {
    const mistake = perform(start(createScenario()), 'notify-control', 300);
    expect(mistake.steps[0].outcome).toBe('out-of-order');
    expect(mistake.failed).toBe(false);
    expect(currentStep(mistake)?.id).toBe('identify-circuit');
    const identified = perform(mistake, 'identify-circuit', 500);
    expect(currentStep(identified)?.id).toBe('notify-control');
    expect(identified.physical.notified).toBe(false);
  });

  it('fails a safety-critical step performed out of order without granting isolation', () => {
    const mistake = perform(start(createScenario()), 'switch-off', 200);
    expect(mistake.failed).toBe(true);
    expect(mistake.criticalErrors).toHaveLength(1);
    expect(mistake.physical.breakerOff).toBe(false);
    expect(getVoltage(mistake)).toBe(230);
  });

  it('stops immediately if a hand touches the terminals before a successful dead test', () => {
    const failed = perform(through('prove-tester'), { type: 'touch-terminals' }, 8000);
    expect(failed.completed).toBe(true);
    expect(failed.failed).toBe(true);
    expect(failed.steps.find((step) => step.stepId === 'touch-terminals')?.outcome).toBe('unsafe');
    expect(failed.steps.find((step) => step.stepId === 'test-dead')?.outcome).toBe('skipped');
    expect(perform(failed, 'test-dead', 9000)).toBe(failed);
  });

  it('allows terminal contact after an actual successful dead test', () => {
    const tested = through('test-dead');
    expect(perform(tested, { type: 'touch-terminals' }, 8000)).toBe(tested);
    expect(tested.failed).toBe(false);
  });

  it('fails an early Safe to work confirmation even though that button is noncritical', () => {
    const failed = perform(start(createScenario()), 'safe-to-work', 10);
    expect(failed.completed).toBe(true);
    expect(failed.failed).toBe(true);
    expect(failed.steps[0].outcome).toBe('unsafe');
    expect(failed.physical.deadTested).toBe(false);
  });

  it('keeps SL-3 live after the wrong breaker is switched off and rejects testing it as dead', () => {
    const wrong = perform(through('notify-control'), { type: 'switch-off', breakerId: 'spare-1' }, 4000);
    expect(wrong.physical.wrongBreakerOff).toBe(true);
    expect(wrong.physical.breakerOff).toBe(false);
    expect(getVoltage(wrong)).toBe(230);
    const failed = perform(wrong, { type: 'test-dead', circuitId: 'spare-1' }, 5000);
    expect(failed.completed).toBe(true);
    expect(failed.steps.find((step) => step.outcome === 'unsafe')?.stepId).toBe('test-dead');
  });

  it('rejects a different test circuit even after correct isolation', () => {
    const failed = perform(through('prove-tester'), { type: 'test-dead', circuitId: 'spare-1' }, 7000);
    expect(failed.completed).toBe(true);
    expect(failed.failed).toBe(true);
  });

  it('requires the work-order schematic in the mislabelled variation', () => {
    let state = start(createScenario(1));
    state = perform(state, { type: 'identify-circuit', breakerId: 'sl-3' }, 1000);
    expect(state.physical.identified).toBe(false);
    expect(state.feedback).toContain('schematic');
    state = perform(state, { type: 'identify-circuit', breakerId: 'sl-3', schematicChecked: true }, 2000);
    expect(state.physical.identified).toBe(true);
    expect(currentStep(state)?.id).toBe('notify-control');
  });

  it('detects live backfeed and requires both secondary isolation and a lock to pass', () => {
    let state = through('prove-tester', start(createScenario(2)));
    expect(getVoltage(state)).toBe(230);
    state = perform(state, 'test-dead', 7000);
    expect(state.feedback).toContain('230 V');
    expect(state.failed).toBe(false);
    expect(state.physical.deadTested).toBe(false);
    expect(currentStep(state)?.id).toBe('test-dead');
    state = perform(state, { type: 'isolate-secondary' }, 8000);
    expect(getVoltage(state)).toBe(0);
    state = perform(state, { type: 'lock-secondary' }, 9000);
    state = perform(state, 'test-dead', 10_000);
    state = perform(state, 're-prove-tester', 11_000);
    state = perform(state, 'safe-to-work', 12_000);
    expect(state.completed).toBe(true);
    expect(state.failed).toBe(false);
  });

  it('fails testing a secondary source that was isolated but left unlocked', () => {
    let state = through('prove-tester', start(createScenario(2)));
    state = perform(state, { type: 'isolate-secondary' }, 7000);
    state = perform(state, 'test-dead', 8000);
    expect(state.failed).toBe(true);
    expect(state.physical.deadTested).toBe(false);
  });

  it('counts hints without completing steps and ignores hints after completion', () => {
    const hinted = hint(start(createScenario()), 15_000);
    expect(hinted.hintsUsed).toBe(1);
    expect(hinted.steps).toEqual([]);
    expect(hinted.feedback).toContain('Hint:');
    const complete = through('safe-to-work');
    expect(hint(complete, 30_000)).toBe(complete);
  });

  it('offers automatic coaching without penalising reading time or slower hand use', () => {
    const initial = start(createScenario());
    let coached = initial;
    for (let index = 1; index <= 20; index++) coached = hint(coached, index * 15_000, 'automatic');
    expect(coached.hintsUsed).toBe(0);
    expect(coached.steps).toEqual([]);
    expect(coached.physical).toEqual(initial.physical);
    expect(coached.feedback).toContain('Hint:');
    const requested = hint(coached, 301_000);
    expect(requested.hintsUsed).toBe(1);
    expect(perform(coached, 'safe-to-work', 302_000).failed).toBe(true);
  });

  it('records critical skips and prevents skipped actions from supplying physical prerequisites', () => {
    let state = perform(start(createScenario()), { type: 'skip' }, 10);
    expect(state.steps[0].outcome).toBe('skipped');
    state = perform(state, 'notify-control', 20);
    expect(state.physical.notified).toBe(false);
    const criticalSkip = perform(through('notify-control'), { type: 'skip' }, 3000);
    expect(criticalSkip.failed).toBe(true);
    expect(criticalSkip.physical.breakerOff).toBe(false);
  });

  it('uses finite monotonic integer timestamps', () => {
    let state = perform(start(createScenario()), 'identify-circuit', 15.7);
    state = perform(state, 'notify-control', -100);
    state = hint(state, Number.NaN);
    expect(state.steps.map((step) => step.atMs)).toEqual([16, 16]);
    expect(state.lastEventAtMs).toBe(16);
  });

  it('generates deterministic scenario variations and supports an explicit standard override', () => {
    expect(createScenario(7)).toEqual(createScenario(7));
    expect(createScenario(0).variations).toEqual([]);
    expect(createScenario(3).variations).toEqual(['mislabelled-breaker', 'backfeed']);
    expect(createScenario(3, []).variations).toEqual([]);
    expect(createScenario(3, ['unknown', 'backfeed', 'backfeed']).variations).toEqual(['backfeed']);
    expect(createScenario(Number.NaN).seed).toBe(0);
  });
});

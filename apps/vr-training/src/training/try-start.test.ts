import { describe, expect, it } from 'vitest';
import { createScenario, elecLotoModule } from './modules/elec-loto';
import { currentStep, perform, PROCEDURE_MESSAGES, start, type ProcedureState, type StepId } from './procedure';

function through(step: StepId): ProcedureState {
  let state = start(createScenario());
  for (const definition of elecLotoModule.steps) {
    state = perform(state, definition.id as StepId, definition.order * 1000);
    if (definition.id === step) break;
  }
  return state;
}

const last = (state: ProcedureState) => state.steps[state.steps.length - 1];

describe('try-start verification step', () => {
  it('is a critical step between tagging and proving the tester', () => {
    const ids = elecLotoModule.steps.map(step => step.id);
    expect(ids.indexOf('try-start')).toBe(ids.indexOf('apply-tag') + 1);
    expect(ids.indexOf('prove-tester')).toBe(ids.indexOf('try-start') + 1);
    expect(elecLotoModule.steps.find(step => step.id === 'try-start')?.critical).toBe(true);
  });

  it('records the held start attempt with clear feedback once locked and tagged', () => {
    const tagged = through('apply-tag');
    expect(currentStep(tagged)?.id).toBe('try-start');
    const tried = perform(tagged, 'try-start', 7000);
    expect(tried.physical.startTried).toBe(true);
    expect(last(tried)).toMatchObject({ stepId: 'try-start', outcome: 'correct' });
    expect(last(tried).note).toBe(PROCEDURE_MESSAGES['try-start-held']);
    expect(currentStep(tried)?.id).toBe('prove-tester');
  });

  it('is out of order before the lock and tag are on', () => {
    const off = through('switch-off');
    const early = perform(off, 'try-start', 5000);
    expect(early.physical.startTried).toBe(false);
    expect(last(early).outcome).not.toBe('correct');
  });

  it('cannot be skipped: proving the tester first is refused', () => {
    const tagged = through('apply-tag');
    const skipped = perform(tagged, 'prove-tester', 7000);
    expect(skipped.physical.testerProved).toBe(false);
    expect(last(skipped).outcome).not.toBe('correct');
  });
});

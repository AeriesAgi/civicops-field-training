import { describe, expect, it } from 'vitest';
import { createScenario, elecLotoModule } from '../training/modules/elec-loto';
import { perform, start, type StepId } from '../training/procedure';
import { lessonView } from './lesson-view';

describe('desktop lesson view', () => {
  it('shows ten steps with the first one current and full instructions when guided', () => {
    const view = lessonView(start(createScenario()), { caption: 'Hello', guidance: 'guided' });
    expect(view.steps).toHaveLength(10);
    expect(view.current?.id).toBe('identify-circuit');
    expect(view.current?.instruction).toBeTruthy();
    expect(view.steps.find(step => step.id === 'try-start')?.label).toBe('Try to switch SL-3 back on');
    expect(view.score).toBe(100);
  });

  it('never names the next action in unguided assessment', () => {
    const view = lessonView(start(createScenario()), { caption: '', guidance: 'unguided' });
    expect(view.current?.label).toBe('Step 1 of 10');
    expect(view.current?.instruction).toBe('');
    expect(view.steps.every(step => /^Step \d+$/.test(step.label))).toBe(true);
  });

  it('marks done steps, counts errors and completes after all ten actions', () => {
    let state = perform(start(createScenario()), 'switch-off', 100);
    let view = lessonView(state, { caption: '', guidance: 'guided', held: 'Padlock', reading: '230 V' });
    expect(view.errors).toBe(1);
    expect(view.score).toBeLessThan(100);
    expect(view.held).toBe('Padlock');
    state = start(createScenario());
    for (const step of elecLotoModule.steps) state = perform(state, step.id as StepId, step.order * 1000);
    view = lessonView(state, { caption: '', guidance: 'guided' });
    expect(view.completed).toBe(true);
    expect(view.steps.every(step => step.status === 'done')).toBe(true);
  });
});

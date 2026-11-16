import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAIN_STEPS, type RainEvent } from './roads-incident';
import { hintRoads, performRoads, startRoads, type RoadsEvent, type RoadsState } from './roads-procedure';
import { createRoadsScenario } from './modules/roads-zone';
import { UNGUIDED_BRIEF } from './guidance';
import { roadsGuidedFeedback, roadsIncidentCaption, roadsOpening } from './roads-guidance';

const start = () => startRoads(createRoadsScenario(0, ['rain-incident']));
const act = (s: RoadsState, e: RoadsEvent) => performRoads(s, e, s.lastEventAtMs + 1000);
const INSTRUCTIONS = Object.values(RAIN_STEPS).map(step => step.instruction);

describe('Roads rain incident guidance', () => {
  it('starts the rain incident in the refuge phase', () => {
    expect(start().rainPhase).toBe('refuge');
  });

  it('guided practice keeps volunteering the next incident instruction', () => {
    const previous = start(), next = act(previous, 'incident:refuge');
    expect(next.rainPhase).toBe('radio');
    expect(roadsGuidedFeedback(previous, next, 'guided')).toBe(next);
    expect(next.feedback).toBe(RAIN_STEPS.radio.instruction);
    expect(roadsIncidentCaption(next, 'guided')).toBe(RAIN_STEPS.radio.instruction);
  });

  it('unguided acknowledges a correct incident step without the next instruction', () => {
    let state = roadsOpening(start(), 'unguided');
    for (const [event, phase] of [['incident:refuge', 'refuge'], ['incident:radio', 'radio']] as const) {
      const previous = state;
      state = roadsGuidedFeedback(previous, act(previous, event as RainEvent), 'unguided');
      expect(state.feedback).toBe(`Recorded: ${RAIN_STEPS[phase].action}.`);
      for (const instruction of INSTRUCTIONS) expect(state.feedback).not.toContain(instruction);
      expect(roadsIncidentCaption(state, 'unguided')).toBe(state.feedback);
    }
    expect(state.rainPhase).toBe('traffic');
    // The attempt record keeps the reducer notes for the debrief.
    expect(state.steps.filter(step => step.outcome === 'correct').map(step => step.stepId)).toEqual(['incident-refuge', 'incident-radio']);
  });

  it('unguided opens on the assessment brief, not the refuge instruction', () => {
    const opening = roadsOpening(start(), 'unguided');
    expect(opening.feedback).toBe(UNGUIDED_BRIEF);
    expect(roadsIncidentCaption(opening, 'unguided')).toBe(UNGUIDED_BRIEF);
    expect(roadsOpening(start(), 'guided')).toEqual(start());
  });

  it('unguided still steps in on unsafe actions and out-of-order mistakes', () => {
    const opening = roadsOpening(start(), 'unguided');
    const unsafe = act(opening, 'incident:enter-lane');
    expect(unsafe.failed).toBe(true);
    expect(roadsGuidedFeedback(opening, unsafe, 'unguided').feedback).toBe(unsafe.feedback);
    const early = act(opening, 'brief-driver');
    expect(roadsGuidedFeedback(opening, early, 'unguided').feedback).toBe(early.feedback);
    const wrongOrder = act(opening, 'incident:radio');
    expect(wrongOrder.steps.some(step => step.outcome === 'out-of-order')).toBe(true);
    expect(roadsGuidedFeedback(opening, wrongOrder, 'unguided').feedback).toBe(wrongOrder.feedback);
  });

  it('a requested hint is still shown in unguided mode', () => {
    const opening = roadsOpening(start(), 'unguided');
    const hinted = hintRoads(opening, 1000);
    expect(hinted.feedback).toContain(RAIN_STEPS.refuge.instruction);
    expect(roadsIncidentCaption(hinted, 'unguided')).toBe(hinted.feedback);
  });

  it('the Roads system routes incident speech and captions through the guidance helpers', () => {
    const source = readFileSync('src/roads-training-system.ts', 'utf8');
    expect(source).toContain('roadsGuidedFeedback(previous,performRoads(');
    expect(source).toContain('roadsIncidentCaption(this.state,this.instructor.guidance)');
    expect(source.match(/roadsOpening\(/g)?.length).toBe(2);
    expect(source).not.toContain("this.text('steps','caption',formatTrainingCaption(RAIN_STEPS[phase].instruction))");
  });
});
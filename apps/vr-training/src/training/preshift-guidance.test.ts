import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRAINING_PROGRAMMES } from './programmes';
import { answerPreparation, startPreparation, type PreparationState } from './programme-state';
import { UNGUIDED_BRIEF } from './guidance';
import { preShiftView, UNGUIDED_RETRY } from './preshift-guidance';

const MODULES = Object.keys(TRAINING_PROGRAMMES);

function answerCorrectly(state: PreparationState, count: number): PreparationState {
  for (let i = 0; i < count; i += 1) state = answerPreparation(state, TRAINING_PROGRAMMES[state.moduleId].checks[state.index].correct);
  return state;
}
function firstCheck(moduleId: string, critical: boolean): number {
  return TRAINING_PROGRAMMES[moduleId].checks.findIndex(check => Boolean(check.critical) === critical);
}

describe('pre-shift board guidance', () => {
  it('covers every live programme with at least one critical and one non-critical check', () => {
    expect(MODULES.sort()).toEqual(['elec-loto', 'roads-zone', 'scene-safety', 'water-burst']);
    for (const id of MODULES) {
      expect(firstCheck(id, true), id).toBeGreaterThanOrEqual(0);
      expect(firstCheck(id, false), id).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the guided board exactly as before: prompt read aloud with coaching feedback', () => {
    for (const id of MODULES) {
      const state = startPreparation(id), check = TRAINING_PROGRAMMES[id].checks[0];
      const view = preShiftView(state, 'guided');
      expect(view.progress).toBe(`PRE-SHIFT / ${check.phase.toUpperCase()} / 1 OF ${TRAINING_PROGRAMMES[id].checks.length}`);
      expect(view.feedback).toBe(state.feedback);
      expect(view.spoken).toBe(`${check.prompt} ${state.feedback}`);
    }
  });

  it('guided wrong non-critical answers still coach with the remediation', () => {
    for (const id of MODULES) {
      const index = firstCheck(id, false), check = TRAINING_PROGRAMMES[id].checks[index];
      const wrong = answerPreparation(answerCorrectly(startPreparation(id), index), 1 - check.correct);
      expect(preShiftView(wrong, 'guided').feedback).toBe(check.remediation);
      expect(preShiftView(wrong, 'guided').spoken).toBe(`${check.prompt} ${check.remediation}`);
    }
  });

  it('unguided opens with the assessment brief and never reads a check prompt aloud', () => {
    for (const id of MODULES) {
      let state = startPreparation(id);
      const programme = TRAINING_PROGRAMMES[id];
      const opening = preShiftView(state, 'unguided');
      expect(opening.feedback).toBe(UNGUIDED_BRIEF);
      expect(opening.spoken).toBe(UNGUIDED_BRIEF);
      expect(opening.progress).toBe(`UNGUIDED / ${programme.checks[0].phase.toUpperCase()} / 1 OF ${programme.checks.length}`);
      while (state.phase === 'checking') {
        const view = preShiftView(state, 'unguided');
        for (const check of programme.checks) expect(view.spoken ?? '').not.toContain(check.prompt);
        state = answerPreparation(state, programme.checks[state.index].correct);
      }
      expect(state.phase).toBe('ready');
      expect(preShiftView(state, 'unguided').progress).toBe('PRE-SHIFT COMPLETE / READY');
    }
  });

  it('unguided does not reveal the answer after a non-critical mistake', () => {
    for (const id of MODULES) {
      const index = firstCheck(id, false), check = TRAINING_PROGRAMMES[id].checks[index];
      const wrong = answerPreparation(answerCorrectly(startPreparation(id), index), 1 - check.correct);
      expect(wrong.phase).toBe('checking');
      const view = preShiftView(wrong, 'unguided');
      expect(view.feedback).toBe(UNGUIDED_RETRY);
      expect(view.spoken).toBe(UNGUIDED_RETRY);
      expect(view.feedback).not.toContain(check.remediation);
      // The attempt record keeps the remediation for the supervisor debrief.
      expect(wrong.steps[wrong.steps.length - 1]?.note).toBe(check.remediation);
    }
  });

  it('unguided still steps in on an unsafe answer with the full safety remediation', () => {
    for (const id of MODULES) {
      const index = firstCheck(id, true), check = TRAINING_PROGRAMMES[id].checks[index];
      const stopped = answerPreparation(answerCorrectly(startPreparation(id), index), 1 - check.correct);
      expect(stopped.phase).toBe('stopped');
      const view = preShiftView(stopped, 'unguided');
      expect(view.progress).toBe('SAFETY STOP / ATTEMPT FAILED');
      expect(view.feedback).toBe(check.remediation);
      expect(view.spoken).toBe(check.remediation);
    }
  });

  it('acknowledges a correct unguided answer without volunteering the next prompt', () => {
    const state = answerCorrectly(startPreparation('elec-loto'), 1);
    const view = preShiftView(state, 'unguided');
    expect(view.feedback).toBe(state.feedback);
    expect(view.spoken).toBe(state.feedback);
  });

  it('the department board renders and speaks through the guidance view', () => {
    const source = readFileSync('src/module-board-system.ts', 'utf8');
    expect(source).toContain('preShiftView(state, this.guidance)');
    expect(source).toMatch(/guidance: this\.guidance/);
    expect(source).toMatch(/this\.guidance = loadGuidance\(browserStorage\(\), globalThis\.location\?\.search \?\? ''\)/);
    expect(source).not.toContain('${check.prompt} ${state.feedback}');
  });
});

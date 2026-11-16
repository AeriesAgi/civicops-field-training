import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNGUIDED_BRIEF } from './guidance';
import { guidanceCaption, guidanceStatus, STEP_RECORDED, UNGUIDED_STATUS, waterStepTitle } from './caption-guidance';
import { waterStepLines } from './modules/water-burst';
import { sceneStepLines } from './modules/scene-safety';
import { hintWater, performWater, startWater } from './water-procedure';
import { goodFireEvents, hintFire, performFire, startFire } from './scene-safety-procedure';

const WATER = Object.values(waterStepLines).map(line => line.instruction);
const FIRE = Object.values(sceneStepLines).map(line => line.instruction);

describe('module step captions in guided and unguided modes', () => {
  it('guided keeps the authored step caption', () => {
    expect(guidanceCaption('guided', 'Place the barrier and sign.', startWater().feedback, WATER)).toBe('Place the barrier and sign.');
    expect(guidanceCaption('guided', 'Pinch the engine.', startFire().feedback, FIRE)).toBe('Pinch the engine.');
  });

  it('unguided opens Water and Fire on the assessment brief, not the first instruction', () => {
    expect(WATER).toContain(startWater().feedback);
    expect(FIRE).toContain(startFire().feedback);
    expect(guidanceCaption('unguided', 'Place the barrier and sign.', startWater().feedback, WATER)).toBe(UNGUIDED_BRIEF);
    expect(guidanceCaption('unguided', 'Pinch the engine.', startFire().feedback, FIRE)).toBe(UNGUIDED_BRIEF);
  });

  it('unguided shows what happened in Water, never the next instruction', () => {
    let state = startWater();
    for (const event of ['place-barriers', 'place-sign', 'set-spoil-back'] as const) {
      state = performWater(state, event, state.lastEventAtMs + 5000);
      const caption = guidanceCaption('unguided', 'Poke the network plan. C supplies the hospital: keep open.', state.feedback, WATER);
      expect([state.feedback, STEP_RECORDED]).toContain(caption);
      expect(WATER).not.toContain(caption);
      expect(caption).not.toContain('Poke the network plan');
    }
    expect(state.steps.some(step => step.stepId === 'make-area-safe' && step.outcome === 'correct')).toBe(true);
  });

  it('unguided never captions a Fire step instruction across a full correct run', () => {
    let state = startFire(), at = 0;
    for (const event of goodFireEvents()) {
      state = performFire(state, event, at += 1000);
      const caption = guidanceCaption('unguided', 'authored copy', state.feedback, FIRE);
      expect(FIRE).not.toContain(caption);
      expect(caption).not.toBe('authored copy');
    }
    expect(state.completed).toBe(true);
  });

  it('a completed Water step is acknowledged, not restated as its instruction', () => {
    const done = performWater(performWater(performWater(startWater(), 'place-barriers', 5000), 'place-sign', 10000), 'set-spoil-back', 15000);
    expect(done.feedback).toBe(`${waterStepLines['make-area-safe'].instruction} Complete.`);
    const compact = (text: string) => text.split('. ')[0] + '.';
    expect(guidanceCaption('unguided', 'x', done.feedback, WATER, compact)).toBe(STEP_RECORDED);
    expect(guidanceCaption('unguided', 'x', 'Barrier placed. Keep going.', WATER, compact)).toBe('Barrier placed.');
    expect(guidanceCaption('guided', 'x', done.feedback, WATER, compact)).toBe('x');
  });

  it('a requested hint still shows in unguided mode', () => {
    const water = hintWater(startWater(), 1000), fire = hintFire(startFire(), 1000);
    expect(water.feedback.startsWith('Hint:')).toBe(true);
    expect(guidanceCaption('unguided', 'x', water.feedback, WATER)).toBe(water.feedback);
    expect(guidanceCaption('unguided', 'x', fire.feedback, FIRE)).toBe(fire.feedback);
  });

  it('the Fire controls status names the mode, not the step, when unguided', () => {
    expect(guidanceStatus('guided', 'Pinch the engine.')).toBe('Pinch the engine.');
    expect(guidanceStatus('unguided', 'Pinch the engine.')).toBe(UNGUIDED_STATUS);
    for (const instruction of FIRE) expect(UNGUIDED_STATUS).not.toContain(instruction);
  });

  it('the seized-valve Water title only names the alternate route when guided', () => {
    expect(waterStepTitle('identify-valves', true, 'guided', 'Plan the closure')).toBe('Plan A then D');
    expect(waterStepTitle('identify-valves', true, 'unguided', 'Plan the closure')).toBe('Plan the closure');
    expect(waterStepTitle('identify-valves', false, 'guided', 'Plan the closure')).toBe('Plan the closure');
    expect(waterStepTitle('close-valves', true, 'guided', 'Close slowly')).toBe('Close slowly');
  });

  it('Water and Fire systems route every step caption through the guidance helpers', () => {
    const water = readFileSync('src/water-training-system.ts', 'utf8');
    expect(water).toContain('guidanceCaption(this.instructor.guidance, SHORT_CAPTIONS[this.stepId], this.state.feedback, WATER_INSTRUCTIONS, (text) => this.compactCaption(text))');
    expect(water).toContain('waterStepTitle(this.stepId, alternate, this.instructor.guidance');
    expect(water).not.toContain("this.text('steps', 'caption', SHORT_CAPTIONS[this.stepId]);");
    const fire = readFileSync('src/scene-safety-training-system.ts', 'utf8');
    expect(fire).not.toContain("this.text('steps', 'caption', formatTrainingCaption(COPY[step]));");
    expect(fire).not.toContain("this.text('steps', 'caption', formatTrainingCaption(COPY['place-blocker']));");
    expect(fire).toContain('guidanceCaption(this.instructor.guidance, line, this.state.feedback, FIRE_INSTRUCTIONS)');
    expect(fire).toContain("guidanceStatus(this.instructor.guidance, COPY[step])");
    expect(fire).not.toContain("'STOPPED\\nStep back and reset.' : COPY[step]");
    expect(fire.match(/guidanceCaption\(this\.instructor\.guidance,/g)?.length).toBe(3);
  });
});
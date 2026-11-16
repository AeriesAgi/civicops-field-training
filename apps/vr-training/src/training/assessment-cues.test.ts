import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assessmentFeedback, assessmentStepTitle, automaticCoaching, incidentStepTitle, roadsZoneStatus,
  UNGUIDED_FEEDBACK, waterNetworkStatus, waterTurnGuide, WATER_SEIZED_UNGUIDED, WATER_SEIZED_UNGUIDED_SHORT,
} from './assessment-cues';
import { roadsGuidedFeedback, roadsOpening } from './roads-guidance';
import { performRoads, startRoads, type RoadsEvent, type RoadsState } from './roads-procedure';
import { createRoadsScenario } from './modules/roads-zone';
import { WATER_FEEDBACK } from './water-procedure';
import { RAIN_STEPS } from './roads-incident';

const source = (path: string) => readFileSync(path, 'utf8');

describe('unguided assessment cues across all four programmes', () => {
  it('uses one neutral step title in every module when unguided; guided keeps the authored title', () => {
    expect(assessmentStepTitle('guided', 'Angle the engine', 1, 7)).toBe('Angle the engine');
    expect(assessmentStepTitle('unguided', 'Angle the engine', 1, 7)).toBe('Step 1 of 7');
    expect(assessmentStepTitle('unguided', 'Plan A then B', 2, 7)).toBe('Step 2 of 7');
    expect(assessmentStepTitle('unguided', 'Notify control', 2, 9)).toBe('Step 2 of 9');
  });

  it('numbers Roads incident phases instead of naming the next action', () => {
    const shown = ['refuge', 'radio', 'tape', 'assist', 'record', 'schedule'] as const;
    for (const phase of shown) {
      expect(incidentStepTitle('guided', RAIN_STEPS[phase].title, phase)).toBe(RAIN_STEPS[phase].title);
      const title = incidentStepTitle('unguided', RAIN_STEPS[phase].title, phase);
      expect(title).toMatch(/^Incident step [1-7] of 7$/);
      expect(title).not.toContain(RAIN_STEPS[phase].title);
    }
    expect(incidentStepTitle('unguided', RAIN_STEPS.radio.title, 'radio')).toBe('Incident step 2 of 7');
  });

  it('only guided practice runs automatic coaching (target glow, idle hints, auto demos)', () => {
    expect(automaticCoaching('guided')).toBe(true);
    expect(automaticCoaching('unguided')).toBe(false);
  });

  it('removes Water network and valve giveaways when unguided', () => {
    expect(waterNetworkStatus('guided', false, false, false)).toBe('A-D: use if B seized');
    expect(waterNetworkStatus('guided', false, true, false)).toBe('B SEIZED / USE A-D');
    expect(waterNetworkStatus('guided', true, true, false)).toBe('ROUTE A-D / C PROTECTED');
    expect(waterNetworkStatus('unguided', false, true, false)).toBe('PLAN THE ISOLATION');
    expect(waterNetworkStatus('unguided', false, true, true)).toBe('B SEIZED / REPLAN');
    expect(waterNetworkStatus('unguided', true, false, false)).toBe('ROUTE A-B / C PROTECTED');
    for (const status of [waterNetworkStatus('unguided', false, true, true), waterNetworkStatus('unguided', false, false, false)]) expect(status).not.toContain('A-D');
    expect(waterTurnGuide('guided', true)).toBe('Roll clockwise slowly.\nLift up to move key.');
    expect(waterTurnGuide('guided', false)).toBe('Lift cover. Seat key.\nRoll slowly. Regrip.');
    for (const seated of [true, false]) expect(waterTurnGuide('unguided', seated).toLowerCase()).not.toContain('slow');
  });

  it('keeps the seized-valve event and its safety line but drops the A-D answer when unguided', () => {
    expect(WATER_FEEDBACK.seized).toContain('A-D');
    expect(UNGUIDED_FEEDBACK[WATER_FEEDBACK.seized]).toBe(WATER_SEIZED_UNGUIDED);
    for (const text of [WATER_SEIZED_UNGUIDED, WATER_SEIZED_UNGUIDED_SHORT]) {
      expect(text).toContain('seized'); expect(text).toContain('Do not force it'); expect(text).not.toContain('A-D');
    }
    expect(WATER_SEIZED_UNGUIDED_SHORT.length).toBeLessThanOrEqual(65);
  });

  it('trims next-step cues from success feedback, keeping the acknowledgement', () => {
    const procedures = source('src/training/water-procedure.ts') + source('src/training/roads-procedure.ts');
    for (const [guided, unguided] of Object.entries(UNGUIDED_FEEDBACK)) {
      if (guided !== WATER_FEEDBACK.seized) expect(procedures, guided).toContain(guided);
      expect(unguided.length).toBeLessThan(guided.length);
      expect(guided.startsWith(unguided.split('.')[0])).toBe(true);
    }
    for (const cue of ['Check the beacon', 'confirm sight lines', 'Check sight lines', 'Poke Run traffic', 'confirm zero flow'])
      for (const unguided of Object.values(UNGUIDED_FEEDBACK)) expect(unguided).not.toContain(cue);
    const state = { feedback: WATER_FEEDBACK.seized, steps: [] };
    expect(assessmentFeedback(state, 'guided')).toBe(state);
    expect(assessmentFeedback(state, 'unguided').feedback).toBe(WATER_SEIZED_UNGUIDED);
    const plain = { feedback: 'Hazard noted.' };
    expect(assessmentFeedback(plain, 'unguided')).toBe(plain);
  });

  it('applies the trims through the Roads reducer path', () => {
    const act = (s: RoadsState, e: RoadsEvent) => performRoads(s, e, s.lastEventAtMs + 1000);
    let state = roadsOpening(startRoads(createRoadsScenario(0, ['rain-incident'])), 'unguided');
    for (const event of ['incident:refuge', 'incident:radio'] as const) state = roadsGuidedFeedback(state, act(state, event), 'unguided');
    const briefed = act(state, 'brief-driver');
    expect(briefed.feedback).toContain('Check the beacon before unloading.');
    expect(roadsGuidedFeedback(state, briefed, 'unguided').feedback).toBe('Driver brief acknowledged. Van parked in the upstream service bay.');
    expect(roadsGuidedFeedback(state, briefed, 'guided').feedback).toBe(briefed.feedback);
  });

  it('keeps the Roads zone status neutral on a blind bend when unguided', () => {
    expect(roadsZoneStatus('guided', 'BEND / Warn earlier')).toBe('BEND / Warn earlier');
    expect(roadsZoneStatus('unguided', 'BEND / Warn earlier')).toBe('Place freely. Check your zone.');
    expect(roadsZoneStatus('unguided', 'CLEAR / Ready to run')).toBe('CLEAR / Ready to run');
  });

  it('wires every module through the cues', () => {
    const elec = source('src/training-system.ts');
    expect(elec).toContain('assessmentStepTitle(this.instructor.guidance, DISPLAY_STEPS[step.order - 1], step.order, DISPLAY_STEPS.length)');
    expect(elec).toContain("automaticCoaching(this.instructor.guidance) && !!this.greeted && this.canAct() && entity.object3D?.name === targetName");
    expect(elec).toMatch(/this\.idleHints\.tick\(delta, automaticCoaching\(this\.instructor\.guidance\) &&/);
    expect(elec.match(/automaticCoaching\(this\.instructor\.guidance\) && !this\.settingsOpen && !this\.demos\.activeGesture/g)?.length).toBe(2);
    const water = source('src/water-training-system.ts');
    expect(water).toContain('assessmentStepTitle(this.instructor.guidance, waterStepTitle(');
    expect(water).toContain('waterNetworkStatus(this.instructor.guidance, this.state.physical.schematicChecked, alternate, this.networkRecovery)');
    expect(water).toContain('waterTurnGuide(this.instructor.guidance, !!this.keyValve)');
    expect(water).toContain('assessmentFeedback(performWater(previous, event');
    expect(water).toContain("this.instructor.guidance === 'unguided' ? WATER_SEIZED_UNGUIDED_SHORT");
    const roads = source('src/roads-training-system.ts');
    expect(roads).toContain('assessmentStepTitle(this.instructor.guidance,TITLES[step]');
    expect(roads).toContain('incidentStepTitle(this.instructor.guidance,RAIN_STEPS[phase].title,phase)');
    expect(roads).toContain('guidanceCaption(this.instructor.guidance,COPY[step],this.state.feedback,ROADS_INSTRUCTIONS)');
    expect(roads).toContain("step==='advance-warning'&&automaticCoaching(this.instructor.guidance)");
    expect(roads).toContain('roadsZoneStatus(this.instructor.guidance,');
    const fire = source('src/scene-safety-training-system.ts');
    expect(fire).toContain('assessmentStepTitle(this.instructor.guidance, TITLES[step]');
  });
});
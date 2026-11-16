import { describe, expect, it } from 'vitest';
import { buildAttempt, passed, score } from './scoring';
import { createFireDailyDrill, createFireScenario, SCENE_SAFETY_NOTICE, SCENE_SCALE_NOTICE, sceneSafetyModule } from './modules/scene-safety';
import { goodFireEvents, performFire, startFire } from './scene-safety-procedure';
import {
  TRIAGE_TAGS, assessApproach, assessBlocker, assessExclusion, assessTaper, buildHandover, casualtyCardCopy,
  classifyCasualty, createGoodFireLayout, parseSceneHandover, sceneCasualties, type CasualtyVitals, type TriageTag,
} from './scene-safety-geometry';

const timestamps = { startedAt: '2026-10-12T18:00:00.000Z', completedAt: '2026-10-12T18:06:00.000Z', attemptId: 'e2e00004-0000-4000-8000-000000000004' };
const layout = createGoodFireLayout();

function play(seed = 0, at = 1000) {
  const scenario = createFireScenario(seed);
  let state = startFire(scenario);
  for (const event of goodFireEvents(scenario)) state = performFire(state, event, state.lastEventAtMs + at);
  return state;
}

describe('scene safety geometry and triage', () => {
  it('accepts the authored full-scale layout and rejects compressed tabletop distances', () => {
    expect(assessBlocker(layout.blocker).ok).toBe(true);
    expect(assessTaper(layout.cones, layout.flares)).toEqual({ conesOk: true, flaresOk: true });
    expect(assessExclusion(layout.exclusion)).toBe(true);
    expect(assessApproach(layout.approach).ok).toBe(true);
    expect(sceneSafetyModule.steps).toHaveLength(7);
    expect(SCENE_SCALE_NOTICE).toContain('Full-scale');
    expect(SCENE_SAFETY_NOTICE).toContain('authorised person decides');
    expect(SCENE_SAFETY_NOTICE).toContain('not patient care');
  });

  it.each([
    [{ walking: true, breathing: true, breathsPerMinute: 18, radialPulse: true, obeysCommands: true }, 'minor'],
    [{ walking: false, breathing: true, breathsPerMinute: 22, radialPulse: true, obeysCommands: true }, 'delayed'],
    [{ walking: false, breathing: true, breathsPerMinute: 36, radialPulse: true, obeysCommands: true }, 'immediate'],
    [{ walking: false, breathing: true, breathsPerMinute: 16, radialPulse: false, obeysCommands: true }, 'immediate'],
    [{ walking: false, breathing: true, breathsPerMinute: 16, radialPulse: true, obeysCommands: false }, 'immediate'],
    [{ walking: false, breathing: false, breathsPerMinute: 0, radialPulse: false, obeysCommands: false }, 'expectant'],
    [{ walking: true, breathing: false, breathsPerMinute: 0, radialPulse: false, obeysCommands: false }, 'minor'],
  ] as const)('classifies %j as %s', (vitals, tag) => {
    const casualty = { id: 'c2', vest: 2, ...vitals } as CasualtyVitals;
    expect(classifyCasualty(casualty)).toBe(tag);
  });

  it('gives every tag a shape and a word, not colour alone', () => {
    const shapes = new Set(Object.values(TRIAGE_TAGS).map((tag) => tag.shape));
    const labels = new Set(Object.values(TRIAGE_TAGS).map((tag) => tag.label));
    expect(shapes.size).toBe(4);
    expect(labels.size).toBe(4);
    expect(casualtyCardCopy(sceneCasualties(createFireScenario(0))[2]).body.split('\n')).toHaveLength(4);
  });

  it('deteriorates vest 2 on the daily variant and keeps vest numbers anonymous', () => {
    const standard = sceneCasualties(createFireScenario(0));
    const deteriorated = sceneCasualties(createFireScenario(1));
    expect(classifyCasualty(standard[1])).toBe('delayed');
    expect(classifyCasualty(deteriorated[1])).toBe('immediate');
    expect(deteriorated.map((casualty) => casualty.vest)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(deteriorated)).not.toMatch(/name|face|photo|plate/i);
    const drill = createFireDailyDrill(new Date('2026-10-12T12:00:00.000Z'));
    expect(['standard', 'deteriorating-casualty']).toContain(drill.variation);
    expect(drill.scenario.moduleId).toBe('scene-safety');
  });
});

describe('scene safety procedure faults', () => {
  it('completes a correct on-time scene at 100', () => {
    const state = play(0);
    const attempt = buildAttempt(state, timestamps, sceneSafetyModule);
    expect(state.failed).toBe(false);
    expect(passed(state, sceneSafetyModule)).toBe(true);
    expect(score(state)).toBe(100);
    expect(attempt).toMatchObject({ moduleId: 'scene-safety', passed: true, score: 100, crewId: 'fire-01' });
    expect(state.handover?.cableStatus).toBe('treat-as-live');
    expect(state.handover?.unitsNeeded).toContain('Electricity isolation');
  });

  it('completes the deteriorating daily drill when vest 2 is retagged immediate', () => {
    const state = play(1);
    expect(state.handover?.categories.immediate).toBe(2);
    expect(state.handover?.categories.delayed).toBe(0);
    expect(score(state)).toBe(100);
  });

  it.each([
    ['downstream', { ...layout.blocker!, z: -2 }, 'downstream'],
    ['live lane', { ...layout.blocker!, x: 2.4 }, 'live lane'],
  ] as const)('stops when the engine is parked %s', (_name, placement, fault) => {
    const state = performFire(startFire(), { type: 'place', kind: 'blocker', placement }, 1000);
    expect(state.failed).toBe(true);
    expect(state.criticalErrors[0].toLowerCase()).toContain(fault);
    expect(passed(state, sceneSafetyModule)).toBe(false);
  });

  it('stops when a foot enters the cable exclusion or a live lane', () => {
    const started = startFire();
    const cable = performFire(started, { type: 'stand', x: -6.2, z: 2.4 }, 1000);
    expect(cable.failed).toBe(true);
    expect(cable.criticalErrors[0]).toContain('exclusion');
    const lane = performFire(started, { type: 'stand', x: 2.2, z: 4 }, 1000);
    expect(lane.failed).toBe(true);
    expect(lane.criticalErrors[0]).toContain('live lane');
  });

  it.each(['c3', 'c4'] as const)('stops when critical vest %s is tagged minor', (casualtyId) => {
    let state = startFire();
    state = performFire(state, { type: 'tag', casualtyId, tag: 'minor' }, 1000);
    expect(state.failed).toBe(true);
    expect(state.criticalErrors[0]).toContain('critical');
    expect(passed(state, sceneSafetyModule)).toBe(false);
  });

  it('stops when the deteriorated daily casualty is tagged minor', () => {
    const state = performFire(startFire(createFireScenario(1)), { type: 'tag', casualtyId: 'c2', tag: 'minor' }, 1000);
    expect(state.failed).toBe(true);
    expect(classifyCasualty(sceneCasualties(createFireScenario(1))[1])).toBe('immediate');
  });

  it('does not complete triage when a delayed casualty is tagged expectant', () => {
    let state = startFire();
    for (const event of goodFireEvents().slice(0, -2)) state = performFire(state, event, state.lastEventAtMs + 1000);
    state = performFire(state, { type: 'tag', casualtyId: 'c2', tag: 'expectant' }, state.lastEventAtMs + 1000);
    expect(state.failed).toBe(false);
    expect(state.completed).toBe(false);
    expect(state.steps.some((step) => step.stepId === 'triage' && step.outcome === 'correct')).toBe(false);
  });

  it('rejects a parallel engine, a short flare line and a path through the spill', () => {
    const parallel = performFire(startFire(), { type: 'place', kind: 'blocker', placement: { ...layout.blocker!, yaw: 0 } }, 1000);
    expect(parallel.failed).toBe(false);
    expect(parallel.steps.some((step) => step.stepId === 'place-blocker' && step.outcome === 'correct')).toBe(false);
    expect(assessTaper(layout.cones, [{ id: 'flare-1', x: -5.4, z: 4, yaw: 0 }]).flaresOk).toBe(false);
    const spill = performFire(startFire(), { type: 'approach', x: -1.5, z: -4 }, 1000);
    expect(spill.failed).toBe(false);
    expect(spill.feedback).toContain('fuel');
    expect(assessApproach({ x: -1.5, z: -4 }).downstreamFuel).toBe(true);
  });

  it('records pace after safety and accuracy without penalising a safe accessible completion', () => {
    const scenario = createFireScenario(0);
    let state = startFire(scenario);
    for (const event of goodFireEvents(scenario)) state = performFire(state, event, 190_000);
    expect(state.paceLate).toBe(true);
    expect(state.completed).toBe(true);
    expect(state.steps.find(step => step.stepId === 'triage')?.note).toContain('Pace target exceeded');
    expect(score(state)).toBe(100);
    expect(passed(state, sceneSafetyModule)).toBe(true);
  });

  it('blocks handover until the scene is ready and keeps the card free of identity fields', () => {
    const early = performFire(startFire(), 'handover', 1000);
    expect(early.completed).toBe(false);
    expect(early.steps.some((step) => step.stepId === 'handover' && step.outcome === 'out-of-order')).toBe(true);
    const card = buildHandover(createFireScenario(0), ['fuel-spill', 'downed-cable', 'unstable-vehicle', 'traffic']);
    expect(parseSceneHandover(card)).toEqual(card);
    expect(parseSceneHandover({ ...card, photo: 'frame' })).toBeUndefined();
    expect(parseSceneHandover({ ...card, categories: { ...card.categories, name: 'Ada' } })).toBeUndefined();
    expect(Object.keys(card).sort()).toEqual(['cableStatus', 'categories', 'hazards', 'schema', 'unitsNeeded']);
  });

  it('stops a critical skip and ignores another module scenario', () => {
    const skipped = performFire(startFire(), { type: 'skip' }, 1000);
    expect(skipped.failed).toBe(true);
    expect(() => startFire({ ...createFireScenario(), moduleId: 'roads-zone' })).toThrow(/different training module/);
  });
});

describe('scene safety tag vocabulary', () => {
  it('uses one closed tag list', () => {
    const tags: TriageTag[] = ['minor', 'delayed', 'immediate', 'expectant'];
    expect(Object.keys(TRIAGE_TAGS)).toEqual(tags);
  });
});

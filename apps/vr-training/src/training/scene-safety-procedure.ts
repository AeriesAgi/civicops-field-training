import type { TrainingScenario, TrainingStep } from './contracts';
import { createFireScenario, sceneSafetyModule, sceneStepLines, type SceneStepId } from './modules/scene-safety';
import { nextProcedureStep, procedureTimestamp, recordProcedureOutcome, stopUnsafeProcedure, type ProcedureOutcomeState } from './procedure-engine';
import {
  FIRE_HAZARDS, FIRE_SCENE, assessApproach, assessBlocker, assessExclusion, assessTaper, buildHandover, casualtyById,
  classifyCasualty, createGoodFireLayout, criticalCasualty, finitePlacement, inExclusion, inLiveLane, tagsMatch,
  type CasualtyId, type FireLayout, type FirePlacement, type SceneHandover, type SceneHazard, type TriageTag,
} from './scene-safety-geometry';

export interface FireState extends ProcedureOutcomeState {
  layout: FireLayout;
  foundHazards: SceneHazard[];
  tags: Partial<Record<CasualtyId, TriageTag>>;
  handover?: SceneHandover;
  paceLate: boolean;
}

export type FirePartKind = 'blocker' | 'cone' | 'flare' | 'exclusion';
export type FireEvent = 'handover' | 'reset'
  | { type: 'place'; kind: FirePartKind; placement: FirePlacement }
  | { type: 'remove'; kind: FirePartKind; id: string }
  | { type: 'hazard'; id: SceneHazard }
  | { type: 'approach'; x: number; z: number }
  | { type: 'stand'; x: number; z: number }
  | { type: 'tag'; casualtyId: CasualtyId; tag: TriageTag }
  | { type: 'skip'; stepId?: SceneStepId };

const EMPTY_LAYOUT = (): FireLayout => ({ cones: [], flares: [] });

export function startFire(scenario: TrainingScenario = createFireScenario()): FireState {
  if (scenario.moduleId !== sceneSafetyModule.id) throw new Error('Scenario belongs to a different training module.');
  return {
    scenario: { ...scenario, variations: [...scenario.variations] }, steps: [], criticalErrors: [], hintsUsed: 0,
    completed: false, failed: false, lastEventAtMs: 0, feedback: sceneStepLines['place-blocker'].instruction,
    layout: EMPTY_LAYOUT(), foundHazards: [], tags: {}, paceLate: false,
  };
}

export function currentFireStep(state: FireState): TrainingStep | undefined {
  return nextProcedureStep(state, sceneSafetyModule);
}

export function hintFire(state: FireState, atMs = 0): FireState {
  const step = currentFireStep(state);
  return step ? {
    ...state, hintsUsed: state.hintsUsed + 1, lastEventAtMs: procedureTimestamp(state, atMs),
    feedback: `Hint: ${step.label}. ${sceneStepLines[step.id as SceneStepId].why}`,
  } : state;
}

function checks(state: FireState): Record<SceneStepId, boolean> {
  const taper = assessTaper(state.layout.cones, state.layout.flares);
  return {
    'place-blocker': assessBlocker(state.layout.blocker).ok,
    'warning-taper': taper.conesOk && taper.flaresOk,
    'size-up': FIRE_HAZARDS.every((hazard) => state.foundHazards.includes(hazard)),
    'cable-exclusion': assessExclusion(state.layout.exclusion),
    'safe-approach': assessApproach(state.layout.approach).ok,
    triage: tagsMatch(state.scenario, state.tags),
    handover: state.handover !== undefined,
  };
}

function revoke(state: FireState): FireState {
  const ready = checks(state);
  let open = true;
  const steps = state.steps.filter((step) => {
    if (step.outcome !== 'correct' || !sceneSafetyModule.steps.some(definition => definition.id === step.stepId)) return true;
    const id = step.stepId as SceneStepId;
    if (!open || !ready[id]) { open = false; return false; }
    return true;
  });
  return steps.length === state.steps.length ? state : { ...state, steps, handover: ready.handover ? state.handover : undefined };
}

function advance(state: FireState, atMs: number): FireState {
  let next = state;
  for (const step of sceneSafetyModule.steps) {
    if (next.steps.some((result) => result.stepId === step.id && (result.outcome === 'correct' || result.outcome === 'skipped'))) continue;
    if (currentFireStep(next)?.id !== step.id || !checks(next)[step.id as SceneStepId]) break;
    const lateTriage = step.id === 'triage' && atMs > FIRE_SCENE.triageLimitMs;
    if (lateTriage) next = { ...next, paceLate: true };
    const note = step.id === 'cable-exclusion' ? sceneStepLines['cable-exclusion'].why
      : step.id === 'handover' && next.handover ? handoverFeedback(next.handover)
        : `${step.label}. Complete.${lateTriage ? ' Pace target exceeded; review with supervisor. No safety or accuracy deduction.' : ''}`;
    next = recordProcedureOutcome(next, step.id, 'correct', atMs, note);
    if (step.id === 'handover') next = { ...next, completed: true };
  }
  return next;
}

function handoverFeedback(card: SceneHandover): string {
  return `Handover sent. Minor ${card.categories.minor}, delayed ${card.categories.delayed}, immediate ${card.categories.immediate}, expectant ${card.categories.expectant}. Cable stays live until Electricity confirms dead.`;
}

function withLayout(state: FireState, layout: FireLayout, atMs: number, feedback: string): FireState {
  return advance({ ...revoke({ ...state, layout }), lastEventAtMs: atMs, feedback }, atMs);
}

export function performFire(state: FireState, event: FireEvent, atMs = 0): FireState {
  const type = typeof event === 'string' ? event : event.type;
  if (type === 'reset') return startFire(state.scenario);
  if (state.completed) return state;
  const time = procedureTimestamp(state, atMs);
  if (typeof event !== 'string' && event.type === 'stand') {
    if (inExclusion(event.x, event.z)) return stopUnsafeProcedure(state, sceneSafetyModule, 'cable-exclusion', time, 'You entered the cable exclusion zone. Treat the line as live until Electricity confirms it dead.');
    if (inLiveLane(event.x, event.z)) return stopUnsafeProcedure(state, sceneSafetyModule, 'safe-approach', time, 'You are standing in a live lane. Step back to the shoulder.');
    return state;
  }
  if (typeof event !== 'string' && event.type === 'place') {
    if (!finitePlacement(event.placement)) return { ...state, lastEventAtMs: time, feedback: 'Place one finite part on the road plane.' };
    if (event.kind === 'blocker') {
      const assessment = assessBlocker(event.placement);
      if (assessment.downstream) return stopUnsafeProcedure({ ...state, layout: { ...state.layout, blocker: event.placement } }, sceneSafetyModule, 'place-blocker', time, 'The engine is downstream of the crash. Park it upstream so traffic meets it first.');
      if (assessment.liveLane) return stopUnsafeProcedure({ ...state, layout: { ...state.layout, blocker: event.placement } }, sceneSafetyModule, 'place-blocker', time, 'The engine is in a live lane. Angle it across the closed lane only.');
    }
    const layout: FireLayout = { ...state.layout, cones: [...state.layout.cones], flares: [...state.layout.flares] };
    if (event.kind === 'blocker') layout.blocker = event.placement;
    else if (event.kind === 'exclusion') layout.exclusion = event.placement;
    else {
      const field = event.kind === 'cone' ? 'cones' : 'flares';
      layout[field] = [...layout[field].filter((part) => part.id !== event.placement.id), event.placement];
    }
    const same = event.kind === 'blocker' ? state.layout.blocker : event.kind === 'exclusion' ? state.layout.exclusion
      : (event.kind === 'cone' ? state.layout.cones : state.layout.flares).find((part) => part.id === event.placement.id);
    if (same && same.x === event.placement.x && same.z === event.placement.z && same.yaw === event.placement.yaw) return state;
    return withLayout(state, layout, time, 'Placed. Pinch again to adjust.');
  }
  if (typeof event !== 'string' && event.type === 'remove') {
    const layout: FireLayout = { ...state.layout, cones: [...state.layout.cones], flares: [...state.layout.flares] };
    if (event.kind === 'blocker' || event.kind === 'exclusion') {
      if (layout[event.kind]?.id !== event.id) return state;
      delete layout[event.kind];
    } else {
      const field = event.kind === 'cone' ? 'cones' : 'flares';
      if (!layout[field].some((part) => part.id === event.id)) return state;
      layout[field] = layout[field].filter((part) => part.id !== event.id);
    }
    return withLayout(state, layout, time, 'Lifted. Place it again when the lane is clear.');
  }
  if (typeof event !== 'string' && event.type === 'hazard') {
    if (!FIRE_HAZARDS.includes(event.id) || state.foundHazards.includes(event.id)) return state;
    return advance({ ...state, foundHazards: [...state.foundHazards, event.id], lastEventAtMs: time, feedback: `Hazard noted: ${event.id.replace('-', ' ')}.` }, time);
  }
  if (typeof event !== 'string' && event.type === 'approach') {
    const approach = { x: event.x, z: event.z };
    const assessment = assessApproach(approach);
    if (assessment.exclusion) return stopUnsafeProcedure(state, sceneSafetyModule, 'cable-exclusion', time, 'That approach enters the cable exclusion zone.');
    if (assessment.liveLane) return stopUnsafeProcedure(state, sceneSafetyModule, 'safe-approach', time, 'That approach stands in a live lane.');
    if (assessment.downstreamFuel) return { ...state, lastEventAtMs: time, feedback: 'That path is downstream of the fuel spill. Come in from the shoulder, upstream of the stain.' };
    return withLayout(state, { ...state.layout, approach }, time, assessment.ok ? 'Approach marked on the shoulder.' : 'Move onto the shoulder between the wreck and the flares, then mark the approach.');
  }
  if (typeof event !== 'string' && event.type === 'tag') {
    const casualty = casualtyById(state.scenario, event.casualtyId);
    if (!casualty) return state;
    if (criticalCasualty(casualty) && event.tag === 'minor') {
      return stopUnsafeProcedure(state, sceneSafetyModule, 'triage', time, `Vest ${casualty.vest} is critical. A minor tag hides that. Read the card and retag on a new attempt.`);
    }
    if (state.tags[event.casualtyId] === event.tag) return state;
    return advance({ ...state, tags: { ...state.tags, [event.casualtyId]: event.tag }, lastEventAtMs: time, feedback: `Vest ${casualty.vest} tagged ${event.tag}.` }, time);
  }
  if (typeof event !== 'string' && event.type === 'skip') {
    const step = currentFireStep(state);
    if (!step) return state;
    if (event.stepId && event.stepId !== step.id) return recordProcedureOutcome(state, event.stepId, 'out-of-order', time, 'Only the current step can be skipped.');
    return step.critical ? stopUnsafeProcedure(state, sceneSafetyModule, step.id, time, `Critical safety check skipped: ${step.label}.`)
      : recordProcedureOutcome(state, step.id, 'skipped', time, 'Step skipped. The scene card still needs a human decision.');
  }
  if (type === 'handover') {
    const step = currentFireStep(state);
    if (step?.id !== 'handover') return recordProcedureOutcome(state, 'handover', 'out-of-order', time, 'Finish the scene and the tags before the handover card.');
    const card = buildHandover(state.scenario, state.foundHazards);
    return advance({ ...state, handover: card, lastEventAtMs: time, feedback: handoverFeedback(card) }, time);
  }
  return state;
}

export function goodFireEvents(scenario: TrainingScenario = createFireScenario()): FireEvent[] {
  const layout = createGoodFireLayout();
  return [
    { type: 'place', kind: 'blocker', placement: layout.blocker! },
    ...layout.cones.map((placement) => ({ type: 'place' as const, kind: 'cone' as const, placement })),
    ...layout.flares.map((placement) => ({ type: 'place' as const, kind: 'flare' as const, placement })),
    ...FIRE_HAZARDS.map((id) => ({ type: 'hazard' as const, id })),
    { type: 'place', kind: 'exclusion', placement: layout.exclusion! },
    { type: 'approach', x: layout.approach!.x, z: layout.approach!.z },
    ...(['c1', 'c2', 'c3', 'c4'] as const).map((casualtyId) => ({
      type: 'tag' as const, casualtyId, tag: classifyCasualty(casualtyById(scenario, casualtyId)!),
    })),
    'handover',
  ];
}

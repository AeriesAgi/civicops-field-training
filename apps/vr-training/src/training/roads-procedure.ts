import { ROADS_STAGING } from './roads-staging';
import {nextRainPhase, RAIN_STEPS, type RainPhase, type RainEvent} from './roads-incident';
import type { TrainingScenario, TrainingStep } from './contracts';
import { createRoadsScenario, roadsStepLines, roadsZoneModule, type RoadsStepId } from './modules/roads-zone';
import { nextProcedureStep, procedureTimestamp, recordProcedureOutcome, stopUnsafeProcedure, type ProcedureOutcomeState } from './procedure-engine';
import { checkRoadsLayout, snapRoadsPlacement, type RoadsLayout, type RoadsPartKind, type RoadsPlacement, type RoadsZoneCheck, type RoadsIssue } from './roads-geometry';

export interface RoadsState extends ProcedureOutcomeState {
  rainPhase?: RainPhase;
  crewDispatch: 'standby' | 'walking' | 'on-station';
  layout: RoadsLayout; layoutVersion: number; zoneChecked: boolean; zoneCheck?: RoadsZoneCheck;
  trafficRunning: boolean; trafficFault?: RoadsIssue; ghostRulerVisible: boolean;
}
export type RoadsEvent = RainEvent | 'zone-check' | 'run-traffic' | 'begin-work' | 'reset' | 'brief-driver' | 'brief-marshals' | 'marshals-arrived'
  | { type: 'place'; kind: RoadsPartKind; placement: RoadsPlacement }
  | { type: 'remove'; kind: RoadsPartKind; id: string }
  | { type: 'beacon'; on: boolean }
  | { type: 'skip'; stepId?: RoadsStepId };

export const ROADS_FEEDBACK = {
  workBeforeWarning: 'Working before advance warning is unsafe. Stop work, protect the approach and follow the employer SOP.',
  humanDecision: 'Zone readiness is illustrative decision support. An authorised person decides every real traffic and work action.',
} as const;

export function startRoads(scenario: TrainingScenario = createRoadsScenario()): RoadsState {
  if (scenario.moduleId !== roadsZoneModule.id) throw new Error('Scenario belongs to a different training module.');
  return { scenario: { ...scenario, variations: [...scenario.variations] }, steps: [], criticalErrors: [], hintsUsed: 0,
    crewDispatch: 'standby', completed: false, failed: false, lastEventAtMs: 0, feedback: roadsStepLines['park-vehicle'].instruction,
    layout: { beaconOn: false, cones: [], delineators: [], barriers: [], flaggers: [] }, layoutVersion: 0, zoneChecked: false,
    trafficRunning: false, ghostRulerVisible: false, ...(scenario.variations.includes('rain-incident') ? {rainPhase:'refuge' as const}: {}) };
}

export function currentRoadsStep(state: RoadsState): TrainingStep | undefined {
  return nextProcedureStep(state, roadsZoneModule);
}

function synchronize(state: RoadsState, layout: RoadsLayout, atMs: number): RoadsState {
  const check = checkRoadsLayout(layout, state.scenario);
  const reopenIncident=!!state.rainPhase&&!['refuge','radio','traffic'].includes(state.rainPhase);
  let next: RoadsState = { ...state, ...(reopenIncident?{rainPhase:'traffic' as const}:{}), layout, layoutVersion: state.layoutVersion + 1, zoneChecked: false,
    zoneCheck: undefined, trafficRunning: false, trafficFault: undefined, lastEventAtMs: atMs,
    steps: state.steps.filter((step) => (!reopenIncident||!['incident-tape','incident-assist','incident-record','incident-schedule'].includes(step.stepId)) && (!roadsZoneModule.steps.some(definition => definition.id === step.stepId)
      || step.outcome !== 'correct' || step.stepId !== 'test-traffic' && check.checks[step.stepId as RoadsStepId])),
    feedback: 'Placed on the road plane. Pinch and twist to adjust; Zone check audits your layout.' };
  for (const step of roadsZoneModule.steps.slice(0, 6)) {
    if (check.checks[step.id as RoadsStepId] && !next.steps.some((result) => result.stepId === step.id && result.outcome === 'correct')) {
      next = recordProcedureOutcome(next, step.id, 'correct', atMs, `${step.label}. Complete.`);
    }
  }
  return next;
}

export function hintRoads(state: RoadsState, atMs = 0): RoadsState {
  if(state.rainPhase&&state.rainPhase!=='traffic'&&state.rainPhase!=='ready')return {...state,hintsUsed:state.hintsUsed+1,lastEventAtMs:procedureTimestamp(state,atMs),feedback:`Hint: ${RAIN_STEPS[state.rainPhase].instruction}`};
  const step = currentRoadsStep(state);
  return step ? { ...state, hintsUsed: state.hintsUsed + 1, lastEventAtMs: procedureTimestamp(state, atMs),
    feedback: `Hint: ${step.label}. ${roadsStepLines[step.id as RoadsStepId].why}` } : state;
}

/** Immutable event-edge reducer; placements can arrive in any order and never use fixed acceptance slots. */
export function performRoads(state: RoadsState, event: RoadsEvent, atMs = 0): RoadsState {
  const type = typeof event === 'string' ? event : event.type;
  if (type === 'reset') return startRoads(state.scenario);
  if (state.completed) return state;
  const time = procedureTimestamp(state, atMs);
  if(state.rainPhase && typeof event==='string' && event.startsWith('incident:')) {
    if(event==='incident:enter-lane')return stopUnsafeProcedure(state,roadsZoneModule,'incident-refuge',time,'Supervisor stops the job: entering live traffic creates a near miss. Withdraw to refuge and file the near-miss report.');
    const phase=nextRainPhase(state.rainPhase,event as RainEvent,state.zoneChecked);
    if(!phase)return recordProcedureOutcome(state,'incident-order','out-of-order',time,`Stop and review: ${RAIN_STEPS[state.rainPhase].instruction}`);
    return {...recordProcedureOutcome(state,event.replace(':','-'),'correct',time,RAIN_STEPS[phase].instruction),rainPhase:phase};
  }
  if(state.rainPhase==='refuge'||state.rainPhase==='radio') {
    if(type==='place'||type==='run-traffic'||type==='begin-work'||type==='brief-driver'||type==='brief-marshals')return stopUnsafeProcedure(state,roadsZoneModule,'incident-refuge',time,'Supervisor stops the job. Establish your refuge and radio control before any road placement.');
  }
  if(state.rainPhase&&type==='run-traffic'&&state.rainPhase!=='ready')return recordProcedureOutcome(state,'incident-order','out-of-order',time,'Keep traffic held. Finish the cordon, motorist check and incident job card before the demonstration.');

  if (type === 'brief-driver') {
    if (state.layout.vehicle) return state;
    return { ...synchronize(state, { ...state.layout, vehicle: { id: 'vehicle', ...ROADS_STAGING.van } }, time),
      feedback: 'Driver brief acknowledged. Van parked in the upstream service bay. Check the beacon before unloading.' };
  }
  if (type === 'brief-marshals') {
    if (state.crewDispatch !== 'standby') return state;
    const checks=checkRoadsLayout(state.layout,state.scenario).checks;
    if (!['park-vehicle','advance-warning','cone-taper','keep-left','protect-work-area'].every(id=>checks[id as RoadsStepId]))
      return recordProcedureOutcome(state,'crew-brief','out-of-order',time,'Hold the crew in standby. Complete the van, warning, taper, arrow and rigid barriers before briefing the marshals.');
    return { ...state, crewDispatch:'walking', lastEventAtMs:time, feedback:'Crew brief acknowledged. Take the protected pavement route to both refuges. Keep STOP displayed; confirm sight lines before releasing traffic.' };
  }
  if (type === 'marshals-arrived') {
    if (state.crewDispatch !== 'walking') return state;
    const checks=checkRoadsLayout(state.layout,state.scenario).checks;
    if (!['park-vehicle','advance-warning','cone-taper','keep-left','protect-work-area'].every(id=>checks[id as RoadsStepId]))
      return { ...state, crewDispatch:'standby', lastEventAtMs:time, feedback:'Crew held back: protection changed during deployment. Restore the zone and brief again.' };
    return { ...synchronize(state,{ ...state.layout,flaggers:[{id:'flagger-1',...ROADS_STAGING.upstream},{id:'flagger-2',...ROADS_STAGING.downstream}] },time),
      crewDispatch:'on-station',feedback:'Both marshals on station, outside traffic. STOP displayed. Check sight lines and run the zone audit.' };
  }
  if (typeof event !== 'string' && event.type === 'place') {
    const placement = snapRoadsPlacement(event.placement);
    if (!placement) return { ...state, lastEventAtMs: time, feedback: 'Place one finite part on the live road plane.' };
    const existing = event.kind === 'vehicle' ? state.layout.vehicle : event.kind === 'warning' ? state.layout.warning
      : event.kind === 'keep-left' ? state.layout.keepLeft : (event.kind === 'cone' ? state.layout.cones
        : event.kind === 'delineator' ? state.layout.delineators : event.kind === 'barrier' ? state.layout.barriers : state.layout.flaggers).find((part) => part.id === placement.id);
    if (existing && existing.id === placement.id && existing.x === placement.x && existing.z === placement.z && existing.yaw === placement.yaw) return state;
    const layout = { ...state.layout };
    if (event.kind === 'vehicle') layout.vehicle = placement;
    else if (event.kind === 'warning') layout.warning = placement;
    else if (event.kind === 'keep-left') layout.keepLeft = placement;
    else {
      const field = event.kind === 'cone' ? 'cones' : event.kind === 'delineator' ? 'delineators' : event.kind === 'barrier' ? 'barriers' : 'flaggers';
      layout[field] = [...layout[field].filter((part) => part.id !== placement.id), placement];
    }
    return synchronize(state, layout, time);
  }
  if (typeof event !== 'string' && event.type === 'remove') {
    const layout = { ...state.layout };
    if (event.kind === 'vehicle' || event.kind === 'warning' || event.kind === 'keep-left') {
      const field = event.kind === 'keep-left' ? 'keepLeft' : event.kind;
      if (layout[field]?.id !== event.id) return state;
      delete layout[field];
    } else {
      const field = event.kind === 'cone' ? 'cones' : event.kind === 'delineator' ? 'delineators' : event.kind === 'barrier' ? 'barriers' : 'flaggers';
      if (!layout[field].some((part) => part.id === event.id)) return state;
      layout[field] = layout[field].filter((part) => part.id !== event.id);
    }
    return synchronize(state, layout, time);
  }
  if (typeof event !== 'string' && event.type === 'beacon') {
    return event.on === state.layout.beaconOn ? state : synchronize(state, { ...state.layout, beaconOn: event.on }, time);
  }
  if (typeof event !== 'string' && event.type === 'skip') {
    const step = currentRoadsStep(state);
    if (!step) return state;
    if (event.stepId && event.stepId !== step.id) return recordProcedureOutcome(state, event.stepId, 'out-of-order', time, 'Only the current step can be skipped.');
    return step.critical ? stopUnsafeProcedure(state, roadsZoneModule, step.id, time, `Critical safety check skipped: ${step.label}.`)
      : recordProcedureOutcome(state, step.id, 'skipped', time, 'Step skipped; physical prerequisites still apply.');
  }
  const check = checkRoadsLayout(state.layout, state.scenario);
  if (type === 'begin-work') {
    if (!check.checks['advance-warning']) return stopUnsafeProcedure(state, roadsZoneModule, 'advance-warning', time, ROADS_FEEDBACK.workBeforeWarning);
    if (!check.valid || !state.zoneChecked) return recordProcedureOutcome(state, 'test-traffic', 'out-of-order', time,
      'Work is not ready. Complete the zone and its check; an authorised person decides the real action.');
    return { ...state, lastEventAtMs: time, feedback: ROADS_FEEDBACK.humanDecision };
  }
  if (type === 'zone-check') {
    if (state.zoneCheck && state.zoneChecked === check.valid) return state;
    if (check.valid) return { ...state, ...(state.rainPhase==='traffic'?{rainPhase:'tape' as const}:{}), zoneChecked: true, zoneCheck: check, lastEventAtMs: time,
      feedback: 'Zone check clear. Poke Run traffic for the demonstration. An authorised person decides real actions.' };
    const next = recordProcedureOutcome(state, 'zone-review', 'out-of-order', time, check.issues[0].message);
    return { ...next, zoneChecked: false, zoneCheck: check, ghostRulerVisible: true };
  }
  if (type === 'run-traffic') {
    if (!check.valid) {
      const fault = check.issues.find((issue) => issue.critical) ?? check.issues[0];
      const stopped = stopUnsafeProcedure(state, roadsZoneModule, fault.stepId, time, `Unsafe traffic demonstration: ${fault.message}`);
      return { ...stopped, zoneCheck: check, trafficRunning: true, trafficFault: fault, ghostRulerVisible: true };
    }
    if (!state.zoneChecked) return recordProcedureOutcome(state, 'test-traffic', 'out-of-order', time, 'Poke Zone check before Run traffic; every layout change needs a fresh check.');
    const completed = recordProcedureOutcome(state, 'test-traffic', 'correct', time,
      'Traffic demonstration clear: slow approach, gradual merge and controlled Stop/Go. An authorised person decides real actions.');
    return { ...completed, completed: true, trafficRunning: true, zoneCheck: check };
  }
  return state;
}

import type { TrainingScenario, TrainingStep } from './contracts';
import { createWaterScenario, WATER_MAX_TURNS_PER_SECOND, WATER_VALVE_TURNS, waterBurstModule, waterStepLines } from './modules/water-burst';
import { nextProcedureStep, procedureTimestamp, recordProcedureOutcome, stopUnsafeProcedure, type ProcedureOutcomeState } from './procedure-engine';

export type WaterValveId = 'A' | 'B' | 'C' | 'D';
export type WaterStepId = 'make-area-safe' | 'identify-valves' | 'notify-control' | 'close-valves' | 'confirm-isolation' | 'trench-safety' | 'ready-for-repair';
export interface WaterValveState { turns: number; coverRemoved: boolean; keySeated: boolean }
export interface WaterPhysicalState {
  barriersPlaced: boolean; signPlaced: boolean; spoilSetBack: boolean;
  schematicChecked: boolean; notified: boolean; washoutOpen: boolean;
  shoringChecked: boolean; ladderChecked: boolean; atmosphereChecked: boolean; floodingChecked: boolean;
  isolationConfirmed: boolean; trenchChecked: boolean; criticalCustomerAuthorised: boolean;
  alternativeRoutePlanned: boolean;
  valves: Record<WaterValveId, WaterValveState>;
}
export interface WaterState extends ProcedureOutcomeState { physical: WaterPhysicalState }
export type WaterEvent = 'place-barriers' | 'place-sign' | 'set-spoil-back' | 'notify-control'
  | 'open-washout' | 'confirm-isolation' | 'check-shoring' | 'check-ladder' | 'check-atmosphere'
  | 'check-flooding' | 'trench-safety' | 'enter-trench' | 'ready-for-repair'
  | { type: 'plan-isolation'; valves: readonly WaterValveId[] }
  | { type: 'lift-cover' | 'seat-key'; valve: WaterValveId }
  | { type: 'turn-valve'; valve: WaterValveId; deltaTurns: number; elapsedMs: number }
  | { type: 'authorise-critical-customer'; authorised: boolean }
  | { type: 'skip'; stepId?: WaterStepId };

export const WATER_FEEDBACK = {
  barriers: 'Protect the burst and trench first. Barriers and a danger sign prevent public access.',
  hospital: 'Critical customer interruption: C feeds the hospital zone. Human authorisation is required.',
  hammer: 'Water hammer: closure was too fast. Pressure surge can damage the main and fittings.',
  order: 'Close A before the second valve. The main continues flowing until the correct sequence is complete.',
  seized: 'B is seized. Do not force it. Ask control to confirm the alternative A-D isolation route.',
  enter: 'Unsafe trench entry: shoring, safe access and all excavation checks are required before entry.',
  pressure: 'Isolation is unconfirmed. Open the washout, verify low pressure and zero flow first.',
} as const;

const STANDARD_ISOLATION_ROUTE = Object.freeze(['A', 'B'] as const);
const ALTERNATIVE_ISOLATION_ROUTE = Object.freeze(['A', 'D'] as const);
// Anything the panel shows as 3.00 (two decimals) counts as closed: 0.005 turns is 1.8 degrees.
const TURN_BOUNDARY_EPSILON = 0.005;

function freshValve(): WaterValveState { return { turns: 0, coverRemoved: false, keySeated: false }; }

export function startWater(scenario: TrainingScenario = createWaterScenario()): WaterState {
  if (scenario.moduleId !== waterBurstModule.id) throw new Error('Scenario belongs to a different training module.');
  return {
    scenario: { ...scenario, variations: [...scenario.variations] }, steps: [], criticalErrors: [],
    hintsUsed: 0, completed: false, failed: false, lastEventAtMs: 0,
    feedback: waterStepLines['make-area-safe'].instruction,
    physical: {
      barriersPlaced: false, signPlaced: false, spoilSetBack: false, schematicChecked: false,
      notified: false, washoutOpen: false, shoringChecked: false, ladderChecked: false,
      atmosphereChecked: false, floodingChecked: false, isolationConfirmed: false, trenchChecked: false,
      criticalCustomerAuthorised: false, alternativeRoutePlanned: false,
      valves: { A: freshValve(), B: freshValve(), C: freshValve(), D: freshValve() },
    },
  };
}

export function currentWaterStep(state: WaterState): TrainingStep | undefined {
  const step = nextProcedureStep(state, waterBurstModule);
  return step?.id === 'close-valves' && state.scenario.variations.includes('seized-valve')
    ? { ...step, label: 'Close A, then alternate D slowly' } : step;
}

export function waterIsolationRoute(state: WaterState): readonly ['A', 'B' | 'D'] {
  return state.scenario.variations.includes('seized-valve') ? ALTERNATIVE_ISOLATION_ROUTE : STANDARD_ISOLATION_ROUTE;
}

function areaSafe(state: WaterState): boolean {
  return state.physical.barriersPlaced && state.physical.signPlaced && state.physical.spoilSetBack;
}

function valvesClosed(state: WaterState): boolean {
  const route = waterIsolationRoute(state);
  return state.physical.valves.A.turns >= WATER_VALVE_TURNS
    && state.physical.valves[route[1]].turns >= WATER_VALVE_TURNS;
}

/** Normalized jet/loop-audio strength. The critical-customer branch never isolates this burst. */
export function getWaterFlow(state: WaterState): number {
  const route = waterIsolationRoute(state);
  const a = state.physical.valves.A.turns / WATER_VALVE_TURNS;
  const b = state.physical.valves[route[1]].turns / WATER_VALVE_TURNS;
  return Math.max(0, Math.min(1, (1 - a * 0.35) * (1 - b)));
}

export function getWaterPressure(state: WaterState): number {
  return valvesClosed(state) ? state.physical.washoutOpen ? 0.1 : 1.2 : 1.2 + getWaterFlow(state) * 2.8;
}

export function checkValveTurnRate(deltaTurns: number, elapsedMs: number): 'valid' | 'invalid' | 'too-fast' {
  if (!Number.isFinite(deltaTurns) || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || Math.abs(deltaTurns) > WATER_VALVE_TURNS) return 'invalid';
  // Opening is still controlled; rates in either direction cannot be used to hide a pressure surge.
  return Math.abs(deltaTurns) / (elapsedMs / 1000) > WATER_MAX_TURNS_PER_SECOND + 1e-9 ? 'too-fast' : 'valid';
}

function report(state: WaterState, atMs: number, feedback: string): WaterState {
  return { ...state, lastEventAtMs: atMs, feedback };
}

function orderError(state: WaterState, stepId: string, atMs: number, feedback: string): WaterState {
  return recordProcedureOutcome(state, stepId, 'out-of-order', atMs, feedback);
}

function success(state: WaterState, stepId: WaterStepId, atMs: number): WaterState {
  if (state.steps.some((step) => step.stepId === stepId && step.outcome === 'correct')) return state;
  const next = recordProcedureOutcome(state, stepId, 'correct', atMs, `${waterStepLines[stepId].instruction} Complete.`);
  return stepId === 'ready-for-repair' ? { ...next, completed: true } : next;
}

function updatePhysical(state: WaterState, patch: Partial<WaterPhysicalState>, atMs: number, feedback: string): WaterState {
  return report({ ...state, physical: { ...state.physical, ...patch } }, atMs, feedback);
}

export function hintWater(state: WaterState, atMs = 0): WaterState {
  const step = currentWaterStep(state);
  return step ? { ...state, hintsUsed: state.hintsUsed + 1, lastEventAtMs: procedureTimestamp(state, atMs),
    feedback: `Hint: ${step.label}. ${waterStepLines[step.id].why}` } : state;
}

/** Immutable, browser-free reducer. Called on hand interaction edges, never in the frame loop. */
export function performWater(state: WaterState, event: WaterEvent, atMs = 0): WaterState {
  if (state.completed) return state;
  const time = procedureTimestamp(state, atMs);
  const type = typeof event === 'string' ? event : event.type;
  const expected = currentWaterStep(state);
  if (!expected) return state;
  const unsafe = (stepId: string, message: string) => stopUnsafeProcedure(state, waterBurstModule, stepId, time, message);

  if (type === 'enter-trench') {
    return state.physical.trenchChecked && state.physical.isolationConfirmed
      ? report(state, time, 'Entry readiness checked. An authorised person decides whether entry is permitted.')
      : unsafe('trench-safety', WATER_FEEDBACK.enter);
  }
  if (typeof event !== 'string' && event.type === 'authorise-critical-customer') {
    return updatePhysical(state, { criticalCustomerAuthorised: event.authorised }, time,
      event.authorised ? 'Human authorisation recorded for critical-customer interruption. The burst route remains A-B or A-D.' : 'Hospital branch C remains protected.');
  }
  if (typeof event !== 'string' && (event.type === 'lift-cover' || event.type === 'seat-key')) {
    const valve = state.physical.valves[event.valve];
    if (!valve) return report(state, time, 'Choose a labelled valve box.');
    if (event.type === 'seat-key' && !valve.coverRemoved) return report(state, time, 'Lift the valve-box cover before seating the key.');
    if (event.type === 'lift-cover' && valve.coverRemoved || event.type === 'seat-key' && valve.keySeated) return state;
    const valves = { ...state.physical.valves };
    if (event.type === 'seat-key') {
      for (const id of ['A', 'B', 'C', 'D'] as const) valves[id] = { ...valves[id], keySeated: id === event.valve };
    } else valves[event.valve] = { ...valve, coverRemoved: true };
    return updatePhysical(state, { valves }, time, event.type === 'seat-key' ? `Key seated on ${event.valve}. Turn slowly.` : `Cover ${event.valve} lifted. Keep the opening protected.`);
  }
  if (typeof event !== 'string' && event.type === 'turn-valve') {
    const valve = state.physical.valves[event.valve];
    if (!valve) return report(state, time, 'Choose a labelled valve spindle.');
    if (event.valve === 'C' && event.deltaTurns > 0 && !state.physical.criticalCustomerAuthorised) return unsafe('close-valves', WATER_FEEDBACK.hospital);
    if (!areaSafe(state)) return unsafe('make-area-safe', WATER_FEEDBACK.barriers);
    if (!valve.keySeated || !valve.coverRemoved) return report(state, time, 'Lift the cover and seat the valve key before turning.');
    if (!state.physical.schematicChecked || !state.physical.notified) return orderError(state, 'close-valves', time, 'Plan the isolation and notify control before operating a valve.');
    const rate = checkValveTurnRate(event.deltaTurns, event.elapsedMs);
    if (rate === 'invalid') return report(state, time, 'Use a finite, measured hand turn with a positive duration.');
    if (rate === 'too-fast') return unsafe('close-valves', WATER_FEEDBACK.hammer);
    if (event.deltaTurns === 0) return state;
    if (event.valve === 'B' && state.scenario.variations.includes('seized-valve')) return report(state, time, WATER_FEEDBACK.seized);
    const route = waterIsolationRoute(state);
    if (event.deltaTurns > 0 && event.valve !== 'C' && !route.includes(event.valve as 'A' | 'B' | 'D')) return orderError(state, 'close-valves', time, 'That valve is outside the planned isolation. Follow the network schematic.');
    if (event.deltaTurns > 0 && event.valve === route[1] && state.physical.valves.A.turns < WATER_VALVE_TURNS) return orderError(state, 'valve-order', time, WATER_FEEDBACK.order);
    if (event.valve === 'D' && !state.physical.alternativeRoutePlanned) return orderError(state, 'close-valves', time, 'Confirm the alternative A-D route on the schematic before using D.');
    const measuredTurns = Math.max(0, Math.min(WATER_VALVE_TURNS, valve.turns + event.deltaTurns));
    // Measured wrist quaternions accumulate rounding dust (0.045 degrees seen in IWER runs).
    const turns = Math.abs(measuredTurns - WATER_VALVE_TURNS) <= TURN_BOUNDARY_EPSILON ? WATER_VALVE_TURNS
      : measuredTurns <= TURN_BOUNDARY_EPSILON ? 0 : measuredTurns;
    if (turns === valve.turns) return state;
    const openingIsolationValve = event.deltaTurns < 0 && route.includes(event.valve as 'A' | 'B' | 'D');
    let next = updatePhysical(state, {
      valves: { ...state.physical.valves, [event.valve]: { ...valve, turns } },
      ...(openingIsolationValve ? { isolationConfirmed: false, trenchChecked: false } : {}),
    }, time, `${event.valve}: ${turns.toFixed(2)} of ${WATER_VALVE_TURNS} turns. ${openingIsolationValve ? 'Isolation must be verified again.' : 'Controlled turn; pressure surge avoided.'}`);
    if (openingIsolationValve) next = { ...next, steps: next.steps.filter((step) => !['close-valves', 'confirm-isolation', 'trench-safety'].includes(step.stepId) || step.outcome !== 'correct') };
    return valvesClosed(next) ? success(next, 'close-valves', time) : next;
  }
  if (type === 'place-barriers' || type === 'place-sign' || type === 'set-spoil-back') {
    const field = type === 'place-barriers' ? 'barriersPlaced' : type === 'place-sign' ? 'signPlaced' : 'spoilSetBack';
    if (state.physical[field]) return state;
    const next = updatePhysical(state, { [field]: true }, time, type === 'set-spoil-back' ? 'Spoil moved at least one metre from the trench edge.' : type === 'place-sign' ? 'Danger sign placed facing the approach.' : 'Perimeter barriers protect the burst and trench edge.');
    return areaSafe(next) ? success(next, 'make-area-safe', time) : next;
  }
  if (typeof event !== 'string' && event.type === 'plan-isolation') {
    if (!areaSafe(state)) return orderError(state, 'identify-valves', time, WATER_FEEDBACK.barriers);
    const route = waterIsolationRoute(state);
    if (event.valves.length !== 2 || event.valves[0] !== route[0] || event.valves[1] !== route[1]) return orderError(state, 'identify-valves', time,
      state.scenario.variations.includes('seized-valve') ? WATER_FEEDBACK.seized : 'Choose A then B. C feeds the hospital zone; D is the alternate route.');
    if (state.physical.schematicChecked) return state;
    return success(updatePhysical(state, { schematicChecked: true, alternativeRoutePlanned: route[1] === 'D' }, time, `Planned ${route.join('-')}; hospital C stays open.`), 'identify-valves', time);
  }
  if (type === 'skip') {
    const requested = typeof event !== 'string' && event.type === 'skip' ? event.stepId : undefined;
    if (requested && requested !== expected.id) return orderError(state, requested, time, 'Only the current step can be skipped.');
    if (expected.critical) return unsafe(expected.id, `Critical safety check skipped: ${expected.label}.`);
    return recordProcedureOutcome(state, expected.id, 'skipped', time, 'Step skipped; its physical prerequisite is still incomplete.');
  }
  if (type === 'notify-control') {
    if (state.physical.notified) return state;
    if (!state.physical.schematicChecked) return orderError(state, 'notify-control', time, 'Confirm the isolation route on the schematic first.');
    return success(updatePhysical(state, { notified: true }, time, 'Simulated CivicOps notice: control and affected customers notified. No external message is sent.'), 'notify-control', time);
  }
  if (type === 'open-washout') {
    if (state.physical.washoutOpen) return state;
    if (!valvesClosed(state)) return orderError(state, 'confirm-isolation', time, 'Complete the controlled valve isolation before opening the washout.');
    return updatePhysical(state, { washoutOpen: true }, time, 'Washout open. Trapped pressure drains; read the gauge and confirm zero flow.');
  }
  if (type === 'confirm-isolation') {
    if (state.physical.isolationConfirmed) return state;
    if (!valvesClosed(state) || !state.physical.washoutOpen || getWaterFlow(state) !== 0 || getWaterPressure(state) > 0.2) return orderError(state, 'confirm-isolation', time, WATER_FEEDBACK.pressure);
    return success(updatePhysical(state, { isolationConfirmed: true }, time, 'Zero flow. Gauge 0.1 bar. Controlled isolation confirmed.'), 'confirm-isolation', time);
  }
  if (type === 'check-shoring' || type === 'check-ladder' || type === 'check-atmosphere' || type === 'check-flooding') {
    if (!state.physical.isolationConfirmed) return orderError(state, 'trench-safety', time, 'Confirm isolation before the trench readiness checks.');
    const field = type === 'check-shoring' ? 'shoringChecked' : type === 'check-ladder' ? 'ladderChecked' : type === 'check-atmosphere' ? 'atmosphereChecked' : 'floodingChecked';
    if (state.physical[field]) return state;
    return updatePhysical(state, { [field]: true }, time, type === 'check-shoring' ? 'Shoring checked by the competent-person training prompt.' : type === 'check-ladder' ? 'Secured ladder and clear access checked.' : type === 'check-atmosphere' ? 'Atmosphere check recorded. Follow the employer testing procedure.' : 'Flooding and water ingress checked; conditions need ongoing review.');
  }
  if (type === 'trench-safety') {
    if (state.physical.trenchChecked) return state;
    const p = state.physical;
    if (!p.isolationConfirmed || !p.shoringChecked || !p.ladderChecked || !p.spoilSetBack || !p.atmosphereChecked || !p.floodingChecked) return orderError(state, 'trench-safety', time, WATER_FEEDBACK.enter);
    return success(updatePhysical(state, { trenchChecked: true }, time, 'Excavation readiness checks complete. Human entry decision required.'), 'trench-safety', time);
  }
  if (type === 'ready-for-repair') {
    if (!areaSafe(state)) return unsafe('make-area-safe', WATER_FEEDBACK.barriers);
    if (!state.physical.isolationConfirmed || !state.physical.trenchChecked) return unsafe('ready-for-repair', 'Repair readiness declared before isolation and trench checks. An authorised person must decide.');
    return success(state, 'ready-for-repair', time);
  }
  return state;
}

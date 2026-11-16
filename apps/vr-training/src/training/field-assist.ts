import type { TrainingModule, TrainingStep } from './contracts';
import { elecLotoModule } from './modules/elec-loto';
import { roadsZoneModule } from './modules/roads-zone';
import { sceneSafetyModule } from './modules/scene-safety';
import { waterBurstModule } from './modules/water-burst';
import type { AssistHazardCode } from './assist-contract';

/**
 * On-site assist (AR) logic for the three options. Pure and deterministic.
 * Decision support only: a human decides every action. No camera, no detection,
 * no identification of people; inputs are manual placements or mocked feeds.
 */
export type AssistMode = 'crew' | 'hazard' | 'sa';
export const ASSIST_MODES: readonly AssistMode[] = ['crew', 'hazard', 'sa'];

// ---------- Option 1: crew job-step guide with check-before-touch gates ----------
export type VerificationType = 'confirm' | 'two-step-confirm' | 'reading-entry' | 'photo-placeholder';

export interface FieldStep {
  id: string;
  prompt: string;
  verification: VerificationType;
  /** Question for reading-entry and STOP gates, answered Yes / No / Not sure. */
  check?: string;
  stopGate: boolean;
  hazards: AssistHazardCode[];
}

/** Field checks for critical steps (the STOP gates). Keyed by module step id. */
const GATE_CHECKS: Readonly<Record<string, { check: string; reading?: boolean; hazards: AssistHazardCode[] }>> = {
  'switch-off': { check: 'Is the correct circuit OFF at the board you will lock?', hazards: ['live-asset'] },
  'apply-lock': { check: 'Is YOUR padlock on the isolator, and do you hold the only key?', hazards: ['live-asset'] },
  'prove-tester': { check: 'Did the tester light on the proving unit?', reading: true, hazards: ['live-asset'] },
  'test-dead': { check: 'Tester reads 0 V on every terminal pair?', reading: true, hazards: ['live-asset'] },
  're-prove-tester': { check: 'Did the tester light on the proving unit again?', reading: true, hazards: ['live-asset'] },
  'make-area-safe': { check: 'Barriers and sign up, spoil set back from the edge?', hazards: ['open-excavation', 'lane-exposure'] },
  'close-valves': { check: 'Both isolating valves closed, slowly, in order?', hazards: ['flooding'] },
  'confirm-isolation': { check: 'Pressure gauge below 0.5 bar and zero flow at the washout?', reading: true, hazards: ['flooding'] },
  'trench-safety': { check: 'Shoring or batter in place before anyone enters the trench?', hazards: ['open-excavation'] },
  'park-vehicle': { check: 'Vehicle upstream with the beacon on?', hazards: ['lane-exposure'] },
  'advance-warning': { check: 'Advance warning placed BEFORE any work starts?', hazards: ['lane-exposure'] },
  'cone-taper': { check: 'Taper long enough for the approach speed?', hazards: ['lane-exposure'] },
  'protect-work-area': { check: 'Excavation protected and the pedestrian route open?', hazards: ['open-excavation'] },
  'position-flaggers': { check: 'Both marshals have sight lines and a refuge?', hazards: ['lane-exposure'] },
  'place-blocker': { check: 'Engine angled upstream, covering the work area?', hazards: ['lane-exposure'] },
  'warning-taper': { check: 'Cones and flares out at a safe distance?', hazards: ['lane-exposure'] },
  'size-up': { check: 'Fuel, cable, unstable vehicle and traffic all checked?', hazards: ['fire', 'live-asset', 'unstable-vehicle', 'lane-exposure'] },
  'cable-exclusion': { check: 'Downed line marked and treated as LIVE until Electricity confirms dead?', hazards: ['live-asset'] },
  'safe-approach': { check: 'Approach on the shoulder, clear of the spill and live lanes?', hazards: ['lane-exposure', 'fire'] },
  triage: { check: 'Every casualty tagged and reported to control?', hazards: [] },
};

export const ASSIST_MODULES: readonly TrainingModule[] = [elecLotoModule, waterBurstModule, roadsZoneModule, sceneSafetyModule];

/** Field variant derived from the training definition, so procedure data is never duplicated. */
export function fieldStepsFor(module: TrainingModule): FieldStep[] {
  return [...module.steps].sort((a, b) => a.order - b.order).map((step: TrainingStep) => {
    const gate = step.critical ? GATE_CHECKS[step.id] : undefined;
    return {
      id: step.id, prompt: step.label, stopGate: Boolean(gate),
      verification: gate ? (gate.reading ? 'reading-entry' : 'two-step-confirm') : 'confirm',
      check: gate?.check, hazards: gate ? [...gate.hazards] : [],
    };
  });
}

export type GateAnswer = 'yes' | 'no' | 'not-sure';
export type CrewPhase = 'step' | 'gate-confirmed' | 'stop-work' | 'complete';

export interface CrewGuideState {
  moduleId: string;
  steps: FieldStep[];
  index: number;
  phase: CrewPhase;
  /** Gaze/pinch "Confirmed" done, waiting for the 1 s hold. */
  armedAtMs?: number;
  stopReason?: string;
  log: { stepId: string; outcome: 'confirmed' | 'stopped' | 'resumed'; atMs: number }[];
}

export const GATE_HOLD_MS = 1000;

export function startCrewGuide(module: TrainingModule): CrewGuideState {
  return { moduleId: module.id, steps: fieldStepsFor(module), index: 0, phase: 'step', log: [] };
}

export function currentFieldStep(state: CrewGuideState): FieldStep | undefined {
  return state.phase === 'complete' ? undefined : state.steps[state.index];
}

function advance(state: CrewGuideState, atMs: number): CrewGuideState {
  const step = state.steps[state.index];
  const log = [...state.log, { stepId: step.id, outcome: 'confirmed' as const, atMs }];
  const index = state.index + 1;
  return { ...state, index, armedAtMs: undefined, phase: index >= state.steps.length ? 'complete' : 'step', log };
}

/** Plain steps: one confirm. STOP gates: answer the check, then hold ≥ 1 s. */
export function answerStep(state: CrewGuideState, answer: GateAnswer, atMs: number): CrewGuideState {
  const step = currentFieldStep(state);
  if (!step || state.phase === 'stop-work') return state;
  if (answer !== 'yes') {
    return { ...state, phase: 'stop-work', armedAtMs: undefined, stopReason: step.check ?? step.prompt,
      log: [...state.log, { stepId: step.id, outcome: 'stopped', atMs }] };
  }
  if (!step.stopGate) return advance(state, atMs);
  return { ...state, phase: 'gate-confirmed', armedAtMs: atMs };
}

/** Second stage of a STOP gate. Released early → stays armed, nothing advances. */
export function holdGate(state: CrewGuideState, heldMs: number, atMs: number): CrewGuideState {
  if (state.phase !== 'gate-confirmed' || heldMs < GATE_HOLD_MS) return state;
  return advance(state, atMs);
}

/** Attempts to jump ahead are refused; you cannot skip a gate. */
export function skipTo(state: CrewGuideState, stepId: string): CrewGuideState {
  const target = state.steps.findIndex((step) => step.id === stepId);
  if (target <= state.index) return state;
  const gateBetween = state.steps.slice(state.index, target).some((step) => step.stopGate);
  return gateBetween ? state : { ...state, index: target, phase: 'step' };
}

/** Resume only after the crew re-checks and answers yes; the gate then needs the hold again. */
export function resumeAfterRecheck(state: CrewGuideState, recheck: GateAnswer, atMs: number): CrewGuideState {
  if (state.phase !== 'stop-work' || recheck !== 'yes') return state;
  const step = state.steps[state.index];
  return { ...state, phase: step.stopGate ? 'gate-confirmed' : 'step', armedAtMs: step.stopGate ? atMs : undefined, stopReason: undefined,
    log: [...state.log, { stepId: step.id, outcome: 'resumed', atMs }] };
}

// ---------- Option 2: hazard callouts ----------
export type CalloutKind = 'live-line' | 'gas-leak' | 'fuel-spill' | 'open-trench' | 'flooding' | 'fire';
export interface CalloutSpec { label: string; radiusM: number; hazard: AssistHazardCode; todo: string[] }

/** Default exclusion radii (illustrative; the employer SOP value always wins). */
export const CALLOUTS: Readonly<Record<CalloutKind, CalloutSpec>> = {
  'live-line': { label: 'Live line down', radiusM: 10, hazard: 'live-asset', todo: ['Keep 10 m back', 'Call control', 'Wait for Electricity to confirm dead'] },
  'gas-leak': { label: 'Gas leak', radiusM: 25, hazard: 'fire', todo: ['No ignition sources', 'Stay upwind', 'Call control; wait for the gas utility'] },
  'fuel-spill': { label: 'Fuel spill', radiusM: 6, hazard: 'fire', todo: ['Do not walk through it', 'No ignition sources', 'Call control for absorbent'] },
  'open-trench': { label: 'Open trench', radiusM: 2, hazard: 'open-excavation', todo: ['Keep back from the edge', 'No entry without shoring', 'Ask the authorised person'] },
  flooding: { label: 'Flooding', radiusM: 5, hazard: 'flooding', todo: ['Do not enter moving water', 'Check for hidden openings', 'Call control'] },
  fire: { label: 'Fire', radiusM: 15, hazard: 'fire', todo: ['Keep back', 'Call 10177 / 112', 'Wait for Fire and EMS'] },
};

export interface Callout { id: string; kind: CalloutKind; x: number; z: number; radiusM: number; source: 'manual' | 'control-feed' }
export type Proximity = 'clear' | 'approaching' | 'inside';

export function placeCallout(list: readonly Callout[], kind: CalloutKind, x: number, z: number, source: Callout['source'] = 'manual', radiusM?: number): Callout[] {
  const radius = Math.max(0.5, Math.min(100, radiusM ?? CALLOUTS[kind].radiusM));
  return [...list, { id: `h${list.length + 1}`, kind, x, z, radiusM: radius, source }];
}

export function distanceToCallout(callout: Callout, x: number, z: number): number {
  return Math.hypot(x - callout.x, z - callout.z);
}

/** Calm warning band: "approaching" within 1.5 × radius, "inside" within the radius. */
export function proximity(callout: Callout, x: number, z: number): Proximity {
  const d = distanceToCallout(callout, x, z);
  return d <= callout.radiusM ? 'inside' : d <= callout.radiusM * 1.5 ? 'approaching' : 'clear';
}

export function worstProximity(list: readonly Callout[], x: number, z: number): { level: Proximity; callout?: Callout } {
  let best: { level: Proximity; callout?: Callout; d: number } = { level: 'clear', d: Infinity };
  const rank = { clear: 0, approaching: 1, inside: 2 };
  for (const callout of list) {
    const level = proximity(callout, x, z);
    const d = distanceToCallout(callout, x, z) - callout.radiusM;
    if (rank[level] > rank[best.level] || (rank[level] === rank[best.level] && d < best.d)) best = { level, callout, d };
  }
  return { level: best.level, callout: best.level === 'clear' ? undefined : best.callout };
}

// ---------- Option 3: police / EMS situational awareness ----------
export interface Point2 { x: number; z: number }
export interface Lane { id: string; a: Point2; b: Point2; widthM: number; live: boolean }
export type LaneExposure = 'safe' | 'near-live-lane' | 'in-live-lane';

/** Two-point pinch calibration: the lane centre line from A to B with a width. */
export function calibrateLane(id: string, a: Point2, b: Point2, widthM = 3.5, live = true): Lane {
  if (Math.hypot(b.x - a.x, b.z - a.z) < 1) throw new Error('lane calibration points must be at least 1 m apart');
  return { id, a, b, widthM, live };
}

function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

export function laneExposure(lanes: readonly Lane[], p: Point2, nearMarginM = 1): LaneExposure {
  let result: LaneExposure = 'safe';
  for (const lane of lanes) {
    if (!lane.live) continue;
    const d = distanceToSegment(p, lane.a, lane.b);
    if (d <= lane.widthM / 2) return 'in-live-lane';
    if (d <= lane.widthM / 2 + nearMarginM) result = 'near-live-lane';
  }
  return result;
}

export type UnitType = 'police' | 'traffic' | 'ems' | 'fire' | 'crew';
/** Own units only, from a mocked dispatch feed. Never people, never bystanders. */
export interface OwnUnit { callsign: string; type: UnitType; x: number; z: number; etaMin?: number }

export function unitBearings(units: readonly OwnUnit[], me: Point2, headingDeg: number): { callsign: string; type: UnitType; distanceM: number; bearingDeg: number; etaMin?: number }[] {
  return units.map((unit) => {
    const absolute = (Math.atan2(unit.x - me.x, -(unit.z - me.z)) * 180) / Math.PI;
    const bearingDeg = ((absolute - headingDeg) % 360 + 540) % 360 - 180;
    return { callsign: unit.callsign, type: unit.type, distanceM: Math.round(Math.hypot(unit.x - me.x, unit.z - me.z)), bearingDeg: Math.round(bearingDeg), etaMin: unit.etaMin };
  }).sort((a, b) => a.distanceM - b.distanceM);
}

export function backupLine(units: readonly OwnUnit[]): string {
  const next = units.filter((unit) => unit.etaMin !== undefined).sort((a, b) => a.etaMin! - b.etaMin!)[0];
  return next ? `Backup: Unit ${next.callsign} · ${next.etaMin} min` : 'Backup: none requested';
}

export const SOS_HOLD_MS = 2000;
export const EMERGENCY_LINE = 'Life-threatening emergency: call 10111 (police) / 10177 (ambulance) / 112';
export interface SosState { phase: 'idle' | 'holding' | 'sent'; heldMs: number }

/** Hold-to-confirm; releasing early cancels. The demo only shows "sent (simulated)". */
export function sosTick(state: SosState, pressed: boolean, dtMs: number): SosState {
  if (state.phase === 'sent') return state;
  if (!pressed) return { phase: 'idle', heldMs: 0 };
  const heldMs = state.heldMs + dtMs;
  return heldMs >= SOS_HOLD_MS ? { phase: 'sent', heldMs } : { phase: 'holding', heldMs };
}

export function sosMessage(state: SosState): string {
  return state.phase === 'sent' ? 'SOS sent to control (simulated)' : state.phase === 'holding' ? `Hold to send SOS… ${Math.ceil((SOS_HOLD_MS - state.heldMs) / 1000)} s` : 'Hold to send SOS';
}

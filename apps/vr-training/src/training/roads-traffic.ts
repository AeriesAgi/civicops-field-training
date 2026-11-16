import { ROADS_GEOMETRY, type RoadsIssue, type RoadsLayout, type RoadsPlacement } from './roads-geometry';

export type TrafficReaction = 'cruise' | 'slow' | 'merge' | 'stop' | 'hard-brake' | 'cone-contact';
export interface TrafficPose { x: number; z: number; yaw: number; reaction: TrafficReaction }
export interface TrafficRoute {
  warningX: number; taperStart: number; taperEnd: number; stopX: number; unsafe: boolean;
  coneX: number; coneZ: number; coneId?: string; contactOnUnsafe: boolean;
  mergeStart: number; mergeEnd: number; laneBefore: number; laneAfter: number;
}
export const ROADS_TRAFFIC_CYCLE_SECONDS = 24;
export const ROADS_TRAFFIC_GO_SECONDS = 13;
// Includes the authored full-scale car's bumper and mirrors, with 50 mm geometric headroom.
export const ROADS_TRAFFIC_CAR_HALF_LENGTH = ROADS_GEOMETRY.carHalfLength;
export const ROADS_TRAFFIC_CAR_HALF_WIDTH = ROADS_GEOMETRY.carHalfWidth;
const START_X = -40;
const EXIT_X = 40;
const QUEUE_GAP = 6.5;
export const ROADS_TRAFFIC_STOP_CLEARANCE = 3.1;
const STOP_CLEARANCE = ROADS_TRAFFIC_STOP_CLEARANCE;

const finitePosition = (x: number, z: number) => Number.isFinite(x) && Number.isFinite(z);

/** Identify the upstream placed prop by geometry, independent of model/placement order. */
export function upstreamRoadsFlagger(flaggers: readonly RoadsPlacement[]): Readonly<RoadsPlacement> | undefined {
  let upstream: RoadsPlacement | undefined;
  for (const flagger of flaggers) {
    if (finitePosition(flagger.x, flagger.z) && (!upstream || flagger.x < upstream.x)) upstream = flagger;
  }
  return upstream;
}

/** Prepare once on a layout edge. The car starts its turn before its nose reaches the first cone. */
export function trafficRoute(layout: RoadsLayout, valid: boolean, fault?: RoadsIssue): TrafficRoute {
  const sorted = layout.cones.filter((cone) => finitePosition(cone.x, cone.z)).slice().sort((a, b) => a.x - b.x);
  const first = sorted[0]; const last = sorted[sorted.length - 1];
  const warningX = layout.warning && Number.isFinite(layout.warning.x) ? layout.warning.x : -6;
  const taperStart = first?.x ?? -4.5;
  const taperEnd = last?.x ?? 2.0;
  const upstreamMarshal = upstreamRoadsFlagger(layout.flaggers);
  const stopX = upstreamMarshal?.x ?? 4.4;
  return {
    warningX, taperStart, taperEnd, stopX,
    unsafe: !valid, coneX: first?.x ?? 1.0, coneZ: first?.z ?? 1.5, coneId: first?.id,
    contactOnUnsafe: !valid && sorted.length > 0 && (!fault || fault.stepId === 'cone-taper'),
    // The stop board sits just upstream of the work area. Once it turns GO,
    // the car takes the full lane around the taper before crossing the work frontage.
    mergeStart: stopX - STOP_CLEARANCE - 0.2, mergeEnd: Math.max(taperEnd + 4, stopX + 6),
    // The work zone closes the north lane. Traffic approaches and exits in the
    // unobstructed south lane, preserving a real 3.5 m lane clearance.
    laneBefore: -1.75, laneAfter: -1.75,
  };
}

/** Global STOP/GO cycle. Offset 7.7 spaces one car safe following gap behind; every car obeys the same marshal. */
export function sampleRoadTraffic(seconds: number, offset: number, route: TrafficRoute, out: TrafficPose): void {
  const elapsed = Number.isFinite(seconds) ? seconds : 0;
  const phase = ((elapsed % ROADS_TRAFFIC_CYCLE_SECONDS) + ROADS_TRAFFIC_CYCLE_SECONDS) % ROADS_TRAFFIC_CYCLE_SECONDS;
  const queueOffset = Math.max(0, Number.isFinite(offset) ? offset : 0) * QUEUE_GAP / 7.7;
  const stopCenter = route.stopX - STOP_CLEARANCE;
  let leaderX: number;
  if (phase < 3) leaderX = START_X + (route.warningX - START_X) * phase / 3;
  else if (phase < 9) {
    const t = (phase - 3) / 6;
    leaderX = route.warningX + (stopCenter - route.warningX) * t * (2 - t);
  } else if (phase < ROADS_TRAFFIC_GO_SECONDS) leaderX = stopCenter;
  else {
    // A short acceleration ramp avoids a position jump when the marshal turns GO.
    const t = (phase - ROADS_TRAFFIC_GO_SECONDS) / (ROADS_TRAFFIC_CYCLE_SECONDS - ROADS_TRAFFIC_GO_SECONDS);
    const distance = t * t * (3 - 2 * t);
    leaderX = stopCenter + (EXIT_X - stopCenter) * distance;
  }
  out.x = leaderX - queueOffset;
  out.z = route.laneBefore;
  out.yaw = 0;
  // Human-readable traffic phases are ordered: approach, slow at the sign,
  // STOP at the marshal, then GO/merge. Do not let the merge curve mask a
  // required STOP signal before the marshal releases traffic.
  out.reaction = out.x >= route.warningX ? 'slow' : 'cruise';
  const length = Math.max(0.04, route.mergeEnd - route.mergeStart);
  const t = Math.max(0, Math.min(1, (out.x - route.mergeStart) / length));
  if (t > 0) {
    // An early, progressively gentler turn preserves room for the car's rotated nose and mirrors.
    const curve = t * (1.5 - 0.5 * t * t);
    out.z = route.laneBefore + (route.laneAfter - route.laneBefore) * curve;
    out.yaw = t < 1 ? Math.atan2((route.laneBefore - route.laneAfter) * 1.5 * (1 - t * t), length) : 0;
    if (phase >= ROADS_TRAFFIC_GO_SECONDS && phase < ROADS_TRAFFIC_GO_SECONDS + 4) out.reaction = 'merge';
    else if (t === 1 && phase >= ROADS_TRAFFIC_GO_SECONDS + 4) out.reaction = 'cruise';
  }
  if (phase >= 9 && phase < ROADS_TRAFFIC_GO_SECONDS) out.reaction = 'stop';
  if (route.unsafe && phase >= 3 && phase < ROADS_TRAFFIC_GO_SECONDS) {
    const targetX = route.contactOnUnsafe ? route.coneX - ROADS_TRAFFIC_CAR_HALF_LENGTH : route.warningX + 0.08;
    const braking = Math.min(1, (phase - 3) / 4);
    const approach = braking * (2 - braking);
    out.x = route.warningX + (targetX - route.warningX) * approach - queueOffset;
    out.z = 1.8 + ((route.contactOnUnsafe ? route.coneZ : 1.8) - 1.8) * approach;
    out.yaw = 0;
    out.reaction = phase < 7 ? 'slow' : 'hard-brake';
    if (route.contactOnUnsafe && phase >= 10 && queueOffset < 0.001) {
      out.x += 0.45; out.yaw = -0.18; out.reaction = 'cone-contact';
    }
  }
}

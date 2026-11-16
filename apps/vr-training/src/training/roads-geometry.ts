import { ROADS_STAGING } from './roads-staging';
import type { TrainingScenario } from './contracts';
import { createRoadsScenario, type RoadsStepId } from './modules/roads-zone';

/** Full-scale road audit in metres; +X is traffic travel and +Z points to the kerb. */
export interface RoadsPlacement { id: string; x: number; z: number; yaw: number }
export type RoadsPartKind = 'vehicle' | 'warning' | 'cone' | 'delineator' | 'keep-left' | 'barrier' | 'flagger';
export interface RoadsLayout {
  vehicle?: RoadsPlacement; beaconOn: boolean; warning?: RoadsPlacement;
  cones: RoadsPlacement[]; delineators: RoadsPlacement[]; keepLeft?: RoadsPlacement; barriers: RoadsPlacement[]; flaggers: RoadsPlacement[];
}
export interface RoadsIssue { code: RoadsFault; stepId: RoadsStepId; critical: boolean; message: string; x: number; z: number }
export type RoadsFault = 'invalid-placement' | 'vehicle-unprotected' | 'vehicle-in-work-area' | 'advance-warning-missing'
  | 'advance-warning-distance' | 'warning-facing-away' | 'taper-too-short' | 'taper-angle' | 'cone-spacing'
  | 'keep-left-missing' | 'keep-left-position' | 'barrier-gap' | 'pedestrian-route-blocked' | 'delineator-in-live-lane'
  | 'flagger-missing' | 'flagger-in-live-lane' | 'flagger-refuge' | 'flagger-sight-line';
export interface RoadsZoneCheck {
  valid: boolean; checks: Record<RoadsStepId, boolean>; issues: RoadsIssue[];
  taper: { length: number; angleRadians: number; spacing: number; minSpacing: number; maxSpacing: number };
}

export const ROADS_GEOMETRY = {
  // 82 m authored street envelope: 7 m two-lane carriageway and 4 m clear sidewalk.
  bounds: { minX: -40, maxX: 40, minZ: -8, maxZ: 8 },
  road: { minZ: -3.5, maxZ: 3.5 },
  work: { minX: 8, maxX: 18, minZ: 0.5, maxZ: 3.5 },
  pedestrian: { minX: -40, maxX: 40, minZ: -7.35, maxZ: -4.0 },
  laneWidth: 3.5, carriagewayWidth: 7, eyeHeight: 1.6, tolerance: 0.08, angleTolerance: Math.PI / 6,
  coneRadius: 0.38, coneHalfWidth: 0.38, delineatorHalfX: 0.175, delineatorHalfZ: 0.10,
  // One authored barrier is a 1.8 m road barrier. The four-sided work zone is
  // assembled from a row of these real-size units; never inflate the checker
  // envelope to make a tabletop prop appear to cover an excavation.
  barrierHalfLength: 0.90, barrierHalfWidth: 0.08, barrierFootRadius: 0.13, flaggerRadius: 0.30,
  carHalfLength: 2.70, carHalfWidth: 1.34, coneHeight: 0.76,
} as const;

export function roadsRequirements(scenario: TrainingScenario) {
  const speedKph = scenario.variations.includes('speed-80') ? 80 : 60;
  const blindBend = scenario.variations.includes('blind-bend');
  const warningRange = blindBend ? speedKph === 80 ? [-8.2, -7.5] : [-7.8, -6.8]
    : speedKph === 80 ? [-7.4, -6.2] : [-6.2, -5.0];
  return { speedKph, blindBend, warningRange: warningRange as [number, number],
    minimumTaperLength: speedKph === 80 ? 8.0 : 6.0,
    minimumTaperAngle: 0.16, maximumTaperAngle: speedKph === 80 ? 0.44 : 0.51,
    // Full-size temporary cones are deliberately readable at 1.6 m eye height;
    // 80 km/h approaches allow a 1.8 m centre-to-centre guide, while the
    // 60 km/h drill keeps the tighter 1.35 m spacing.
    minimumConeCount: 6, maximumConeGap: speedKph === 80 ? 1.8 : 1.35 };
}

const finite = (placement: RoadsPlacement) => Number.isFinite(placement.x) && Number.isFinite(placement.z) && Number.isFinite(placement.yaw);
const within = (value: number, low: number, high: number, tolerance: number = ROADS_GEOMETRY.tolerance) => value >= low - tolerance && value <= high + tolerance;
const angleDelta = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const faces = (placement: RoadsPlacement, yaw: number) => angleDelta(placement.yaw, yaw) <= ROADS_GEOMETRY.angleTolerance;

/** A release snaps to a plane and preserves the chosen position/twist; there are no accepted slots. */
export function snapRoadsPlacement(placement: RoadsPlacement): RoadsPlacement | undefined {
  if (!finite(placement) || !placement.id.trim()) return undefined;
  const { bounds } = ROADS_GEOMETRY;
  return { id: placement.id, x: Math.max(bounds.minX, Math.min(bounds.maxX, placement.x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, placement.z)),
    yaw: Math.atan2(Math.sin(placement.yaw), Math.cos(placement.yaw)) };
}

function extent(placement: RoadsPlacement, halfX: number, halfZ: number) {
  const c = Math.abs(Math.cos(placement.yaw)); const s = Math.abs(Math.sin(placement.yaw));
  return { x: halfX * c + halfZ * s, z: halfX * s + halfZ * c };
}
function overlapsRect(placement: RoadsPlacement, halfX: number, halfZ: number, rect: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  // Separating-axis test, including object axes: rotated barriers do not reserve a misleading AABB.
  const centerX = (rect.minX + rect.maxX) / 2; const centerZ = (rect.minZ + rect.maxZ) / 2;
  const rectHalfX = (rect.maxX - rect.minX) / 2; const rectHalfZ = (rect.maxZ - rect.minZ) / 2;
  const dx = placement.x - centerX; const dz = placement.z - centerZ;
  const c = Math.cos(placement.yaw); const s = Math.sin(placement.yaw);
  const e = extent(placement, halfX, halfZ);
  return Math.abs(dx) < rectHalfX + e.x - 1e-9 && Math.abs(dz) < rectHalfZ + e.z - 1e-9
    && Math.abs(dx * c - dz * s) < halfX + rectHalfX * Math.abs(c) + rectHalfZ * Math.abs(s) - 1e-9
    && Math.abs(dx * s + dz * c) < halfZ + rectHalfX * Math.abs(s) + rectHalfZ * Math.abs(c) - 1e-9;
}

function segmentClear(a: RoadsPlacement, b: RoadsPlacement, blocker: RoadsPlacement | undefined): boolean {
  if (!blocker) return true;
  const dx = b.x - a.x; const dz = b.z - a.z; const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-8) return false;
  const t = ((blocker.x - a.x) * dx + (blocker.z - a.z) * dz) / lengthSq;
  if (t <= 0 || t >= 1) return true;
  const closestX = a.x + t * dx; const closestZ = a.z + t * dz;
  return !overlapsRect(blocker, ROADS_GEOMETRY.carHalfLength, ROADS_GEOMETRY.carHalfWidth, { minX: closestX - 0.16, maxX: closestX + 0.16, minZ: closestZ - 0.16, maxZ: closestZ + 0.16 });
}

function barrierCoversEdge(barriers: RoadsPlacement[], axis: 'x' | 'z', fixed: number, start: number, end: number): boolean {
  const intervals: [number, number][] = [];
  for (const barrier of barriers) {
    const longYaw = axis === 'x' ? 0 : Math.PI / 2;
    if (Math.min(angleDelta(barrier.yaw, longYaw), angleDelta(barrier.yaw, longYaw + Math.PI)) > 0.22) continue;
    if (Math.abs((axis === 'x' ? barrier.z : barrier.x) - fixed) > 0.25) continue;
    const center = axis === 'x' ? barrier.x : barrier.z;
    // Project the complete oriented footprint onto the edge axis. Using only
    // the long edge underestimates coverage for a twisted barrier and can
    // reject a physically continuous perimeter near an endpoint.
    const delta = barrier.yaw - longYaw;
    const half = ROADS_GEOMETRY.barrierHalfLength * Math.abs(Math.cos(delta))
      + ROADS_GEOMETRY.barrierHalfWidth * Math.abs(Math.sin(delta));
    intervals.push([center - half, center + half]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let coveredTo = start;
  for (const interval of intervals) {
    if (interval[0] > coveredTo + 0.25) return false;
    if (interval[1] >= coveredTo) coveredTo = interval[1];
    if (coveredTo >= end - ROADS_GEOMETRY.tolerance) return true;
  }
  return false;
}

/** Event-edge geometric audit. No DOM, renderer, biometrics, recordings or worker identities. */
export function checkRoadsLayout(layout: RoadsLayout, scenario: TrainingScenario = createRoadsScenario()): RoadsZoneCheck {
  const checks: RoadsZoneCheck['checks'] = { 'park-vehicle': true, 'advance-warning': true, 'cone-taper': true,
    'keep-left': true, 'protect-work-area': true, 'position-flaggers': true, 'test-traffic': false };
  const issues: RoadsIssue[] = [];
  const add = (code: RoadsFault, stepId: RoadsStepId, critical: boolean, message: string, placement?: RoadsPlacement) => {
    checks[stepId] = false;
    issues.push({ code, stepId, critical, message, x: placement && Number.isFinite(placement.x) ? placement.x : 13,
      z: placement && Number.isFinite(placement.z) ? placement.z : 1.65 });
  };
  const all: [RoadsPartKind, RoadsPlacement][] = [
    ...(layout.vehicle ? [['vehicle', layout.vehicle] as [RoadsPartKind, RoadsPlacement]] : []),
    ...(layout.warning ? [['warning', layout.warning] as [RoadsPartKind, RoadsPlacement]] : []),
    ...layout.cones.map((p): [RoadsPartKind, RoadsPlacement] => ['cone', p]),
    ...layout.delineators.map((p): [RoadsPartKind, RoadsPlacement] => ['delineator', p]),
    ...(layout.keepLeft ? [['keep-left', layout.keepLeft] as [RoadsPartKind, RoadsPlacement]] : []),
    ...layout.barriers.map((p): [RoadsPartKind, RoadsPlacement] => ['barrier', p]),
    ...layout.flaggers.map((p): [RoadsPartKind, RoadsPlacement] => ['flagger', p]),
  ];
  const kindStep: Record<RoadsPartKind, RoadsStepId> = { vehicle: 'park-vehicle', warning: 'advance-warning', cone: 'cone-taper',
    delineator: 'protect-work-area', 'keep-left': 'keep-left', barrier: 'protect-work-area', flagger: 'position-flaggers' };
  const ids = new Set<string>();
  for (const [kind, placement] of all) {
    if (!finite(placement) || !placement.id.trim() || ids.has(placement.id)
      || !within(placement.x, ROADS_GEOMETRY.bounds.minX, ROADS_GEOMETRY.bounds.maxX, 0)
      || !within(placement.z, ROADS_GEOMETRY.bounds.minZ, ROADS_GEOMETRY.bounds.maxZ, 0)) {
      add('invalid-placement', kindStep[kind], false, 'Return this part to the live road work area. Every part needs one finite, unique placement.', placement);
    }
    ids.add(placement.id);
  }
  const requirements = roadsRequirements(scenario);
  const vehicle = layout.vehicle;
  if (vehicle && finite(vehicle) && overlapsRect(vehicle, ROADS_GEOMETRY.carHalfLength, ROADS_GEOMETRY.carHalfWidth, ROADS_GEOMETRY.work)) {
    add('vehicle-in-work-area', 'park-vehicle', true, 'Work vehicle is inside the excavation area. Park upstream in a protected refuge.', vehicle);
  }
  if (!vehicle || !layout.beaconOn || !finite(vehicle) || !within(vehicle.x, -13, -3.5)
    || !within(vehicle.z, 4.84, 5.3) || !faces(vehicle, 0)) {
    add('vehicle-unprotected', 'park-vehicle', false, 'Park the crew van upstream beside the kerb, facing along the street; turn its beacon on.', vehicle);
  }
  const warning = layout.warning;
  if (!warning) add('advance-warning-missing', 'advance-warning', true, 'No advance warning. Drivers cannot prepare for the traffic-control zone.');
  else {
    if (!finite(warning) || !within(warning.x, ...requirements.warningRange) || !within(warning.z, 3.9, 5.3)) {
      add('advance-warning-distance', 'advance-warning', true, requirements.blindBend
        ? 'The bend hides the work area. Move advance warning earlier, into the bend scenario range.'
        : `Move advance warning into the ${requirements.speedKph} km/h scenario range. Distances are shown at full scale; use employer SOPs for real spacing.`, warning);
    }
    if (!faces(warning, -Math.PI / 2)) add('warning-facing-away', 'advance-warning', false, 'Rotate the warning face toward approaching traffic.', warning);
  }
  const cones = layout.cones.filter(finite).slice().sort((a, b) => a.x - b.x);
  const first = cones[0]; const last = cones[cones.length - 1];
  const length = first && last ? last.x - first.x : 0;
  const lateral = first && last ? first.z - last.z : 0;
  const angleRadians = length > 0 ? Math.atan2(lateral, length) : 0;
  let minSpacing = Infinity; let maxSpacing = 0; let gapTotal = 0;
  for (let index = 1; index < cones.length; index += 1) {
    const previous = cones[index - 1]; const cone = cones[index];
    const gap = Math.hypot(cone.x - previous.x, cone.z - previous.z);
    minSpacing = Math.min(minSpacing, gap); maxSpacing = Math.max(maxSpacing, gap); gapTotal += gap;
  }
  if (!first || !last || cones.length < requirements.minimumConeCount || length + ROADS_GEOMETRY.tolerance < requirements.minimumTaperLength) {
    add('taper-too-short', 'cone-taper', true, `Use at least six cones and a taper of ${Math.round(requirements.minimumTaperLength * 1000)} mm on this full-scale road.`, first);
  }
  if (first && last && (!within(first.z, 2.25, 3.1) || !within(last.z, -0.35, 0.45)
    || !within(last.x, 1.0, 3.0) || angleRadians < requirements.minimumTaperAngle - 0.025
    || angleRadians > requirements.maximumTaperAngle + 0.025
    || cones.some((cone, index) => !within(cone.z, -0.5, 3.5) || index > 0 && cone.z > cones[index - 1].z + 0.08))) {
    add('taper-angle', 'cone-taper', false, 'The taper must lead gradually from the closed lane into the keep-left lane before the excavation.', first);
  }
  if (cones.length >= 2 && (minSpacing < 0.65 - ROADS_GEOMETRY.tolerance
    || maxSpacing > requirements.maximumConeGap + ROADS_GEOMETRY.tolerance
    || maxSpacing > minSpacing * 1.5 + ROADS_GEOMETRY.tolerance)) {
    add('cone-spacing', 'cone-taper', false, 'Cone gaps are uneven or too large. Leave a continuous, evenly spaced guide through the merge.', first);
  }
  // Leave a real stopping buffer between the sign and taper. At 1:1 scale the
  // drill's authored sign sits roughly 0.8 m upstream of the first cone.
  if (warning && first && warning.x > first.x - 0.8 + ROADS_GEOMETRY.tolerance && !issues.some((issue) => issue.code === 'advance-warning-distance')) {
    add('advance-warning-distance', 'advance-warning', true, 'Advance warning must come before the first taper cone, with room to slow down.', warning);
  }
  const keepLeft = layout.keepLeft;
  if (!keepLeft) add('keep-left-missing', 'keep-left', false, 'Place the keep-left board beside the taper start.');
  else if (!first || !finite(keepLeft) || Math.abs(keepLeft.x - first.x) > 0.7 + ROADS_GEOMETRY.tolerance
    || !within(keepLeft.z, 3.9, 5.3) || !faces(keepLeft, -Math.PI / 2)) {
    add('keep-left-position', 'keep-left', false, 'Place the keep-left board beside the first cone and face it toward the approach.', keepLeft);
  }
  const work = ROADS_GEOMETRY.work;
  const barriers = layout.barriers.filter(finite);
  if (!barrierCoversEdge(barriers, 'x', work.minZ, work.minX, work.maxX)
    || !barrierCoversEdge(barriers, 'x', work.maxZ, work.minX, work.maxX)
    || !barrierCoversEdge(barriers, 'z', work.minX, work.minZ, work.maxZ)
    || !barrierCoversEdge(barriers, 'z', work.maxX, work.minZ, work.maxZ)) {
    add('barrier-gap', 'protect-work-area', false, 'Close the barrier perimeter on all four sides of the excavation. An open edge admits people or traffic.');
  }
  for (const [kind, placement] of all) {
    if (!finite(placement)) continue;
    const [halfX, halfZ] = kind === 'barrier' ? [ROADS_GEOMETRY.barrierHalfLength, ROADS_GEOMETRY.barrierHalfWidth] : kind === 'vehicle' ? [ROADS_GEOMETRY.carHalfLength, ROADS_GEOMETRY.carHalfWidth]
      : kind === 'flagger' ? [ROADS_GEOMETRY.flaggerRadius, ROADS_GEOMETRY.flaggerRadius] : kind === 'cone' ? [ROADS_GEOMETRY.coneHalfWidth, ROADS_GEOMETRY.coneHalfWidth]
      : kind === 'delineator' ? [ROADS_GEOMETRY.delineatorHalfX, ROADS_GEOMETRY.delineatorHalfZ] : [0.45, 0.30];
    if (overlapsRect(placement, halfX, halfZ, ROADS_GEOMETRY.pedestrian)) {
      add('pedestrian-route-blocked', 'protect-work-area', true, 'A part blocks the pedestrian corridor. Keep a continuous route clear; never send pedestrians into traffic.', placement);
      break;
    }
  }
  const liveRoad = { minX: ROADS_GEOMETRY.bounds.minX, maxX: ROADS_GEOMETRY.bounds.maxX, ...ROADS_GEOMETRY.road };
  for (const delineator of layout.delineators) {
    if (!finite(delineator)) continue;
    const halfX = ROADS_GEOMETRY.delineatorHalfX; const halfZ = ROADS_GEOMETRY.delineatorHalfZ;
    const footprint = extent(delineator, halfX, halfZ);
    // Only a foot wholly inside the barrier-protected work rectangle may occupy the road.
    const insideWork = delineator.x - footprint.x >= work.minX - 1e-9 && delineator.x + footprint.x <= work.maxX + 1e-9
      && delineator.z - footprint.z >= work.minZ - 1e-9 && delineator.z + footprint.z <= work.maxZ + 1e-9;
    if (!insideWork && overlapsRect(delineator, halfX, halfZ, liveRoad)) {
      add('delineator-in-live-lane', 'protect-work-area', true,
        'Delineator obstructs a live lane. Keep its foot on the shoulder or inside the protected work area.', delineator);
    }
  }
  const flaggers = layout.flaggers.filter(finite).slice().sort((a, b) => a.x - b.x);
  if (flaggers.length !== 2) add('flagger-missing', 'position-flaggers', false, 'Place exactly two Stop/Go marshals, one at each end of the zone.');
  for (let index = 0; index < flaggers.length; index += 1) {
    const flagger = flaggers[index];
    if (flagger.z - ROADS_GEOMETRY.flaggerRadius < ROADS_GEOMETRY.road.maxZ - 1e-9
      && flagger.z + ROADS_GEOMETRY.flaggerRadius > ROADS_GEOMETRY.road.minZ + 1e-9) add('flagger-in-live-lane', 'position-flaggers', true, 'Marshal exposed in a live lane. Move to the kerb refuge; a Stop/Go board does not protect an exposed person.', flagger);
    if (!within(flagger.z, 4.25, 4.9) || !within(flagger.x, index === 0 ? 5.4 : 21.3, index === 0 ? 6.0 : 22.7)) {
      add('flagger-refuge', 'position-flaggers', false, 'Give each marshal a clear kerb refuge at their end, away from the excavation and pedestrian path.', flagger);
    }
    if (!faces(flagger, index === 0 ? -Math.PI / 2 : Math.PI / 2)) {
      add('flagger-sight-line', 'position-flaggers', false, 'Rotate each Stop/Go board toward its approaching traffic and preserve communication between both ends.', flagger);
    }
  }
  if (flaggers.length === 2 && (!segmentClear(flaggers[0], flaggers[1], vehicle)
    || flaggers[1].x - flaggers[0].x < 12)) {
    add('flagger-sight-line', 'position-flaggers', false, 'A parked vehicle blocks the marshals’ sight line. Keep both ends visible and a clear communication plan.', flaggers[0]);
  }
  const valid = issues.length === 0;
  checks['test-traffic'] = valid;
  return { valid, checks, issues, taper: { length, angleRadians, spacing: cones.length > 1 ? gapTotal / (cones.length - 1) : 0,
    minSpacing: Number.isFinite(minSpacing) ? minSpacing : 0, maxSpacing } };
}

/** Continuous safe layout fixture, not snap slots: nearby valid placements pass the same audit. */
export function createGoodRoadsLayout(scenario: TrainingScenario = createRoadsScenario()): RoadsLayout {
  const requirements = roadsRequirements(scenario);
  const start = requirements.speedKph === 80 ? -6.3 : -4.5;
  const gap = requirements.speedKph === 80 ? 1.65 : 1.25;
  return {
    vehicle: { id: 'vehicle', ...ROADS_STAGING.van }, beaconOn: true,
    warning: { id: 'warning', x: requirements.warningRange[0] + 0.2, z: 4.65, yaw: -Math.PI / 2 },
    cones: Array.from({ length: 6 }, (_, index) => ({ id: `cone-${index + 1}`, x: start + index * gap, z: 2.75 - index * 0.47, yaw: 0 })),
    delineators: [],
    keepLeft: { id: 'keep-left', x: start, z: 4.65, yaw: -Math.PI / 2 },
    // Six 1.8 m barriers close each long edge, with two units stacked at
    // each end. Their footprints match the authored 1:1 props.
    barriers: [
      ...[8, 10, 12, 14, 16, 18].map((x, index) => ({ id: `barrier-${index + 1}`, x, z: 0.35, yaw: 0 })),
      ...[8, 10, 12, 14, 16, 18].map((x, index) => ({ id: `barrier-${index + 7}`, x, z: 3.65, yaw: 0 })),
      { id: 'barrier-13', x: 7.90, z: 0.95, yaw: Math.PI / 2 }, { id: 'barrier-14', x: 7.90, z: 2.75, yaw: Math.PI / 2 },
      { id: 'barrier-15', x: 18.10, z: 0.95, yaw: Math.PI / 2 }, { id: 'barrier-16', x: 18.10, z: 2.75, yaw: Math.PI / 2 },
    ],
    flaggers: [{ id: 'flagger-1', ...ROADS_STAGING.upstream }, { id: 'flagger-2', ...ROADS_STAGING.downstream }],
  };
}

export function createFaultyRoadsLayout(fault: RoadsFault, scenario: TrainingScenario = createRoadsScenario()): RoadsLayout {
  const layout = createGoodRoadsLayout(scenario);
  switch (fault) {
    case 'invalid-placement': layout.cones[0].x = Number.NaN; break;
    case 'vehicle-unprotected': layout.beaconOn = false; break;
    case 'vehicle-in-work-area': layout.vehicle!.x = 13; layout.vehicle!.z = 1.65; break;
    case 'advance-warning-missing': delete layout.warning; break;
    case 'advance-warning-distance': layout.warning!.x = -4.2; break;
    case 'warning-facing-away': layout.warning!.yaw = Math.PI / 2; break;
    case 'taper-too-short': layout.cones.forEach((cone) => { cone.x = 0.5 + (cone.x - 0.5) * 0.4; }); break;
    case 'taper-angle': layout.cones.forEach((cone) => { cone.z = 1.2; }); break;
    case 'cone-spacing': layout.cones[2].x = layout.cones[1].x + 0.12; break;
    case 'keep-left-missing': delete layout.keepLeft; break;
    case 'keep-left-position': layout.keepLeft!.x = 0.8; break;
    case 'barrier-gap': layout.barriers.pop(); break;
    case 'pedestrian-route-blocked': layout.barriers[1].z = -4.05; break;
    case 'delineator-in-live-lane': layout.delineators.push({ id: 'delineator-1', x: -10, z: 0, yaw: 0 }); break;
    case 'flagger-missing': layout.flaggers.pop(); break;
    case 'flagger-in-live-lane': layout.flaggers[0].z = 0; break;
    case 'flagger-refuge': layout.flaggers[0].x = 12; break;
    case 'flagger-sight-line': layout.flaggers[0].yaw = Math.PI / 2; break;
  }
  return layout;
}

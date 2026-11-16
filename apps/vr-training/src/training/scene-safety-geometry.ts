import type { TrainingScenario } from './contracts';

/** Metres on the 1:1 arterial. Traffic travels toward -Z, so upstream is +Z. */
export const FIRE_SCENE = {
  liveLaneMinX: 0.8,
  liveLaneMaxX: 4.5,
  liveLaneMinZ: -18,
  liveLaneMaxZ: 28,
  cable: { x: -6.2, z: 2.4 },
  exclusionRadius: 3,
  exclusionMarkRadius: 1.25,
  fuel: { x: -1.5, z: -3.4 },
  fuelDownstreamZ: -2.6,
  blocker: { minX: -3.6, maxX: -0.4, minZ: 8, maxZ: 16, downstreamZ: 1.5, minYaw: 25, maxYaw: 70 },
  taper: { count: 6, firstMinZ: 16, lastMinZ: 6, lastMaxZ: 11, minStepZ: 1.6, maxStepZ: 3.4, minStepX: 0.25, startMaxX: -4.2, endMinX: -3.2, endMaxX: -1 },
  flare: { minZ: 12, minCount: 2, nearCone: 2.5, coneMinZ: 14 },
  approach: { minX: -7.2, maxX: 0.2, minZ: -1, maxZ: 7.5 },
  triageLimitMs: 180_000,
} as const;

export const FIRE_HAZARDS = ['fuel-spill', 'downed-cable', 'unstable-vehicle', 'traffic'] as const;
export type SceneHazard = typeof FIRE_HAZARDS[number];

export const FIRE_HAZARD_POINTS: Readonly<Record<SceneHazard, { x: number; z: number }>> = {
  'fuel-spill': { x: FIRE_SCENE.fuel.x, z: FIRE_SCENE.fuel.z },
  'downed-cable': { x: FIRE_SCENE.cable.x, z: FIRE_SCENE.cable.z },
  'unstable-vehicle': { x: -1.7, z: 0.4 },
  traffic: { x: 2.3, z: 6 },
};

/** Instructional targets sit on clear ground, away from people and live hazards. */
export const FIRE_HAZARD_MARKERS: Readonly<Record<SceneHazard, { x: number; z: number }>> = {
  'fuel-spill': { x: FIRE_SCENE.fuel.x, z: FIRE_SCENE.fuel.z },
  'downed-cable': { x: -6.55, z: 6.2 },
  'unstable-vehicle': { x: -.8, z: 4.4 },
  traffic: { x: -.35, z: 6.8 },
};

export type CasualtyId = 'c1' | 'c2' | 'c3' | 'c4';
export type TriageTag = 'minor' | 'delayed' | 'immediate' | 'expectant';

export interface CasualtyVitals {
  id: CasualtyId;
  vest: 1 | 2 | 3 | 4;
  walking: boolean;
  breathing: boolean;
  breathsPerMinute: number;
  radialPulse: boolean;
  obeysCommands: boolean;
}

export const FIRE_CASUALTY_XZ: Readonly<Record<CasualtyId, { x: number; z: number }>> = {
  c1: { x: -5.2, z: 5.6 },
  c2: { x: -2.7, z: 1.3 },
  c3: { x: -1.5, z: -0.5 },
  c4: { x: -4.4, z: -1.5 },
};

/** Colour is never the only cue. Shape and the printed word travel with the tag. */
export const TRIAGE_TAGS: Readonly<Record<TriageTag, { color: string; shape: 'circle' | 'triangle' | 'diamond' | 'square'; label: string }>> = {
  minor: { color: '#1f8a4c', shape: 'circle', label: 'MINOR' },
  delayed: { color: '#c8960a', shape: 'triangle', label: 'DELAYED' },
  immediate: { color: '#c62828', shape: 'diamond', label: 'IMMEDIATE' },
  expectant: { color: '#f4f1ea', shape: 'square', label: 'EXPECTANT' },
};

const BASE_CASUALTIES: readonly CasualtyVitals[] = [
  { id: 'c1', vest: 1, walking: true, breathing: true, breathsPerMinute: 18, radialPulse: true, obeysCommands: true },
  { id: 'c2', vest: 2, walking: false, breathing: true, breathsPerMinute: 22, radialPulse: true, obeysCommands: true },
  { id: 'c3', vest: 3, walking: false, breathing: true, breathsPerMinute: 36, radialPulse: false, obeysCommands: false },
  { id: 'c4', vest: 4, walking: false, breathing: false, breathsPerMinute: 0, radialPulse: false, obeysCommands: false },
];

export interface FirePlacement { id: string; x: number; z: number; yaw: number }
export interface FireApproach { x: number; z: number }
export interface FireLayout {
  blocker?: FirePlacement;
  cones: FirePlacement[];
  flares: FirePlacement[];
  exclusion?: FirePlacement;
  approach?: FireApproach;
}

export interface BlockerAssessment { ok: boolean; downstream: boolean; liveLane: boolean; angled: boolean }
export interface ApproachAssessment { ok: boolean; liveLane: boolean; downstreamFuel: boolean; exclusion: boolean }

const CASUALTY_IDS: readonly CasualtyId[] = ['c1', 'c2', 'c3', 'c4'];

export function sceneCasualties(scenario: TrainingScenario): CasualtyVitals[] {
  const rows = BASE_CASUALTIES.map((row) => ({ ...row }));
  if (scenario.variations.includes('deteriorating-casualty')) {
    const deteriorating = rows.find((row) => row.id === 'c2');
    if (deteriorating) {
      deteriorating.breathsPerMinute = 36;
      deteriorating.radialPulse = false;
      deteriorating.obeysCommands = false;
    }
  }
  return rows;
}

/** Simplified illustrative START sort. Walking, then breathing, then rate, pulse and commands. */
export function classifyCasualty(casualty: CasualtyVitals): TriageTag {
  if (casualty.walking) return 'minor';
  if (!casualty.breathing) return 'expectant';
  if (casualty.breathsPerMinute >= 30 || !casualty.radialPulse || !casualty.obeysCommands) return 'immediate';
  return 'delayed';
}

export function criticalCasualty(casualty: CasualtyVitals): boolean {
  const tag = classifyCasualty(casualty);
  return tag === 'immediate' || tag === 'expectant';
}

export function casualtyCardCopy(casualty: CasualtyVitals): { title: string; body: string } {
  const rate = !casualty.breathing ? 'none' : casualty.breathsPerMinute >= 30 ? 'fast' : casualty.breathsPerMinute < 10 ? 'slow' : 'normal';
  return {
    title: `VEST ${casualty.vest}`,
    body: [
      casualty.walking ? 'Walking: yes' : 'Walking: no',
      `Breathing: ${casualty.breathing ? 'yes' : 'no'} / ${rate}`,
      casualty.radialPulse ? 'Radial pulse: present' : 'Radial pulse: absent',
      casualty.obeysCommands ? 'Obeys commands: yes' : 'Obeys commands: no',
    ].join('\n'),
  };
}

export function normalizeYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return Number.NaN;
  const turn = Math.PI * 2;
  let value = yaw % turn;
  if (value > Math.PI) value -= turn;
  if (value < -Math.PI) value += turn;
  return value;
}

export function finitePlacement(placement: FirePlacement | undefined): placement is FirePlacement {
  return !!placement && [placement.x, placement.z, placement.yaw].every((value) => Number.isFinite(value));
}

export function inLiveLane(x: number, z: number): boolean {
  return x > FIRE_SCENE.liveLaneMinX && x < FIRE_SCENE.liveLaneMaxX && z > FIRE_SCENE.liveLaneMinZ && z < FIRE_SCENE.liveLaneMaxZ;
}

export function inExclusion(x: number, z: number): boolean {
  const dx = x - FIRE_SCENE.cable.x;
  const dz = z - FIRE_SCENE.cable.z;
  return dx * dx + dz * dz < FIRE_SCENE.exclusionRadius * FIRE_SCENE.exclusionRadius;
}

export function assessBlocker(placement: FirePlacement | undefined): BlockerAssessment {
  if (!finitePlacement(placement)) return { ok: false, downstream: false, liveLane: false, angled: false };
  const downstream = placement.z < FIRE_SCENE.blocker.downstreamZ;
  const liveLane = placement.x > FIRE_SCENE.liveLaneMinX;
  const yaw = Math.abs(normalizeYaw(placement.yaw)) * 180 / Math.PI;
  const angled = yaw >= FIRE_SCENE.blocker.minYaw && yaw <= FIRE_SCENE.blocker.maxYaw;
  const upstream = placement.z >= FIRE_SCENE.blocker.minZ && placement.z <= FIRE_SCENE.blocker.maxZ;
  const covers = placement.x >= FIRE_SCENE.blocker.minX && placement.x <= FIRE_SCENE.blocker.maxX;
  return { ok: !downstream && !liveLane && angled && upstream && covers, downstream, liveLane, angled };
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function assessTaper(cones: readonly FirePlacement[], flares: readonly FirePlacement[]): { conesOk: boolean; flaresOk: boolean } {
  const placed = cones.filter(finitePlacement);
  if (placed.length !== FIRE_SCENE.taper.count) return { conesOk: false, flaresOk: false };
  const ordered = [...placed].sort((a, b) => b.z - a.z);
  let conesOk = ordered[0].z >= FIRE_SCENE.taper.firstMinZ
    && ordered[0].x <= FIRE_SCENE.taper.startMaxX
    && ordered[ordered.length - 1].z >= FIRE_SCENE.taper.lastMinZ
    && ordered[ordered.length - 1].z <= FIRE_SCENE.taper.lastMaxZ
    && ordered[ordered.length - 1].x >= FIRE_SCENE.taper.endMinX
    && ordered[ordered.length - 1].x <= FIRE_SCENE.taper.endMaxX;
  for (let index = 0; index < ordered.length; index += 1) {
    const cone = ordered[index];
    if (cone.x >= FIRE_SCENE.liveLaneMinX || inExclusion(cone.x, cone.z)) conesOk = false;
    if (index === 0) continue;
    const stepZ = ordered[index - 1].z - cone.z;
    const stepX = cone.x - ordered[index - 1].x;
    if (stepZ < FIRE_SCENE.taper.minStepZ || stepZ > FIRE_SCENE.taper.maxStepZ || stepX < FIRE_SCENE.taper.minStepX) conesOk = false;
  }
  const safeFlares = flares.filter((flare) => finitePlacement(flare)
    && flare.z >= FIRE_SCENE.flare.minZ
    && flare.x < FIRE_SCENE.liveLaneMinX
    && !inExclusion(flare.x, flare.z)
    && ordered.some((cone) => cone.z >= FIRE_SCENE.flare.coneMinZ && distance(cone, flare) <= FIRE_SCENE.flare.nearCone));
  return { conesOk, flaresOk: conesOk && safeFlares.length >= FIRE_SCENE.flare.minCount };
}

export function assessExclusion(placement: FirePlacement | undefined): boolean {
  return finitePlacement(placement) && distance(placement, FIRE_SCENE.cable) <= FIRE_SCENE.exclusionMarkRadius && !inLiveLane(placement.x, placement.z);
}

export function assessApproach(point: FireApproach | undefined): ApproachAssessment {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return { ok: false, liveLane: false, downstreamFuel: false, exclusion: false };
  const liveLane = inLiveLane(point.x, point.z);
  const downstreamFuel = point.z < FIRE_SCENE.fuelDownstreamZ;
  const exclusion = inExclusion(point.x, point.z);
  const ok = !liveLane && !downstreamFuel && !exclusion
    && point.x >= FIRE_SCENE.approach.minX && point.x <= FIRE_SCENE.approach.maxX
    && point.z >= FIRE_SCENE.approach.minZ && point.z <= FIRE_SCENE.approach.maxZ;
  return { ok, liveLane, downstreamFuel, exclusion };
}

export function createGoodFireLayout(): FireLayout {
  const cones = [0, 1, 2, 3, 4, 5].map((index) => ({
    id: `cone-${index + 1}`, x: -5.3 + index * 0.6, z: 20 - index * 2.4, yaw: 0,
  }));
  return {
    blocker: { id: 'engine', x: -1.9, z: 11.5, yaw: 0.7 },
    cones,
    flares: [
      { id: 'flare-1', x: -5.6, z: 21.2, yaw: 0 },
      { id: 'flare-2', x: -4.9, z: 18.4, yaw: 0 },
      { id: 'flare-3', x: -4.2, z: 15.8, yaw: 0 },
    ],
    exclusion: { id: 'exclusion', x: FIRE_SCENE.cable.x, z: FIRE_SCENE.cable.z, yaw: 0 },
    approach: { x: -4.2, z: 5.8 },
  };
}

export function tagsMatch(scenario: TrainingScenario, tags: Readonly<Partial<Record<CasualtyId, TriageTag>>>): boolean {
  return sceneCasualties(scenario).every((casualty) => tags[casualty.id] === classifyCasualty(casualty));
}

export function casualtyById(scenario: TrainingScenario, id: string): CasualtyVitals | undefined {
  return CASUALTY_IDS.includes(id as CasualtyId) ? sceneCasualties(scenario).find((casualty) => casualty.id === id) : undefined;
}

export const HANDOVER_FIELDS = ['schema', 'categories', 'hazards', 'unitsNeeded', 'cableStatus'] as const;
export interface SceneHandover {
  schema: 'civicops.scene-safety.handover.v1';
  categories: Record<TriageTag, number>;
  hazards: SceneHazard[];
  unitsNeeded: string[];
  cableStatus: 'treat-as-live';
}

export function buildHandover(scenario: TrainingScenario, hazards: readonly SceneHazard[]): SceneHandover {
  const categories: Record<TriageTag, number> = { minor: 0, delayed: 0, immediate: 0, expectant: 0 };
  for (const casualty of sceneCasualties(scenario)) categories[classifyCasualty(casualty)] += 1;
  return {
    schema: 'civicops.scene-safety.handover.v1',
    categories,
    hazards: FIRE_HAZARDS.filter((hazard) => hazards.includes(hazard)),
    unitsNeeded: ['Electricity isolation', 'Fire suppression', categories.immediate > 0 ? 'EMS transport' : 'EMS standby', 'Traffic control'],
    cableStatus: 'treat-as-live',
  };
}

/** Rejects extra keys, media and any person-identity field before a card can be stored. */
export function parseSceneHandover(value: unknown): SceneHandover | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== [...HANDOVER_FIELDS].sort().join()) return undefined;
  if (record.schema !== 'civicops.scene-safety.handover.v1' || record.cableStatus !== 'treat-as-live') return undefined;
  const categories = record.categories;
  if (typeof categories !== 'object' || categories === null || Array.isArray(categories)) return undefined;
  const counts = categories as Record<string, unknown>;
  if (Object.keys(counts).sort().join() !== 'delayed,expectant,immediate,minor') return undefined;
  if (!Object.values(counts).every((count) => typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= 4)) return undefined;
  const hazards = record.hazards;
  const units = record.unitsNeeded;
  if (!Array.isArray(hazards) || !Array.isArray(units)) return undefined;
  if (!hazards.every((hazard) => typeof hazard === 'string' && (FIRE_HAZARDS as readonly string[]).includes(hazard))) return undefined;
  if (!units.every((unit) => typeof unit === 'string' && unit.length > 0 && unit.length <= 40)) return undefined;
  return {
    schema: 'civicops.scene-safety.handover.v1',
    categories: { minor: counts.minor as number, delayed: counts.delayed as number, immediate: counts.immediate as number, expectant: counts.expectant as number },
    hazards: [...hazards] as SceneHazard[],
    unitsNeeded: [...units],
    cableStatus: 'treat-as-live',
  };
}

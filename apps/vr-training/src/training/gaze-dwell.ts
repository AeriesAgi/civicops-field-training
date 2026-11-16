import { DWELL_MS } from './accessibility-settings.js';

/**
 * Look-to-press for the four training modules and the work-order board. The head ray picks the
 * nearest visible button; holding the gaze for DWELL_MS presses it once. Choices that reset work,
 * leave the job, enter a live lane or answer a pre-shift check need twice as long.
 */
export interface P3 { x: number; y: number; z: number }
export interface GazePlane { id: string; center: P3; right: P3; up: P3; normal: P3; halfWidth: number; halfHeight: number }

const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;

export const SLOW_DWELL = /reset|unsafe|jobs|programme-choice/;
export function dwellMsFor(id: string): number { return SLOW_DWELL.test(id) ? DWELL_MS * 2 : DWELL_MS; }
export function dwellToggleLabel(on: boolean): string { return on ? 'Dwell: on' : 'Dwell: off'; }

/** Distance along the gaze ray to the button face, or undefined when the ray misses it. */
export function gazeDistance(origin: P3, direction: P3, target: GazePlane): number | undefined {
  const facing = dot(direction, target.normal);
  if (Math.abs(facing) < 1e-6) return undefined;
  const offset = { x: target.center.x - origin.x, y: target.center.y - origin.y, z: target.center.z - origin.z };
  const distance = dot(offset, target.normal) / facing;
  if (!(distance > 0)) return undefined;
  const rel = { x: origin.x + direction.x * distance - target.center.x, y: origin.y + direction.y * distance - target.center.y, z: origin.z + direction.z * distance - target.center.z };
  return Math.abs(dot(rel, target.right)) <= target.halfWidth && Math.abs(dot(rel, target.up)) <= target.halfHeight ? distance : undefined;
}

export function pickGazeTarget(origin: P3, direction: P3, targets: readonly GazePlane[]): string {
  let best = '', nearest = Infinity;
  for (const target of targets) {
    const distance = gazeDistance(origin, direction, target);
    if (distance !== undefined && distance < nearest) { nearest = distance; best = target.id; }
  }
  return best;
}

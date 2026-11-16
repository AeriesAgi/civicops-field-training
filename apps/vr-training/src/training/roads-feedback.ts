import type { TrafficReaction } from './roads-traffic.js';

const TRAFFIC_CAPTIONS: Readonly<Record<TrafficReaction, string>> = {
  cruise: 'FLOW / Clear of the work', slow: 'SLOW / Advance warning',
  merge: 'MERGE / Cone guide clear', stop: 'HOLD / Marshal control',
  'hard-brake': 'BRAKING / Repair the zone', 'cone-contact': 'CONTACT / Taper unsafe',
};

/** Build once: positive-Y winding makes the front faces visible from the seated viewpoint. */
export function buildRoadsRulerSurface(): number[] {
  const positions: number[] = [];
  // Six metre full-scale ruler: the runtime scales X for the scenario's
  // minimum taper (6 m at 60 km/h, 8 m at 80 km/h).
  for (let tick = 0; tick < 12; tick += 1) {
    const x = -3 + tick * .5, width = .04, y = .12, z = 0, depth = .30;
    positions.push(x, y, z, x + width, y, z + depth, x + width, y, z,
      x, y, z, x, y, z + depth, x + width, y, z + depth);
  }
  // A continuous edge makes the measurement readable beside the lane markings.
  positions.push(-3, .12, .26, 3, .12, .30, 3, .12, .26,
    -3, .12, .26, -3, .12, .30, 3, .12, .30);
  return positions;
}

/** Check-edge placement: above the kerb and beside the part rather than beneath its base. */
export function roadFeedbackMarker(x: number, z: number): [number, number, number] {
  return [x, .13, z - .80];
}

/** Failed demonstrations keep their safety state visible between braking/contact moments.
 * All results are cached strings: calling this during animation allocates nothing.
 */
export function roadTrafficCaption(reaction: TrafficReaction, failed: boolean): string {
  return failed && reaction !== 'hard-brake' && reaction !== 'cone-contact'
    ? 'UNSAFE / Repair the zone' : TRAFFIC_CAPTIONS[reaction];
}

import { describe, expect, it } from 'vitest';
import { createRoadsScenario } from './modules/roads-zone';
import { checkRoadsLayout, createFaultyRoadsLayout, createGoodRoadsLayout, ROADS_GEOMETRY } from './roads-geometry';
import { ROADS_TRAFFIC_STOP_CLEARANCE, ROADS_TRAFFIC_CYCLE_SECONDS, ROADS_TRAFFIC_CAR_HALF_LENGTH, ROADS_TRAFFIC_CAR_HALF_WIDTH, sampleRoadTraffic, trafficRoute, upstreamRoadsFlagger, type TrafficPose } from './roads-traffic';

const pose = (): TrafficPose => ({ x: 0, z: 0, yaw: 0, reaction: 'cruise' });
function coneDistance(car: TrafficPose, x: number, z: number): number { const dx = x - car.x; const dz = z - car.z; const c = Math.cos(car.yaw); const s = Math.sin(car.yaw); const along = dx * c - dz * s; const across = dx * s + dz * c; return Math.hypot(Math.max(0, Math.abs(along) - ROADS_TRAFFIC_CAR_HALF_LENGTH), Math.max(0, Math.abs(across) - ROADS_TRAFFIC_CAR_HALF_WIDTH)); }

describe('allocation-free full-scale traffic demonstration', () => {
  it('slows at warning, stops at the marshal, then merges around the work', () => {
    const route = trafficRoute(createGoodRoadsLayout(), true); const out = pose();
    sampleRoadTraffic(4, 0, route, out); expect(out.reaction).toBe('slow');
    sampleRoadTraffic(11, 0, route, out); expect(out.reaction).toBe('stop'); expect(out.x).toBeCloseTo(route.stopX - ROADS_TRAFFIC_STOP_CLEARANCE);
    sampleRoadTraffic(14, 0, route, out); expect(out.reaction).toBe('merge'); expect(out.z).toBeLessThan(0);
    sampleRoadTraffic(19, 0, route, out); expect(out.z).toBeCloseTo(route.laneAfter);
  });
  it.each([0, 1, 2, 3])('keeps the real car footprint clear of cones for seed %i', (seed) => {
    const scenario = createRoadsScenario(seed); const layout = createGoodRoadsLayout(scenario); const route = trafficRoute(layout, checkRoadsLayout(layout, scenario).valid); const out = pose(); let minimum = Infinity;
    for (let step = 0; step < 4800; step += 1) for (const offset of [0, 7.7, 15.4]) { sampleRoadTraffic(step * .005, offset, route, out); for (const cone of layout.cones) minimum = Math.min(minimum, coneDistance(out, cone.x, cone.z)); }
    expect(minimum).toBeGreaterThan(ROADS_GEOMETRY.coneRadius);
  });
  it('uses the upstream placed marshal and handles missing/nonfinite placements', () => {
    const layout = createGoodRoadsLayout(); const upstream = upstreamRoadsFlagger(layout.flaggers)!; expect(upstream).toBe(layout.flaggers[0]); expect(trafficRoute(layout, true).stopX).toBe(upstream.x);
    layout.flaggers.shift(); expect(upstreamRoadsFlagger(layout.flaggers)?.id).toBe('flagger-2'); expect(trafficRoute(layout, false).stopX).toBe(22); layout.flaggers.length = 0; expect(upstreamRoadsFlagger(layout.flaggers)).toBeUndefined(); expect(trafficRoute(layout, false).stopX).toBe(4.4);
    const invalid = createGoodRoadsLayout(); invalid.flaggers[0].x = Number.NaN; expect(upstreamRoadsFlagger(invalid.flaggers)).toBe(invalid.flaggers[1]);
  });
  it('keeps placement ordering independent of the traffic stop', () => { const layout = createGoodRoadsLayout(); layout.flaggers.reverse(); expect(trafficRoute(layout, true).stopX).toBe(5.7); });
  it('does not teleport at phase boundaries and repeats exactly on a loop', () => {
    const route = trafficRoute(createGoodRoadsLayout(), true); const before = pose(); const after = pose();
    for (const boundary of [3, 9, 13, 24]) { sampleRoadTraffic(boundary - .000001, 0, route, before); sampleRoadTraffic(boundary + .000001, 0, route, after); if (boundary < 24) expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(.001); else { expect(before.x).toBeGreaterThan(39); expect(after.x).toBeLessThan(-39); } }
    sampleRoadTraffic(16, 7.7, route, before); const first = { ...before }; sampleRoadTraffic(16 + ROADS_TRAFFIC_CYCLE_SECONDS, 7.7, route, before); expect(before).toEqual(first);
  });
  it('maintains 6.5 metre queue spacing at STOP', () => { const route = trafficRoute(createGoodRoadsLayout(), true); const leader = pose(); const following = pose(); sampleRoadTraffic(11, 0, route, leader); sampleRoadTraffic(11, 7.7, route, following); expect(leader.x - following.x).toBeCloseTo(6.5); expect(leader.reaction).toBe('stop'); });
  it('moves slower after warning and brakes for unsafe geometry', () => {
    const route = trafficRoute(createGoodRoadsLayout(), true); const a = pose(); const b = pose(); sampleRoadTraffic(4, 0, route, a); sampleRoadTraffic(4.1, 0, route, b); expect(b.x - a.x).toBeGreaterThan(0); sampleRoadTraffic(1, 0, route, a); sampleRoadTraffic(1.1, 0, route, b); expect(b.x - a.x).toBeGreaterThan(0);
    const layout = createFaultyRoadsLayout('taper-too-short'); const check = checkRoadsLayout(layout); const unsafe = trafficRoute(layout, false, check.issues.find((issue) => issue.code === 'taper-too-short')); sampleRoadTraffic(11, 0, unsafe, a); expect(['hard-brake', 'cone-contact']).toContain(a.reaction);
  });
  it('keeps missing-layout animation finite', () => { const layout = createGoodRoadsLayout(); layout.cones[0].x = Number.NaN; layout.warning!.x = Infinity; layout.flaggers[0].x = Number.NaN; const route = trafficRoute(layout, false); const out = pose(); for (const seconds of [NaN, Infinity, -2, 8, 14, 21]) { sampleRoadTraffic(seconds, NaN, route, out); expect([out.x, out.z, out.yaw].every(Number.isFinite)).toBe(true); } });
});

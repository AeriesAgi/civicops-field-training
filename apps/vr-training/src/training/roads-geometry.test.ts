import { describe, expect, it } from 'vitest';
import { createRoadsScenario } from './modules/roads-zone';
import { checkRoadsLayout, createFaultyRoadsLayout, createGoodRoadsLayout, roadsRequirements, snapRoadsPlacement, ROADS_GEOMETRY, type RoadsFault } from './roads-geometry';

const faults: RoadsFault[] = ['invalid-placement', 'vehicle-unprotected', 'vehicle-in-work-area', 'advance-warning-missing', 'advance-warning-distance', 'warning-facing-away', 'taper-too-short', 'taper-angle', 'cone-spacing', 'keep-left-missing', 'keep-left-position', 'barrier-gap', 'pedestrian-route-blocked', 'delineator-in-live-lane', 'flagger-missing', 'flagger-in-live-lane', 'flagger-refuge', 'flagger-sight-line'];

describe('Roads full-scale geometric zone audit', () => {
  it.each([0, 1, 2, 3])('accepts the 1:1 layout for seed %i', (seed) => {
    const scenario = createRoadsScenario(seed); const check = checkRoadsLayout(createGoodRoadsLayout(scenario), scenario);
    expect(check.issues).toEqual([]); expect(check.valid).toBe(true); expect(Object.values(check.checks).every(Boolean)).toBe(true);
    expect(check.taper.length).toBeGreaterThan(roadsRequirements(scenario).minimumTaperLength);
  });
  it.each(faults)('catches the %s fixture', (fault) => {
    const check = checkRoadsLayout(createFaultyRoadsLayout(fault));
    expect(check.valid).toBe(false); expect(check.issues.some((issue) => issue.code === fault)).toBe(true);
    expect(check.issues.every((issue) => Number.isFinite(issue.x) && Number.isFinite(issue.z))).toBe(true);
  });
  it.each(['vehicle-in-work-area', 'advance-warning-missing', 'advance-warning-distance', 'taper-too-short', 'pedestrian-route-blocked', 'delineator-in-live-lane', 'flagger-in-live-lane'] as const)('marks %s critical', (fault) => {
    expect(checkRoadsLayout(createFaultyRoadsLayout(fault)).issues.find((issue) => issue.code === fault)?.critical).toBe(true);
  });
  it('accepts continuous placements within real-world tolerances', () => {
    const layout = createGoodRoadsLayout(); layout.cones.forEach((cone, i) => { cone.x += i % 2 ? .04 : -.04; cone.z += .03; });
    layout.warning!.x += .04; layout.warning!.yaw += .2; layout.flaggers[0].x += .06; layout.barriers[0].z += .03;
    expect(checkRoadsLayout(layout).valid).toBe(true);
  });
  it('applies speed and blind-bend warning requirements', () => {
    const normal = roadsRequirements(createRoadsScenario()); const fast = roadsRequirements(createRoadsScenario(1));
    expect(fast.minimumTaperLength).toBeGreaterThan(normal.minimumTaperLength);
    const bend = createRoadsScenario(2); const layout = createGoodRoadsLayout(bend); expect(checkRoadsLayout(layout, bend).valid).toBe(true);
    layout.warning!.x = -6; expect(checkRoadsLayout(layout, bend).issues.some((i) => i.code === 'advance-warning-distance')).toBe(true);
  });
  it('normalises arbitrary twists and clamps the 82 m street envelope', () => {
    const p = { id: 'cone-1', x: .1234, z: .0567, yaw: Math.PI * 4 + .17 }; const snapped = snapRoadsPlacement(p)!;
    expect(snapped.x).toBe(p.x); expect(snapped.z).toBe(p.z); expect(snapped.yaw).toBeCloseTo(.17); expect(p.yaw).toBeGreaterThan(Math.PI * 4);
    expect(snapRoadsPlacement({ ...p, x: 90, z: -90 })).toMatchObject({ x: 40, z: -8 });
  });
  it.each([Number.NaN, Infinity, -Infinity])('rejects nonfinite placement data %s', (n) => {
    expect(snapRoadsPlacement({ id: 'x', x: n, z: 0, yaw: 0 })).toBeUndefined(); expect(snapRoadsPlacement({ id: 'x', x: 0, z: n, yaw: 0 })).toBeUndefined(); expect(snapRoadsPlacement({ id: 'x', x: 0, z: 0, yaw: n })).toBeUndefined();
  });
  it('rejects duplicate IDs and out-of-envelope positions', () => {
    const duplicate = createGoodRoadsLayout(); duplicate.cones[1].id = duplicate.cones[0].id; expect(checkRoadsLayout(duplicate).issues.map((i) => i.code)).toContain('invalid-placement');
    const outside = createGoodRoadsLayout(); outside.cones[0].x = -41; expect(checkRoadsLayout(outside).issues.map((i) => i.code)).toContain('invalid-placement'); expect(snapRoadsPlacement({ id: ' ', x: 0, z: 0, yaw: 0 })).toBeUndefined();
  });
  it('does not mutate or resort placement arrays', () => { const layout = createGoodRoadsLayout(); layout.cones.reverse(); const snapshot = JSON.stringify(layout); expect(checkRoadsLayout(layout).valid).toBe(true); expect(JSON.stringify(layout)).toBe(snapshot); });
  it('keeps the pedestrian corridor clear but catches an actual footprint intrusion', () => {
    const layout = createGoodRoadsLayout(); layout.barriers[0].z = -4.05; expect(checkRoadsLayout(layout).issues.map((i) => i.code)).toContain('pedestrian-route-blocked');
  });
  it('checks full-size marshals and delineator road footprints', () => {
    const layout = createGoodRoadsLayout(); layout.flaggers[0].z = 3.45; expect(checkRoadsLayout(layout).issues.map((i) => i.code)).toContain('flagger-in-live-lane');
    const delineator = { id: 'delineator-1', x: -10, z: 0, yaw: 0 }; layout.flaggers[0].z = 4.65; layout.delineators.push(delineator); expect(checkRoadsLayout(layout).issues.map((i) => i.code)).toContain('delineator-in-live-lane');
  });
  it('accepts optional shoulder delineators', () => { const layout = createGoodRoadsLayout(); layout.delineators.push({ id: 'delineator-1', x: -10, z: 4.65, yaw: 0 }); expect(checkRoadsLayout(layout).valid).toBe(true); });
  it('rejects an incomplete barrier perimeter and accepts the complete 1.8 m row', () => { const layout = createGoodRoadsLayout(); expect(checkRoadsLayout(layout).valid).toBe(true); layout.barriers.pop(); expect(checkRoadsLayout(layout).issues.map((i) => i.code)).toContain('barrier-gap'); });
  it('uses full-size car/road dimensions', () => { expect(ROADS_GEOMETRY.laneWidth).toBeCloseTo(3.5); expect(ROADS_GEOMETRY.carHalfLength).toBeCloseTo(2.70); expect(ROADS_GEOMETRY.barrierHalfLength).toBeCloseTo(.9); expect(ROADS_GEOMETRY.eyeHeight).toBeCloseTo(1.6); });
});

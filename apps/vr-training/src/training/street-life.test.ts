import { describe, expect, it } from 'vitest';
import { streetActorHeight, streetKind, streetRoute, type StreetKind } from './street-life.js';

describe('street background safety', () => {
  const pose = { along: 0, across: 0, heading: 0 };
  it('selects field sessions and leaves the depot without street actors', () => {
    expect(streetKind('bench-rig')).toBe('electrical');
    expect(streetKind('water-session')).toBe('water');
    expect(streetKind('roads-session')).toBe('roads');
    expect(streetKind('fire-session')).toBe('fire');
    expect(streetKind('department-board-panel')).toBeUndefined();
  });
  for (const kind of ['electrical', 'water', 'roads', 'fire'] as StreetKind[]) {
    it(`${kind}: pedestrians stay outside the carriageway for a complete route`, () => {
      const half = kind === 'electrical' || kind === 'roads' ? 3.5 : 7;
      for (let index = 0; index < 4; index++) for (let seconds = 0; seconds < 240; seconds += 2) {
        streetRoute(kind, true, index, seconds, pose);
        expect(Math.abs(pose.across)).toBeGreaterThan(half + .5);
        expect(pose.along).toBeGreaterThanOrEqual(-25);
        expect(pose.along).toBeLessThan(37);
        expect(Number.isFinite(pose.heading)).toBe(true);
      }
    });
    it(`${kind}: moving taxis keep left relative to their actual travel heading`, () => {
      for (const index of [0, 1]) {
        streetRoute(kind, false, index, 8, pose);
        const lateralX = kind === 'roads' ? 0 : pose.across;
        const lateralZ = kind === 'roads' ? pose.across : 0;
        // Left vector = world-up cross forward; independent of street orientation.
        const leftProjection = lateralX * Math.cos(pose.heading) - lateralZ * Math.sin(pose.heading);
        expect(leftProjection).toBeGreaterThan(0);
      }
    });
    it(`${kind}: background taxis never drive through the assessed hazard area`, () => {
      for (let index = 0; index < 2; index++) for (let seconds = 0; seconds < 240; seconds += 2) {
        streetRoute(kind, false, index, seconds, pose);
        if (kind === 'roads') expect(pose.along).toBeLessThan(-23);
        else expect(pose.along).toBeGreaterThanOrEqual(24);
      }
      streetRoute(kind, false, 2, 0, pose);
      const parked = { ...pose };
      streetRoute(kind, false, 2, 999, pose);
      expect(pose).toEqual(parked);
    });
  }
  it('parks the full minibus clear of street poles and the pedestrian crossing', () => {
    streetRoute('roads', false, 2, 0, pose);
    const halfLength = 5.35 / 2;
    for (const pole of [-34, -24, -4, 1, 26]) expect(Math.abs(pose.along - pole)).toBeGreaterThan(halfLength + .2);
    expect(pose.along + halfLength).toBeLessThan(-11);
    // The closest house boundary starts at -26.45; the complete van must clear it.
    expect(pose.along + halfLength).toBeLessThan(-26.45);
    expect(pose.along + halfLength).toBeLessThan(-25); // outside the pedestrian loop
    // Width clears the south kerb; the wheels are on the 42cm pavement surface.
    expect(pose.across + 1).toBeLessThan(-3.7);
  });
  it('keeps parked vans outside the Electrical cabinet and other assessed work areas',()=>{
    streetRoute('electrical',false,2,0,pose);
    const vanMinZ=-pose.along-5.35/2;
    expect(vanMinZ).toBeGreaterThan(-5.6); // cabinet/bench ends at z=-5.6
    expect(Math.abs(pose.across)+1.1).toBeLessThanOrEqual(3.5); // asphalt, clear footpath
    streetRoute('water',false,2,0,pose);expect(pose.along+5.35/2).toBeLessThan(-8);
    streetRoute('fire',false,2,0,pose);expect(pose.along-5.35/2).toBeGreaterThan(18);
    expect(streetActorHeight('electrical',false,true)).toBe(0);
    expect(streetActorHeight('water',false,true)).toBe(.04);
    expect(streetActorHeight('roads',false,true)).toBe(.42);
    expect(streetActorHeight('fire',false,true)).toBe(.08);
  });
});

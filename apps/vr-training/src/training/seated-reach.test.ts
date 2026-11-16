import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './accessibility-settings';
import { SEATED, seatedMode, seatedTrayPoses, trayPoint, trayViewDistance, workingShoulder, type ReachSettings } from './seated-reach';

const settings = (patch: Partial<ReachSettings> = {}): ReachSettings => ({ reachM: DEFAULT_SETTINGS.reachM, benchHeightOffset: 0, leftHanded: false, pokeOnly: false, ...patch });
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function corners(pose: Parameters<typeof trayPoint>[0], scale: number) {
  const { halfWidthM: w, halfHeightM: h } = SEATED.panel;
  return [[-w, -h], [w, -h], [-w, h], [w, h], [0, 0]].map(([u, v]) => trayPoint(pose, scale, u, v));
}

describe('seated reach mode', () => {
  it('turns on below seated eye height and off only once clearly standing', () => {
    expect(seatedMode(false, 1.25, settings())).toBe(true);
    expect(seatedMode(false, 1.4, settings())).toBe(false);
    expect(seatedMode(true, 1.4, settings())).toBe(true);
    expect(seatedMode(true, 1.6, settings())).toBe(false);
  });
  it('always uses the in-reach tray when poke-only input is chosen', () => {
    expect(seatedMode(false, 1.7, settings({ pokeOnly: true }))).toBe(true);
  });
});

describe('seated tray layout', () => {
  const head = { x: 2, y: 1.2, z: -3 };
  for (const yaw of [0, Math.PI / 2, -2.4]) {
    for (const leftHanded of [false, true]) {
      it(`puts every point of both panels inside the 0.55 m reach (yaw ${yaw.toFixed(1)}, ${leftHanded ? 'left' : 'right'} hand)`, () => {
        const s = settings({ leftHanded });
        const tray = seatedTrayPoses(head, yaw, s);
        const work = workingShoulder(head, yaw, leftHanded), other = workingShoulder(head, yaw, !leftHanded);
        for (const p of corners(tray.controls, tray.scale)) expect(dist(p, work)).toBeLessThanOrEqual(s.reachM + 1e-9);
        for (const p of corners(tray.steps, tray.scale)) expect(dist(p, other)).toBeLessThanOrEqual(s.reachM + 1e-9);
      });
    }
  }
  it('keeps controls on the working-hand side and below the eyes, tilted up to face the trainee', () => {
    const tray = seatedTrayPoses({ x: 0, y: 1.2, z: 0 }, 0, settings());
    expect(tray.controls.x).toBeGreaterThan(0); expect(tray.steps.x).toBeLessThan(0);
    expect(tray.controls.y).toBeLessThan(1.2); expect(tray.controls.z).toBeLessThan(-SEATED.minViewM + 1e-9);
    expect(tray.controls.pitch).toBeLessThan(0);
    const left = seatedTrayPoses({ x: 0, y: 1.2, z: 0 }, 0, settings({ leftHanded: true }));
    expect(left.controls.x).toBeLessThan(0);
  });
  it('honours the shared bench height offset', () => {
    const base = seatedTrayPoses({ x: 0, y: 1.2, z: 0 }, 0, settings());
    const raised = seatedTrayPoses({ x: 0, y: 1.2, z: 0 }, 0, settings({ benchHeightOffset: 0.08 }));
    expect(raised.controls.y - base.controls.y).toBeCloseTo(0.08, 9);
  });
  it('pulls the tray closer for a shorter reach, never nearer than the comfort floor', () => {
    expect(trayViewDistance(settings({ reachM: 0.75 }))).toBeGreaterThanOrEqual(trayViewDistance(settings()));
    expect(trayViewDistance(settings({ reachM: 0.45 }))).toBeLessThan(trayViewDistance(settings()));
    expect(trayViewDistance(settings({ reachM: 0.35 }))).toBe(SEATED.minViewM);
  });
});

import { describe, expect, it } from 'vitest';
import { clampToRadius, desktopFraming } from './desktop-camera';

describe('desktop camera framing', () => {
  it('frames the depot board and the Electrical mini-sub only', () => {
    expect(desktopFraming('board')?.fov).toBe(55);
    expect(desktopFraming('elec-loto')?.position).toEqual([-4.55, 1.52, -6.62]);
    expect(desktopFraming('water-burst')).toBeUndefined();
  });

  it('returns a copy so the camera cannot mutate the authored framing', () => {
    const first = desktopFraming('elec-loto')!;
    first.position[0] = 99;
    expect(desktopFraming('elec-loto')!.position[0]).toBe(-4.55);
  });

  it('keeps keyboard steps inside the work radius', () => {
    expect(clampToRadius([0.2, 0], [0, 0], 0.5)).toEqual([0.2, 0]);
    const [x, z] = clampToRadius([3, 4], [0, 0], 1);
    expect(Math.hypot(x, z)).toBeCloseTo(1);
    expect(clampToRadius([0, 0], [0, 0], 0)).toEqual([0, 0]);
  });
});

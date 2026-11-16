/** Desktop camera framings per level, in world metres. Pure so the framing is unit tested. */
export interface Framing {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
  /** Keyboard steps stay within this radius of the framed position. */
  radius: number;
  yawRange: number;
}

const FRAMINGS: Readonly<Record<string, Framing>> = {
  // The depot board behind the title: a calm establishing view.
  board: { position: [0.05, 1.5, 1.25], yaw: 0, pitch: -0.12, fov: 55, radius: 0.4, yawRange: 0.6 },
  // Electrical: standing in front of the mini-sub, switch row and bench tools in view.
  'elec-loto': { position: [-4.55, 1.52, -6.62], yaw: 0, pitch: -0.36, fov: 55, radius: 0.9, yawRange: 1.2 },
};

export function desktopFraming(module: string): Framing | undefined {
  const framing = FRAMINGS[module];
  return framing ? { ...framing, position: [...framing.position] as [number, number, number] } : undefined;
}

/** Clamp a horizontal point to a circle around a centre. */
export function clampToRadius(point: [number, number], centre: [number, number], radius: number): [number, number] {
  const dx = point[0] - centre[0], dz = point[1] - centre[1];
  const distance = Math.hypot(dx, dz);
  if (distance <= radius || distance === 0) return point;
  return [centre[0] + dx / distance * radius, centre[1] + dz / distance * radius];
}

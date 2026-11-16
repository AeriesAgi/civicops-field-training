/** Metre-scale staging plan. These are simulated crew instructions, never real dispatch. */
export const ROADS_STAGING = {
  van: { x: -10, z: 4.95, yaw: 0 },
  upstream: { x: 5.7, z: 4.65, yaw: -Math.PI / 2 },
  downstream: { x: 22, z: 4.65, yaw: Math.PI / 2 },
  casualtyBay: { x: 34, z: 4.95, yaw: Math.PI / 2 },
} as const;

export const ROADS_CREW_STANDBY = [
  { x: 6.7, z: 4.65, yaw: -Math.PI / 2 },
  { x: 23.2, z: 4.65, yaw: Math.PI / 2 },
] as const;
export const ROADS_CREW_WALK_SECONDS = 3;

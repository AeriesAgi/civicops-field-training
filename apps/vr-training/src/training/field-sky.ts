/** Shared outdoor sky for the 1:1 field modules. Depot interior does not use it. */
export const FIELD_SKY = {
  // Inside the camera far plane (120) so the dusk dome is not clipped to black.
  radius: 110,
  fogNear: 48,
  fogFar: 100,
  top: '#6e97c9',
  horizon: '#f3c49a',
  ground: '#6e624e',
  fog: '#adb9bb',
} as const;

export const FIELD_MODULES = ['elec-loto', 'water-burst', 'roads-zone', 'scene-safety'] as const;

/** Dusk-night gradient used only by the crash scene. Other lessons keep FIELD_SKY. */
export const FIRE_SKY = {
  top: '#1b2744',
  horizon: '#c46a3a',
  ground: '#241c16',
  fog: '#77868d',
} as const;

export function isFieldModule(moduleId: string | undefined): boolean {
  return moduleId === 'elec-loto' || moduleId === 'water-burst' || moduleId === 'roads-zone' || moduleId === 'scene-safety';
}

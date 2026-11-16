import type { TrainingModule, TrainingScenario } from '../contracts';

export const WORK_ORDER_CIRCUIT = 'sl-3';
export const elecLotoModule: TrainingModule = {
  id: 'elec-loto',
  version: 1,
  title: 'Electrical isolation and lockout/tagout',
  department: 'Electricity',
  serviceCodes: ['ELECTRICITY'],
  categories: ['Electricity'],
  hazardKeywords: ['live wire', 'outage', 'streetlight'],
  passMark: 80,
  certificationId: 'elec-loto',
  validityMonths: 12,
  steps: [
    { id: 'identify-circuit', label: 'Check the work order and identify SL-3', order: 1, critical: false, interaction: 'poke' },
    { id: 'notify-control', label: 'Notify control', order: 2, critical: false, interaction: 'poke' },
    { id: 'switch-off', label: 'Switch SL-3 OFF', order: 3, critical: true, interaction: 'poke' },
    { id: 'apply-lock', label: 'Apply your personal padlock', order: 4, critical: true, interaction: 'grab-place' },
    { id: 'apply-tag', label: 'Attach the danger tag', order: 5, critical: false, interaction: 'grab-place' },
    { id: 'try-start', label: 'Try to switch SL-3 back on', order: 6, critical: true, interaction: 'poke' },
    { id: 'prove-tester', label: 'Prove the tester on the proving unit', order: 7, critical: true, interaction: 'pinch-grab' },
    { id: 'test-dead', label: 'Test the SL-3 terminals for dead', order: 8, critical: true, interaction: 'pinch-grab' },
    { id: 're-prove-tester', label: 'Re-prove the tester', order: 9, critical: true, interaction: 'pinch-grab' },
    { id: 'safe-to-work', label: 'Confirm safe to work', order: 10, critical: false, interaction: 'poke' },
  ],
};

export type LotoVariation = 'mislabelled-breaker' | 'backfeed';

/** Seed 0 is the standard lesson; the low two bits select repeatable variations. */
export function createScenario(seed = 0, variations?: readonly string[]): TrainingScenario {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  const selected = variations ?? [
    ...(normalizedSeed & 1 ? ['mislabelled-breaker' as const] : []),
    ...(normalizedSeed & 2 ? ['backfeed' as const] : []),
  ];
  const flags = [...new Set(selected.filter((flag): flag is LotoVariation => flag === 'mislabelled-breaker' || flag === 'backfeed'))];
  return {
    id: `elec-loto-${normalizedSeed}-${flags.length ? flags.join('-') : 'standard'}`,
    moduleId: elecLotoModule.id,
    seed: normalizedSeed,
    title: 'Streetlight flickering by the synthetic depot',
    sourceReference: 'CIV-20261008-DEMO0001',
    variations: flags,
  };
}

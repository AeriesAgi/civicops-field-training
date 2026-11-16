import type { TrainingModule, TrainingScenario } from '../contracts';

export const WATER_VALVE_TURNS = 3;
export const WATER_MAX_TURNS_PER_SECOND = 0.75;

export const waterBurstModule: TrainingModule = {
  id: 'water-burst', version: 1, title: 'Water: burst main isolation',
  department: 'Water and Sanitation', serviceCodes: ['WATER'], categories: ['Water'],
  hazardKeywords: ['burst main', 'flooding', 'open excavation'],
  passMark: 80, certificationId: 'water-burst', validityMonths: 12,
  steps: [
    { id: 'make-area-safe', label: 'Place barriers, sign and set spoil back', order: 1, critical: true, interaction: 'grab-place' },
    { id: 'identify-valves', label: 'Plan the isolating valves on the schematic', order: 2, critical: false, interaction: 'poke' },
    { id: 'notify-control', label: 'Notify control and affected customers', order: 3, critical: false, interaction: 'poke' },
    { id: 'close-valves', label: 'Close A, then B slowly with the valve key', order: 4, critical: true, interaction: 'twist' },
    { id: 'confirm-isolation', label: 'Open washout; confirm low pressure and zero flow', order: 5, critical: true, interaction: 'poke' },
    { id: 'trench-safety', label: 'Check shoring, ladder, spoil, air and flooding', order: 6, critical: true, interaction: 'poke' },
    { id: 'ready-for-repair', label: 'Confirm ready for approved repair', order: 7, critical: false, interaction: 'poke' },
  ],
};

export const WATER_SAFETY_NOTICE = "Illustrative training based on generic municipal practice; follow your employer's SOPs. An authorised person decides each work and safety action.";

export const waterStepLines: Readonly<Record<string, { instruction: string; why: string }>> = {
  'make-area-safe': { instruction: 'Place the perimeter barriers and danger sign. Move spoil back.', why: 'Barriers prevent access to the burst and open trench. Set spoil at least one metre back to reduce edge loading.' },
  'identify-valves': { instruction: 'Read the network. Select A then B; keep the hospital branch C open.', why: 'A and B isolate only the damaged section. C supplies a critical customer and needs explicit authorisation before interruption.' },
  'notify-control': { instruction: 'Notify control and affected customers before isolation.', why: 'Control coordinates the outage and customer notice. This offline lesson records a simulated notification; nobody receives a message.' },
  'close-valves': { instruction: 'Lift each cover. Seat the T-bar key and close A, then B slowly.', why: 'A slow closure limits pressure surge. The order prevents continued flow through the affected section.' },
  'confirm-isolation': { instruction: 'Open the washout. Check zero flow and the low-pressure gauge.', why: 'Shutting valves can leave trapped pressure. Drain and verify before treating the main as isolated.' },
  'trench-safety': { instruction: 'Check shoring, ladder, spoil distance, atmosphere and flooding.', why: 'Isolation alone cannot make an excavation safe. A competent person must verify support, access and site conditions before entry.' },
  'ready-for-repair': { instruction: 'Confirm ready for approved repair. The authorised person decides.', why: 'This lesson demonstrates readiness checks; it never authorises trench entry or replaces an employer procedure.' },
};

export function createWaterScenario(seed = 0, variations?: readonly string[]): TrainingScenario {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  const selected = variations ?? (normalizedSeed & 1 ? ['seized-valve'] : []);
  const flags = [...new Set(selected.filter((flag) => flag === 'seized-valve'))];
  return {
    id: `water-burst-${normalizedSeed}-${flags.length ? flags.join('-') : 'standard'}`,
    moduleId: waterBurstModule.id, seed: normalizedSeed,
    title: 'Burst main at the synthetic depot road', sourceReference: 'CIV-20261008-DEMO0003', variations: flags,
  };
}

/** Reproducible UTC drill; a seized B requires the alternate A-D route, never hospital C. */
export function createWaterDailyDrill(now: Date = new Date()): { day: string; seed: 0 | 1; variation: 'standard' | 'seized-valve'; scenario: TrainingScenario } {
  const day = now.toISOString().slice(0, 10);
  let hash = 2_166_136_261;
  for (let index = 0; index < day.length; index += 1) hash = Math.imul(hash ^ day.charCodeAt(index), 16_777_619);
  const seed = (hash & 1) as 0 | 1;
  return { day, seed, variation: seed ? 'seized-valve' : 'standard', scenario: createWaterScenario(seed) };
}

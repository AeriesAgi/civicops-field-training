import type { TrainingModule, TrainingScenario } from '../contracts';

export const sceneSafetyModule: TrainingModule = {
  id: 'scene-safety', version: 1, title: 'Fire and EMS: crash scene safety and triage',
  department: 'Fire and EMS', serviceCodes: ['GENERAL'], categories: ['Fire', 'EMS'],
  hazardKeywords: ['crash', 'fire', 'traffic', 'downed line', 'fuel'],
  passMark: 80, certificationId: 'scene-safety', validityMonths: 12,
  steps: [
    { id: 'place-blocker', label: 'Angle the fire engine upstream of the crash', order: 1, critical: true, interaction: 'grab-place' },
    { id: 'warning-taper', label: 'Lay a cone taper and flares upstream', order: 2, critical: true, interaction: 'grab-place' },
    { id: 'size-up', label: 'Find fuel, cable, unstable vehicle and traffic', order: 3, critical: true, interaction: 'poke' },
    { id: 'cable-exclusion', label: 'Mark the downed line and treat it as live', order: 4, critical: true, interaction: 'grab-place' },
    { id: 'safe-approach', label: 'Approach on the shoulder, clear of spill and lanes', order: 5, critical: true, interaction: 'poke' },
    { id: 'triage', label: 'Tag every casualty within the time target', order: 6, critical: true, interaction: 'grab-place' },
    { id: 'handover', label: 'Hand the scene card to control', order: 7, critical: false, interaction: 'poke' },
  ],
};

export const SCENE_SAFETY_NOTICE = "Illustrative training based on generic municipal practice; follow your employer's SOPs. An authorised person decides every safety, medical and work action. This drill is not patient care and does not replace emergency services.";
export const SCENE_SCALE_NOTICE = 'Full-scale arterial crash scene. Distances are compressed training ranges; follow employer SOPs for live work.';
export const CABLE_LIVE_LINE = 'Treat the downed line as live until Electricity confirms it dead. That confirmation is the Module 1 isolation, logged as a CivicOps cross-agency incident.';

export type SceneStepId = 'place-blocker' | 'warning-taper' | 'size-up' | 'cable-exclusion' | 'safe-approach' | 'triage' | 'handover';
export type SceneVariation = 'deteriorating-casualty';

export const sceneStepLines: Readonly<Record<SceneStepId, { instruction: string; why: string }>> = {
  'place-blocker': {
    instruction: 'Pinch the fire engine. Park it upstream, angled across the closed lane.',
    why: 'An upstream angled blocker gives traffic a reason to move over before the wreck. Downstream or in a live lane, the engine becomes another target.',
  },
  'warning-taper': {
    instruction: 'Place six cones in a taper. Set flares at the upstream end.',
    why: 'A long taper and early flares tell drivers to leave the lane before they reach the engine. Real spacing comes from the employer SOP.',
  },
  'size-up': {
    instruction: 'Poke the fuel spill, downed cable, unstable car and open lane.',
    why: 'A size-up names the hazards before anyone walks in. The app only marks objects and situations. You decide the next action.',
  },
  'cable-exclusion': {
    instruction: 'Place the exclusion marker on the downed cable.',
    why: CABLE_LIVE_LINE,
  },
  'safe-approach': {
    instruction: 'Stand on the shoulder approach, then poke Mark approach.',
    why: 'The safe path stays upstream of the fuel and out of the open lane. Walking the spill or a live lane is how responders get hit.',
  },
  triage: {
    instruction: 'Read each vest card. Pinch the tag that matches shape, colour and words.',
    why: 'Tags use a shape and a word as well as a colour. A critical casualty marked minor hides the people who need care first. This is an illustrative START-style drill, not a clinical protocol.',
  },
  handover: {
    instruction: 'Poke Send handover. Control gets counts, hazards and units.',
    why: 'The card tells control what you found and which units you are asking for. A human still decides the response. No names and no recording leave this device.',
  },
};

export function createFireScenario(seed = 0, variations?: readonly string[]): TrainingScenario {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  const selected = variations ?? ((normalizedSeed & 1) === 1 ? ['deteriorating-casualty' as const] : []);
  const flags = [...new Set(selected.filter((flag): flag is SceneVariation => flag === 'deteriorating-casualty'))];
  return {
    id: `scene-safety-${normalizedSeed}-${flags.length ? flags.join('-') : 'standard'}`,
    moduleId: sceneSafetyModule.id, seed: normalizedSeed,
    title: flags.includes('deteriorating-casualty') ? 'Crash scene with a deteriorating casualty' : 'Two-car crash on the synthetic arterial',
    sourceReference: 'CIV-20261012-DEMO0007', variations: flags,
  };
}

/** Stable UTC daily variant: one vest deteriorates and must be triaged again. */
export function createFireDailyDrill(now: Date = new Date()): { day: string; seed: 0 | 1; variation: 'standard' | 'deteriorating-casualty'; scenario: TrainingScenario } {
  const day = now.toISOString().slice(0, 10);
  let hash = 2_166_136_261;
  for (let index = 0; index < day.length; index += 1) hash = Math.imul(hash ^ day.charCodeAt(index), 16_777_619);
  const seed = (hash & 1) as 0 | 1;
  const scenario = createFireScenario(seed);
  return { day, seed, variation: scenario.variations.includes('deteriorating-casualty') ? 'deteriorating-casualty' : 'standard', scenario };
}

import type { TrainingModule, TrainingScenario } from '../contracts';

export const roadsZoneModule: TrainingModule = {
  id: 'roads-zone', version: 2, title: 'Rain incident: protect a live road',
  department: 'Roads and Stormwater', serviceCodes: ['ROADS'], categories: ['Roads'],
  hazardKeywords: ['road works', 'traffic', 'pothole', 'open excavation'],
  passMark: 80, certificationId: 'roads-zone', validityMonths: 12,
  steps: [
    { id: 'park-vehicle', label: 'Park upstream; switch the amber beacon on', order: 1, critical: true, interaction: 'grab-place' },
    { id: 'advance-warning', label: 'Place advance warning for the approach speed', order: 2, critical: true, interaction: 'grab-place' },
    { id: 'cone-taper', label: 'Build a long, evenly spaced cone taper', order: 3, critical: true, interaction: 'grab-place' },
    { id: 'keep-left', label: 'Face the keep-left sign toward approaching traffic', order: 4, critical: false, interaction: 'twist' },
    { id: 'protect-work-area', label: 'Protect the excavation; keep the pedestrian route clear', order: 5, critical: true, interaction: 'grab-place' },
    { id: 'position-flaggers', label: 'Place both marshals with sight lines and a refuge', order: 6, critical: true, interaction: 'grab-place' },
    { id: 'test-traffic', label: 'Zone check, then run the traffic demonstration', order: 7, critical: false, interaction: 'poke' },
  ],
};

export const ROADS_SAFETY_NOTICE = "Illustrative training based on generic municipal practice; follow your employer's SOPs. An authorised person decides every work, traffic and safety action.";
export const ROADS_SCALE_NOTICE = 'Full-scale road scene. Distances show compressed training ranges; follow employer SOPs for live work.';
export type RoadsVariation = 'speed-80' | 'blind-bend' | 'rain-incident';
export type RoadsStepId = 'park-vehicle' | 'advance-warning' | 'cone-taper' | 'keep-left' | 'protect-work-area' | 'position-flaggers' | 'test-traffic';

export const roadsStepLines: Readonly<Record<RoadsStepId, { instruction: string; why: string }>> = {
  'park-vehicle': { instruction: 'Brief the parked driver, check the service bay, then turn the beacon on.', why: 'An upstream vehicle helps make the work zone visible. It must not occupy the excavation or obstruct the pedestrian route.' },
  'advance-warning': { instruction: 'Place the warning upstream in this scenario’s distance range. Face approaching traffic.', why: 'Drivers need time to notice the zone and slow down. A faster approach or hidden bend needs earlier warning; real spacing comes from the employer SOP.' },
  'cone-taper': { instruction: 'Pinch-place six cones into a gradual taper. Keep the gaps even.', why: 'A long, gradual taper gives drivers room to merge. Short or uneven tapers cause abrupt braking and cone strikes.' },
  'keep-left': { instruction: 'Put the keep-left board beside the taper start, facing the approach.', why: 'An instruction at the start of the merge makes the intended route clear before the excavation.' },
  'protect-work-area': { instruction: 'Grip a clear rail section away from joined corners. Enclose the excavation; keep the pedestrian route open.', why: 'Barriers separate workers and the open excavation from traffic. Pedestrians need an accessible continuous route, not a diversion into a live lane.' },
  'position-flaggers': { instruction: 'Brief both Stop/Go marshals after protection is complete. Keep STOP displayed as they walk to refuge.', why: 'Marshals need a safe refuge, a visible approach and a clear sight line to one another. A board never makes an exposed position safe.' },
  'test-traffic': { instruction: 'Poke Zone check. Repair every marker, then poke Run traffic.', why: 'The demonstration tests this layout and explains unsafe braking or contact. It advises only; a human decides any real traffic or work action.' },
};

export function createRoadsScenario(seed = 0, variations?: readonly string[]): TrainingScenario {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  const selected = variations ?? [
    ...(normalizedSeed & 1 ? ['speed-80' as const] : []),
    ...(normalizedSeed & 2 ? ['blind-bend' as const] : []),
  ];
  const flags = [...new Set(selected.filter((flag): flag is RoadsVariation => flag === 'speed-80' || flag === 'blind-bend' || flag === 'rain-incident'))];
  return {
    id: `roads-zone-${normalizedSeed}-${flags.length ? flags.join('-') : 'standard'}`,
    moduleId: roadsZoneModule.id, seed: normalizedSeed,
    title: flags.includes('blind-bend') ? 'Road repair beyond a hidden bend' : 'Road repair at the synthetic depot street',
    sourceReference: 'CIV-20261009-DEMO0004', variations: flags,
  };
}

/** Stable UTC daily variants include a blind bend, with earlier warning rather than an identity/risk model. */
export function createRoadsDailyDrill(now: Date = new Date()): { day: string; seed: 0 | 1 | 2 | 3; variation: 'standard' | 'blind-bend'; scenario: TrainingScenario } {
  const day = now.toISOString().slice(0, 10);
  let hash = 2_166_136_261;
  for (let index = 0; index < day.length; index += 1) hash = Math.imul(hash ^ day.charCodeAt(index), 16_777_619);
  const seed = (hash & 3) as 0 | 1 | 2 | 3;
  const scenario = createRoadsScenario(seed);
  return { day, seed, variation: scenario.variations.includes('blind-bend') ? 'blind-bend' : 'standard', scenario };
}

/** The rain dispatch assesses six incident decisions as well as traffic geometry. */
export const roadsRainModule:TrainingModule={
  ...roadsZoneModule,version:3,
  steps:[
    {id:'incident-refuge',label:'Confirm personal refuge and an escape route',order:1,critical:true,interaction:'poke'},
    {id:'incident-radio',label:'Radio control before unloading or entering the road',order:2,critical:true,interaction:'poke'},
    ...roadsZoneModule.steps.slice(0,6).map((step,index)=>({...step,order:index+3})),
    {id:'incident-tape',label:'Tie hazard tape between protected barriers',order:9,critical:true,interaction:'grab-place'},
    {id:'incident-assist',label:'Check the motorist and request EMS when indicated',order:10,critical:true,interaction:'poke'},
    {id:'incident-record',label:'Complete the incident job card',order:11,critical:false,interaction:'poke'},
    {id:'incident-schedule',label:'Keep protection and schedule authorised repair',order:12,critical:false,interaction:'poke'},
    {...roadsZoneModule.steps[6],order:13},
  ],
};
export function roadsAssessmentModule(scenario:TrainingScenario,module:TrainingModule=roadsZoneModule):TrainingModule {
  return module.id===roadsZoneModule.id&&scenario.variations.includes('rain-incident')
    ?{...module,version:Math.max(module.version,roadsRainModule.version),steps:roadsRainModule.steps}:module;
}

import snapshot from './work-orders.snapshot.json';

export type ModuleId = 'elec-loto' | 'water-burst' | 'roads-zone' | 'scene-safety';
export type ReadyModuleId = 'elec-loto' | 'water-burst' | 'roads-zone' | 'scene-safety';
export type BoardDepartment = 'Electricity' | 'Water' | 'Roads' | 'Fire & EMS';
export type KnownWorkOrderType = keyof typeof MODULE_WORK_ORDER_TYPES;

export const MODULE_WORK_ORDER_TYPES = {
  'ELEC.STREETLIGHT_FAULT': 'elec-loto',
  'ELEC.LIVE_WIRE_DOWN': 'elec-loto',
  'WATER.BURST_MAIN': 'water-burst',
  'ROADS.POTHOLE_REPAIR': 'roads-zone',
  'ROADS.BLOCKED_DRAIN': 'roads-zone',
  'ROADS.TRAFFIC_SIGNAL_FAULT': 'roads-zone',
  'TRAFFIC.CRASH_SCENE': 'scene-safety',
  'FIRE.VEHICLE_EXTRICATION': 'scene-safety',
  'EMS.MEDICAL_RESPONSE': 'scene-safety',
} as const satisfies Record<string, ModuleId>;

export interface HazardChip {
  icon: 'bolt' | 'water' | 'trench' | 'traffic' | 'fire' | 'medical';
  label: string;
}

export interface WorkOrderCard {
  code: string;
  title: string;
  department: BoardDepartment;
  moduleId?: ModuleId;
  syntheticReference: string;
  availability: 'ready' | 'coming-next' | 'no-simulation';
  pendingCatalogue: boolean;
  hazardClass: string;
  hazards: readonly HazardChip[];
  requiredCertifications: readonly string[];
  requiredSkills: readonly { code: string; minimumLevel: number }[];
  ppe: readonly string[];
  typicalSteps: readonly string[];
}

const pending = {
  'TRAFFIC.CRASH_SCENE': { title: 'Traffic crash scene safety', hazards: [{ icon: 'traffic', label: 'Lane exposure' }], certifications: ['Scene safety assessment'] },
  'FIRE.VEHICLE_EXTRICATION': { title: 'Vehicle extrication scene safety', hazards: [{ icon: 'fire', label: 'Fire and instability' }], certifications: ['Authorised responder assessment'] },
  'EMS.MEDICAL_RESPONSE': { title: 'Medical response scene safety', hazards: [{ icon: 'medical', label: 'Scene exposure' }], certifications: ['Authorised responder assessment'] },
} as const;

/** Training chips are authored interpretations, not claimed catalogue fields. */
const trainingHazards: Record<string, readonly HazardChip[]> = {
  'ELEC.STREETLIGHT_FAULT': [{ icon: 'bolt', label: 'Live conductors' }],
  'ELEC.LIVE_WIRE_DOWN': [{ icon: 'bolt', label: 'Live wire down' }],
  'WATER.BURST_MAIN': [{ icon: 'water', label: 'Flooding' }, { icon: 'trench', label: 'Open excavation' }],
  'ROADS.POTHOLE_REPAIR': [{ icon: 'traffic', label: 'Moving traffic' }],
  'ROADS.BLOCKED_DRAIN': [{ icon: 'water', label: 'Flooding' }, { icon: 'traffic', label: 'Lane exposure' }],
  'ROADS.TRAFFIC_SIGNAL_FAULT': [{ icon: 'traffic', label: 'Collision risk' }, { icon: 'bolt', label: 'Live conductors' }],
  'TRAFFIC.CRASH_SCENE': [{ icon: 'traffic', label: 'Lane exposure' }, { icon: 'fire', label: 'Fuel spill' }, { icon: 'bolt', label: 'Downed line' }],
  'FIRE.VEHICLE_EXTRICATION': [{ icon: 'fire', label: 'Fuel spill' }, { icon: 'traffic', label: 'Lane exposure' }, { icon: 'bolt', label: 'Downed line' }],
  'EMS.MEDICAL_RESPONSE': [{ icon: 'medical', label: 'Scene exposure' }, { icon: 'traffic', label: 'Lane exposure' }, { icon: 'fire', label: 'Fuel spill' }],
};

export const catalogueSnapshot = snapshot;

export function moduleForWorkOrderType(code: string): ModuleId | undefined {
  return Object.prototype.hasOwnProperty.call(MODULE_WORK_ORDER_TYPES, code)
    ? MODULE_WORK_ORDER_TYPES[code as KnownWorkOrderType] : undefined;
}

export function isReadyModule(moduleId: string): moduleId is ReadyModuleId {
  return moduleId === 'elec-loto' || moduleId === 'water-burst' || moduleId === 'roads-zone' || moduleId === 'scene-safety';
}

function department(moduleId: ModuleId | undefined): BoardDepartment {
  return moduleId === 'elec-loto' ? 'Electricity' : moduleId === 'water-burst' ? 'Water'
    : moduleId === 'roads-zone' ? 'Roads' : 'Fire & EMS';
}

export function workOrderCard(code: string): WorkOrderCard {
  const moduleId = moduleForWorkOrderType(code);
  const source = snapshot.workOrderTypes.find((row) => row.code === code);
  const pendingSource = Object.prototype.hasOwnProperty.call(pending, code) ? pending[code as keyof typeof pending] : undefined;
  const index = Object.keys(MODULE_WORK_ORDER_TYPES).indexOf(code);
  return {
    code, title: source?.title ?? pendingSource?.title ?? 'No simulation yet',
    department: department(moduleId), moduleId,
    syntheticReference: `CIV-20261008-DEMO${String(Math.max(0, index) + 1).padStart(4, '0')}`,
    availability: moduleId ? isReadyModule(moduleId) ? 'ready' : 'coming-next' : 'no-simulation',
    pendingCatalogue: Boolean(pendingSource), hazardClass: source?.hazardClass ?? 'pending assessment',
    hazards: Object.prototype.hasOwnProperty.call(trainingHazards, code) ? trainingHazards[code] : pendingSource?.hazards ?? [],
    requiredCertifications: source?.requiredCertifications ?? pendingSource?.certifications ?? [],
    requiredSkills: source?.requiredSkills ?? [], ppe: source?.ppe ?? [], typicalSteps: source?.procedureSteps ?? [],
  };
}

export const departmentCards: readonly WorkOrderCard[] = Object.keys(MODULE_WORK_ORDER_TYPES).map(workOrderCard);

export type TrainingEntry = { kind: 'board' }
  | { kind: 'module'; moduleId: ReadyModuleId; workOrderType?: string }
  | { kind: 'unavailable'; card: WorkOrderCard };

/** Dispatcher type takes priority; locked and unknown links stay visible and cannot boot a wrong module. */
export function resolveTrainingEntry(search: string): TrainingEntry {
  const params = new URLSearchParams(search);
  const workOrderType = params.get('workOrderType');
  if (workOrderType) {
    const card = workOrderCard(workOrderType);
    return card.moduleId && isReadyModule(card.moduleId)
      ? { kind: 'module', moduleId: card.moduleId, workOrderType } : { kind: 'unavailable', card };
  }
  const moduleId = params.get('module');
  if (!moduleId || moduleId === 'board') return { kind: 'board' };
  if (isReadyModule(moduleId)) return { kind: 'module', moduleId };
  const code = Object.keys(MODULE_WORK_ORDER_TYPES).find((key) => moduleForWorkOrderType(key) === moduleId);
  return { kind: 'unavailable', card: workOrderCard(code ?? moduleId) };
}

export function certificationTitle(code: string): string {
  return snapshot.certificationTypes.find((certification) => certification.code === code)?.name ?? code;
}

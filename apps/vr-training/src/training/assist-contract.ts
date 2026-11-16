/** On-site assist describes objects and situations. It never infers who anybody is. */
export const ASSIST_OBJECT_KINDS = ['hazard', 'vehicle', 'fire', 'smoke', 'water', 'cone', 'line', 'trench', 'utility-asset'] as const;
export type AssistObjectKind = typeof ASSIST_OBJECT_KINDS[number];
export const ASSIST_HAZARD_CODES = ['lane-exposure', 'open-excavation', 'flooding', 'fire', 'smoke', 'live-asset', 'unstable-vehicle', 'blocked-access'] as const;
export type AssistHazardCode = typeof ASSIST_HAZARD_CODES[number];
export type AssistOption = 'object-hazards' | 'utility-isolation' | 'scene-safety';

export interface AssistObjectAnnotation {
  kind: AssistObjectKind;
  hazard: AssistHazardCode;
  /** A temporary local object marker, never a vehicle plate or person identifier. */
  markerIndex: number;
  guidance: 'keep-clear' | 'check-procedure' | 'ask-authorised-person';
}

export interface AssistSessionPolicy {
  processing: 'on-device';
  recording: false;
  continuousTracking: false;
  decisionMaker: 'human';
  locationSharing: 'off' | 'on-shift';
  sharingConsented: boolean;
  sharingVisible: boolean;
}

export const DEFAULT_ASSIST_POLICY: Readonly<AssistSessionPolicy> = {
  processing: 'on-device', recording: false, continuousTracking: false, decisionMaker: 'human',
  locationSharing: 'off', sharingConsented: false, sharingVisible: false,
};

export const ASSIST_SAFETY_NOTICE = "Illustrative training and decision support; follow your employer's SOPs. A human decides every police, safety and work action. This does not replace an authorised person or emergency services.";

/** Structured outcomes only: no frames, audio, pictures, coordinates, people or free-form notes. */
export interface AssistStepLog {
  schema: 'civicops.assist.step.v1';
  option: AssistOption;
  step: 'assess-hazards' | 'check-isolation' | 'protect-scene' | 'request-human-review' | 'confirm-readiness';
  outcome: 'confirmed' | 'needs-review' | 'stopped';
  hazards: AssistHazardCode[];
  decision: 'human-confirmed' | 'human-review-required';
  atMs: number;
}

export const ASSIST_LOG_FIELDS = ['schema', 'option', 'step', 'outcome', 'hazards', 'decision', 'atMs'] as const;
const OPTIONS: readonly string[] = ['object-hazards', 'utility-isolation', 'scene-safety'];
const STEPS: readonly string[] = ['assess-hazards', 'check-isolation', 'protect-scene', 'request-human-review', 'confirm-readiness'];

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length && Object.keys(value).every((key) => fields.includes(key));
}

/** Reject extra data at the storage boundary instead of silently retaining surveillance/media fields. */
export function parseAssistStepLog(value: unknown): AssistStepLog | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const log = value as Record<string, unknown>;
  if (!exactFields(log, ASSIST_LOG_FIELDS)
    || log.schema !== 'civicops.assist.step.v1' || !OPTIONS.includes(log.option as string)
    || !STEPS.includes(log.step as string) || !['confirmed', 'needs-review', 'stopped'].includes(log.outcome as string)
    || !['human-confirmed', 'human-review-required'].includes(log.decision as string)
    || !Array.isArray(log.hazards) || log.hazards.length > 8
    || !log.hazards.every((hazard) => typeof hazard === 'string' && (ASSIST_HAZARD_CODES as readonly string[]).includes(hazard))
    || typeof log.atMs !== 'number' || !Number.isSafeInteger(log.atMs) || log.atMs < 0
    || log.outcome === 'confirmed' && log.decision !== 'human-confirmed') return undefined;
  return { schema: 'civicops.assist.step.v1', option: log.option as AssistOption, step: log.step as AssistStepLog['step'],
    outcome: log.outcome as AssistStepLog['outcome'], hazards: [...new Set(log.hazards)] as AssistHazardCode[],
    decision: log.decision as AssistStepLog['decision'], atMs: log.atMs };
}

export function validAssistPolicy(value: unknown): value is AssistSessionPolicy {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return exactFields(policy, ['processing', 'recording', 'continuousTracking', 'decisionMaker', 'locationSharing', 'sharingConsented', 'sharingVisible'])
    && policy.processing === 'on-device' && policy.recording === false && policy.continuousTracking === false
    && policy.decisionMaker === 'human' && typeof policy.sharingConsented === 'boolean' && typeof policy.sharingVisible === 'boolean'
    && (policy.locationSharing === 'off' || policy.locationSharing === 'on-shift' && policy.sharingConsented === true && policy.sharingVisible === true);
}

export function parseAssistObjectAnnotation(value: unknown): AssistObjectAnnotation | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  if (!exactFields(object, ['kind', 'hazard', 'markerIndex', 'guidance'])
    || !(ASSIST_OBJECT_KINDS as readonly string[]).includes(object.kind as string)
    || !(ASSIST_HAZARD_CODES as readonly string[]).includes(object.hazard as string)
    || typeof object.markerIndex !== 'number' || !Number.isSafeInteger(object.markerIndex) || object.markerIndex < 0
    || !['keep-clear', 'check-procedure', 'ask-authorised-person'].includes(object.guidance as string)) return undefined;
  return { kind: object.kind as AssistObjectKind, hazard: object.hazard as AssistHazardCode, markerIndex: object.markerIndex,
    guidance: object.guidance as AssistObjectAnnotation['guidance'] };
}

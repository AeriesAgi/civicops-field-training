/**
 * CivicOps Field Training — shared contracts (TypeScript).
 * Canonical JSON Schemas live in /contracts/training/*.schema.json at this repository root.
 * Field names are camelCase.
 */

/** Open311-style municipal service codes used by the training catalogue. */
export type ServiceCode = 'WATER' | 'ROADS' | 'ELECTRICITY' | 'WASTE' | 'GENERAL';

/** Municipal departments used by the training catalogue. */
export type Department =
  | 'Water and Sanitation'
  | 'Roads and Stormwater'
  | 'Electricity'
  | 'Waste Management'
  | 'Public Works'
  | 'Fire and EMS';

export interface TrainingStep {
  id: string;
  /** Short imperative label shown on the step board and spoken by the instructor. */
  label: string;
  /** 1-based position in the correct procedure order. */
  order: number;
  /** A critical step missed or done out of order fails the attempt (safety-critical). */
  critical: boolean;
  /** Hand interaction used to complete the step (for accessibility mapping + analytics). */
  interaction: 'poke' | 'pinch-grab' | 'grab-place' | 'twist' | 'push' | 'gaze-pinch' | 'two-hand';
}

export interface TrainingModule {
  id: string; // e.g. "elec-loto"
  version: number;
  title: string;
  department: Department;
  serviceCodes: ServiceCode[];
  /** Incident category values this module prepares crews for. */
  categories: string[];
  /** Hazard keywords that make this module required for dispatch. */
  hazardKeywords: string[];
  steps: TrainingStep[];
  /** 0-100 score needed to pass (and no critical errors). */
  passMark: number;
  /** Certification issued after enough passes. */
  certificationId: string;
  /** Months a certification stays valid before a refresher is due. */
  validityMonths: number;
}

/** A scenario variant, optionally derived from a (synthetic / anonymised) CivicOps work order. */
export interface TrainingScenario {
  id: string;
  moduleId: string;
  seed: number;
  title: string;
  /** Optional CivicOps reference (CIV-yyyyMMdd-XXXXXXXX) when a supervisor assigns it as a pre-dispatch refresher. */
  sourceReference?: string;
  /** Fault/variation flags, e.g. "backfeed-from-generator", "mislabelled-breaker". */
  variations: string[];
}

export type StepOutcome = 'correct' | 'out-of-order' | 'skipped' | 'unsafe';

export interface StepResult {
  stepId: string;
  outcome: StepOutcome;
  /** Milliseconds since attempt start. */
  atMs: number;
  hintsUsed: number;
  note?: string;
}

export interface AccessibilityProfile {
  oneHanded: boolean;
  gazePinch: boolean;
  highContrast: boolean;
  captions: boolean;
  seated: boolean;
  /** Bench height offset in metres applied to the workbench rig. */
  benchHeightOffset: number;
}

/** VR client -> CivicOps: POST /api/training/attempts (idempotent on attemptId). */
export interface TrainingAttempt {
  schema: 'civicops.training.attempt.v1';
  attemptId: string; // UUID generated on device; idempotency key
  moduleId: string;
  moduleVersion: number;
  scenarioId: string;
  /** Pseudonymous crew-member id issued by CivicOps pairing; "demo-trainee" in GitHub Pages demo mode. */
  traineeId: string;
  /** CivicOps crew id, e.g. "electricity-01". */
  crewId: string;
  startedAt: string; // ISO-8601 UTC
  completedAt: string;
  durationMs: number;
  steps: StepResult[];
  criticalErrors: string[];
  score: number; // 0-100
  passed: boolean;
  inputMode: 'hands' | 'gaze-hands';
  accessibility: AccessibilityProfile;
  device: { runtime: 'emulated' | 'native'; deviceName: string };
  instructor: { mode: 'off' | 'scripted' | 'elevenlabs-agent' | 'llama'; hintsRequested: number };
}

export type CertificationLevel = 'none' | 'bronze' | 'silver' | 'gold';

/** CivicOps -> VR / control room: GET /api/training/trainees/{traineeId}/certifications */
export interface Certification {
  certificationId: string;
  moduleId: string;
  traineeId: string;
  crewId: string;
  level: CertificationLevel;
  passes: number;
  bestScore: number;
  streakDays: number;
  issuedAt?: string;
  expiresAt?: string;
  evidenceAttemptIds: string[];
}

/** CivicOps control room: GET /api/training/eligibility?incidentId=... */
export interface DispatchEligibility {
  incidentId: string;
  crewId: string;
  departmentMatch: boolean;
  requiredCertifications: string[];
  missingCertifications: string[];
  /** "advisory" until a municipality enables enforcement (CIVICOPS_TRAINING_ENFORCE=true). */
  mode: 'advisory' | 'enforced';
  eligible: boolean;
}

/** Dispatcher -> crew member: POST /api/training/assignments */
export interface TrainingAssignment {
  assignmentId: string;
  traineeId: string;
  crewId: string;
  moduleId: string;
  scenarioId?: string;
  sourceReference?: string;
  dueAt?: string;
  assignedBy: string;
}

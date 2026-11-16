import type { Certification, CertificationLevel, TrainingAttempt, TrainingModule } from './contracts.js';
import { elecLotoModule } from './modules/elec-loto.js';
import { defaultCrewForModule, trainingModuleById } from './modules/module-registry';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROGRESS_STORAGE_KEY = 'civicops.training.progress.v1';
const DAY_MS = 86_400_000;

function browserStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isAttempt(value: unknown): value is TrainingAttempt {
  if (typeof value !== 'object' || value === null) return false;
  const attempt = value as Partial<TrainingAttempt>;
  const accessibility = attempt.accessibility;
  const device = attempt.device;
  const instructor = attempt.instructor;
  return attempt.schema === 'civicops.training.attempt.v1'
    && typeof attempt.attemptId === 'string'
    && typeof attempt.moduleId === 'string'
    && typeof attempt.moduleVersion === 'number' && Number.isInteger(attempt.moduleVersion) && attempt.moduleVersion >= 1
    && typeof attempt.scenarioId === 'string'
    && typeof attempt.traineeId === 'string'
    && typeof attempt.crewId === 'string'
    && typeof attempt.startedAt === 'string' && Number.isFinite(Date.parse(attempt.startedAt))
    && typeof attempt.completedAt === 'string'
    && Number.isFinite(Date.parse(attempt.completedAt))
    && typeof attempt.durationMs === 'number' && Number.isInteger(attempt.durationMs) && attempt.durationMs >= 0
    && typeof attempt.score === 'number'
    && Number.isInteger(attempt.score) && attempt.score >= 0 && attempt.score <= 100
    && typeof attempt.passed === 'boolean'
    && (attempt.inputMode === 'hands' || attempt.inputMode === 'gaze-hands')
    && Array.isArray(attempt.steps)
    && attempt.steps.every((step) => step !== null && typeof step === 'object'
      && typeof step.stepId === 'string'
      && ['correct', 'out-of-order', 'skipped', 'unsafe'].includes(step.outcome)
      && Number.isInteger(step.atMs) && step.atMs >= 0
      && Number.isInteger(step.hintsUsed) && step.hintsUsed >= 0)
    && Array.isArray(attempt.criticalErrors)
    && attempt.criticalErrors.every((error) => typeof error === 'string')
    && typeof accessibility === 'object' && accessibility !== null
    && typeof accessibility.oneHanded === 'boolean' && typeof accessibility.gazePinch === 'boolean'
    && typeof accessibility.highContrast === 'boolean' && typeof accessibility.captions === 'boolean'
    && typeof accessibility.seated === 'boolean' && Number.isFinite(accessibility.benchHeightOffset)
    && accessibility.benchHeightOffset >= -0.4 && accessibility.benchHeightOffset <= 0.4
    && typeof device === 'object' && device !== null
    && (device.runtime === 'emulated' || device.runtime === 'native') && typeof device.deviceName === 'string'
    && typeof instructor === 'object' && instructor !== null
    && ['off', 'scripted', 'elevenlabs-agent'].includes(instructor.mode)
    && Number.isInteger(instructor.hintsRequested) && instructor.hintsRequested >= 0;
}

function cloneAttempt(attempt: TrainingAttempt): TrainingAttempt {
  return JSON.parse(JSON.stringify(attempt)) as TrainingAttempt;
}

function utcDay(iso: string): number {
  return Math.floor(Date.parse(iso) / DAY_MS);
}

/** Calendar months, clamping a month-end issue date to the last destination day. */
export function addValidityMonths(issuedAt: string, months: number): string {
  const expires = new Date(issuedAt);
  const day = expires.getUTCDate();
  expires.setUTCDate(1);
  expires.setUTCMonth(expires.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(expires.getUTCFullYear(), expires.getUTCMonth() + 1, 0)).getUTCDate();
  expires.setUTCDate(Math.min(day, lastDay));
  return expires.toISOString();
}

/** Local demo evidence. Storage failures leave the current session usable in memory. */
export class TrainingProgress {
  private readonly storage: StorageLike | undefined;
  private readonly attempts: TrainingAttempt[] = [];

  constructor(storage: StorageLike | undefined = browserStorage()) {
    this.storage = storage;
    try {
      const saved = storage?.getItem(PROGRESS_STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return;
      const seen = new Set<string>();
      for (const entry of parsed) {
        if (isAttempt(entry) && !seen.has(entry.attemptId)) {
          this.attempts.push(cloneAttempt(entry));
          seen.add(entry.attemptId);
        }
      }
    } catch {
      // Private browsing, quota restrictions, and corrupt saves use session memory.
    }
  }

  getAttempts(): TrainingAttempt[] {
    return this.attempts.map(cloneAttempt);
  }

  record(attempt: TrainingAttempt, module: TrainingModule = trainingModuleById(attempt.moduleId) ?? elecLotoModule): Certification {
    if (!this.attempts.some((saved) => saved.attemptId === attempt.attemptId)) {
      this.attempts.push(cloneAttempt(attempt));
      try {
        this.storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.attempts));
      } catch {
        // Keep evidence for export even when persistent storage is unavailable.
      }
    }
    return this.certification(module, attempt.traineeId, attempt.crewId);
  }

  certification(
    module: TrainingModule,
    traineeId = 'demo-trainee',
    crewId = defaultCrewForModule(module),
    now: Date = new Date(),
  ): Certification {
    const matching = this.attempts.filter((attempt) => attempt.moduleId === module.id
      && attempt.traineeId === traineeId && attempt.crewId === crewId);
    const passing = matching.filter((attempt) => attempt.passed
      && attempt.score >= Math.max(80, module.passMark)
      && attempt.criticalErrors.length === 0)
      .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));

    let level: CertificationLevel = 'none';
    let issuedAt: string | undefined;
    let highScorePasses = 0;
    const goldDays = new Set<number>();
    for (let index = 0; index < passing.length; index += 1) {
      const attempt = passing[index];
      if (index === 0) {
        level = 'bronze';
        issuedAt = attempt.completedAt;
      }
      if (index === 2) {
        level = 'silver';
        issuedAt = attempt.completedAt;
      }
      if (attempt.score >= 90) {
        highScorePasses += 1;
        goldDays.add(utcDay(attempt.completedAt));
      }
      if (level !== 'gold' && highScorePasses >= 5 && goldDays.size >= 3) {
        level = 'gold';
        issuedAt = attempt.completedAt;
      }
    }

    const passedDays = new Set(passing.map((attempt) => utcDay(attempt.completedAt)));
    let day = Math.floor(now.getTime() / DAY_MS);
    if (!passedDays.has(day)) day -= 1;
    let streakDays = 0;
    while (passedDays.has(day)) {
      streakDays += 1;
      day -= 1;
    }

    return {
      certificationId: module.certificationId,
      moduleId: module.id,
      traineeId,
      crewId,
      level,
      passes: passing.length,
      bestScore: matching.reduce((score, attempt) => Math.max(score, attempt.score), 0),
      streakDays,
      ...(issuedAt ? { issuedAt, expiresAt: addValidityMonths(issuedAt, module.validityMonths) } : {}),
      evidenceAttemptIds: passing.map((attempt) => attempt.attemptId),
    };
  }
}

import type { TrainingAttempt, TrainingModule, TrainingScenario } from './contracts.js';
import { createScenario, elecLotoModule } from './modules/elec-loto.js';
import { createWaterDailyDrill, waterBurstModule } from './modules/water-burst';
import { createRoadsDailyDrill, roadsZoneModule } from './modules/roads-zone';
import { createFireDailyDrill, sceneSafetyModule } from './modules/scene-safety';
import { trainingModuleById } from './modules/module-registry';
import type { DemoGesture } from './onboarding.js';
import type { StorageLike } from './progress.js';

export const FIRST_MINUTES_STORAGE_KEY = 'civicops.training.first-minutes.v1';
const DAY_MS = 86_400_000;
const REFRESHER_DAYS = 7;

export interface DailyDrill {
  day: string;
  /** Only the physically supported standard/mislabelled variants; never backfeed. */
  seed: 0 | 1;
  variation: 'standard' | 'mislabelled-breaker';
}

export interface DailyDrillStatus extends DailyDrill {
  status: 'ready' | 'completed';
}

export interface ModuleDailyDrillStatus {
  day: string;
  seed: number;
  variation: 'standard' | 'mislabelled-breaker' | 'seized-valve' | 'blind-bend' | 'deteriorating-casualty';
  scenario: TrainingScenario;
  status: 'ready' | 'completed';
}

export interface ComeBackSummary {
  streakDays: number;
  nextRefresherAt?: string;
}

interface FirstMinutesSave {
  schema: 'civicops.training.first-minutes.v1';
  onboardingCompletedAt?: string;
  firstLockAt?: string;
  dailyCompletedDays: string[];
  /** Optional so existing v1 saves keep their first-lock and daily evidence. */
  seenGestures?: DemoGesture[];
  /** Scoped department drills; existing v1 electrical markers stay in dailyCompletedDays. */
  moduleDailyCompletedDays?: Record<string, string[]>;
}

function isDemoGesture(value: unknown): value is DemoGesture {
  return value === 'poke' || value === 'pinch-grab' || value === 'place' || value === 'hold-to-confirm';
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && isDay(value.slice(0, 10))
    && Number.isFinite(Date.parse(value));
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** FNV-1a of the UTC date gives a reproducible daily choice on every device. */
export function dailyDrill(now: Date = new Date()): DailyDrill {
  const day = utcDate(now);
  let hash = 2_166_136_261;
  for (let index = 0; index < day.length; index += 1) {
    hash = Math.imul(hash ^ day.charCodeAt(index), 16_777_619);
  }
  const seed = (hash & 1) as 0 | 1;
  return { day, seed, variation: seed === 0 ? 'standard' : 'mislabelled-breaker' };
}

function validPass(attempt: TrainingAttempt, passMark: number): boolean {
  return attempt.passed === true && Number.isInteger(attempt.score)
    && attempt.score >= Math.max(80, passMark) && attempt.score <= 100
    && Array.isArray(attempt.criticalErrors) && attempt.criticalErrors.length === 0
    && isIso(attempt.completedAt);
}

/** Passing evidence is kept by TrainingProgress; derive dates without another evidence store. */
export function comeBackSummary(
  attempts: readonly TrainingAttempt[],
  now: Date = new Date(),
  scope: { moduleId?: string; traineeId?: string; crewId?: string; passMark?: number } = {},
): ComeBackSummary {
  const day = Math.floor(now.getTime() / DAY_MS);
  if (!Number.isFinite(day)) return { streakDays: 0 };
  const passedDays = new Set<number>();
  let latest = -Infinity;
  for (const attempt of attempts) {
    if (attempt.moduleId !== (scope.moduleId ?? elecLotoModule.id)
      || (scope.traineeId !== undefined && attempt.traineeId !== scope.traineeId)
      || (scope.crewId !== undefined && attempt.crewId !== scope.crewId)
      || !validPass(attempt, scope.passMark ?? elecLotoModule.passMark)) continue;
    const completed = Date.parse(attempt.completedAt);
    if (completed > now.getTime()) continue;
    latest = Math.max(latest, completed);
    passedDays.add(Math.floor(completed / DAY_MS));
  }
  let cursor = passedDays.has(day) ? day : day - 1;
  let streakDays = 0;
  while (passedDays.has(cursor)) {
    streakDays += 1;
    cursor -= 1;
  }
  return {
    streakDays,
    ...(Number.isFinite(latest) ? { nextRefresherAt: new Date(latest + REFRESHER_DAYS * DAY_MS).toISOString() } : {}),
  };
}

/** Local first-five-minutes/daily markers. Failed storage leaves the active session usable. */
export class DailyDrillProgress {
  private readonly storage: StorageLike | undefined;
  private readonly saved: FirstMinutesSave = {
    schema: 'civicops.training.first-minutes.v1', dailyCompletedDays: [],
  };

  constructor(storage: StorageLike | undefined = browserStorage()) {
    this.storage = storage;
    try {
      const raw = storage?.getItem(FIRST_MINUTES_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : undefined;
      if (typeof parsed !== 'object' || parsed === null) return;
      const source = parsed as Partial<FirstMinutesSave>;
      if (source.schema !== this.saved.schema) return;
      if (isIso(source.onboardingCompletedAt)) this.saved.onboardingCompletedAt = source.onboardingCompletedAt;
      if (isIso(source.firstLockAt)) this.saved.firstLockAt = source.firstLockAt;
      if (Array.isArray(source.dailyCompletedDays)) {
        this.saved.dailyCompletedDays = [...new Set(source.dailyCompletedDays.filter(isDay))].sort().slice(-366);
      }
      if (Array.isArray(source.seenGestures)) {
        this.saved.seenGestures = [...new Set(source.seenGestures.filter(isDemoGesture))];
      }
      if (source.moduleDailyCompletedDays !== null && typeof source.moduleDailyCompletedDays === 'object') {
        const days: Record<string, string[]> = {};
        for (const moduleId of [waterBurstModule.id, roadsZoneModule.id, sceneSafetyModule.id]) {
          const stored = source.moduleDailyCompletedDays?.[moduleId];
          if (Array.isArray(stored)) days[moduleId] = [...new Set(stored.filter(isDay))].sort().slice(-366);
        }
        this.saved.moduleDailyCompletedDays = days;
      }
    } catch {
      // Private browsing and malformed saves fall back to session memory.
    }
  }

  isReturning(): boolean {
    return this.saved.onboardingCompletedAt !== undefined;
  }

  get firstLockAt(): string | undefined {
    return this.saved.firstLockAt;
  }

  /** Copy once during initialization; gesture tracking itself remains allocation-free. */
  getSeenGestures(): DemoGesture[] {
    return this.saved.seenGestures?.slice() ?? [];
  }

  /** Persist on a demo-start or successful gesture edge, including success before a demo. */
  recordGestureSeen(gesture: DemoGesture): void {
    if (!isDemoGesture(gesture) || this.saved.seenGestures?.includes(gesture)) return;
    const gestures = this.saved.seenGestures ?? (this.saved.seenGestures = []);
    gestures.push(gesture);
    this.persist();
  }

  /** Mark only after the first meaningful successful action, never on XR entry/tracking. */
  recordOnboardingComplete(now: Date = new Date()): void {
    if (this.saved.onboardingCompletedAt !== undefined || !Number.isFinite(now.getTime())) return;
    this.saved.onboardingCompletedAt = now.toISOString();
    this.persist();
  }

  recordFirstLock(now: Date = new Date()): void {
    if (this.saved.firstLockAt !== undefined || !Number.isFinite(now.getTime())) return;
    this.saved.firstLockAt = now.toISOString();
    this.persist();
  }

  dailyStatus(now: Date = new Date()): DailyDrillStatus {
    const drill = dailyDrill(now);
    return { ...drill, status: this.saved.dailyCompletedDays.includes(drill.day) ? 'completed' : 'ready' };
  }

  moduleDailyStatus(module: TrainingModule, now: Date = new Date()): ModuleDailyDrillStatus {
    if (module.id === elecLotoModule.id) {
      const drill = this.dailyStatus(now);
      return { ...drill, scenario: createScenario(drill.seed) };
    }
    if (module.id === roadsZoneModule.id) {
      const drill = createRoadsDailyDrill(now);
      return { ...drill, status: this.saved.moduleDailyCompletedDays?.[module.id]?.includes(drill.day) ? 'completed' : 'ready' };
    }
    if (module.id === sceneSafetyModule.id) {
      const drill = createFireDailyDrill(now);
      return { ...drill, status: this.saved.moduleDailyCompletedDays?.[module.id]?.includes(drill.day) ? 'completed' : 'ready' };
    }
    if (module.id !== waterBurstModule.id) throw new Error('Daily drill requires a registered training module.');
    const drill = createWaterDailyDrill(now);
    return { ...drill, status: this.saved.moduleDailyCompletedDays?.[module.id]?.includes(drill.day) ? 'completed' : 'ready' };
  }

  /** A midnight-crossing attempt completes the daily scenario selected on its start day. */
  recordDailyPass(attempt: TrainingAttempt): boolean {
    const module = trainingModuleById(attempt.moduleId);
    if (!module || !validPass(attempt, module.passMark)
      || !isIso(attempt.startedAt) || Date.parse(attempt.completedAt) < Date.parse(attempt.startedAt)) return false;
    const drill = this.moduleDailyStatus(module, new Date(attempt.startedAt));
    if (attempt.scenarioId !== drill.scenario.id || drill.status === 'completed') return false;
    const byModule = this.saved.moduleDailyCompletedDays ?? (this.saved.moduleDailyCompletedDays = {});
    const days = module.id === elecLotoModule.id ? this.saved.dailyCompletedDays : byModule[module.id] ?? (byModule[module.id] = []);
    days.push(drill.day);
    days.sort();
    if (days.length > 366) days.shift();
    this.persist();
    return true;
  }

  private persist(): void {
    try {
      this.storage?.setItem(FIRST_MINUTES_STORAGE_KEY, JSON.stringify(this.saved));
    } catch {
      // Preserve state in memory when quota or browser settings block a write.
    }
  }
}

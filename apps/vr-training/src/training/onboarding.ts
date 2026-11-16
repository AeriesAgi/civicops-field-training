/** First-five-minutes logic. This module does not depend on XR, rendering or storage. */
export type OnboardingPhase =
  | 'raise-hands' | 'first-target' | 'micro-offer'
  | 'micro-off' | 'micro-lock' | 'micro-tag' | 'first-lock-stamp'
  | 'training' | 'returning-choice';

export type FirstLockAction = 'switch-off' | 'apply-lock' | 'apply-tag';
export type ReturningChoice = 'continue' | 'daily';
export type DemoGesture = 'poke' | 'pinch-grab' | 'place' | 'hold-to-confirm';

export const FIRST_LOCK_LIMIT_MS = 90_000;
export const GHOST_DEMO_DURATION_MS = 8_000;

function finiteTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Mutable session state avoids allocations when hand tracking and deadlines update. */
export class OnboardingSession {
  phase: OnboardingPhase = 'raise-hands';
  enteredAtMs = 0;
  firstActionMs: number | undefined;
  microStartedAtMs: number | undefined;
  firstLockEarned = false;
  returningChoice: ReturningChoice | undefined;
  private entered = false;
  private readonly returning: boolean;

  constructor(options: { returning?: boolean } = {}) {
    this.returning = options.returning ?? false;
  }

  /** Call at immersive entry. Repeated notifications preserve the measured start. */
  enterXR(nowMs: number): void {
    if (this.entered) return;
    this.entered = true;
    this.enteredAtMs = finiteTime(nowMs);
    this.phase = this.returning ? 'returning-choice' : 'raise-hands';
  }

  /** Either hand unlocks the first target; tracking loss never erases progress. */
  handsTracked(left: boolean, right: boolean): boolean {
    if (!this.entered || this.phase !== 'raise-hands' || !(left || right)) return false;
    this.phase = 'first-target';
    return true;
  }

  /** Recover the first prompt when both hands disappear before the first action. */
  trackingLost(): boolean {
    if (this.phase !== 'first-target' || this.firstActionMs !== undefined) return false;
    this.phase = 'raise-hands';
    return true;
  }

  /** Supply success from the actual identification interaction, not from tracking. */
  firstTargetSucceeded(nowMs: number): boolean {
    if (!this.entered || this.phase !== 'first-target') return false;
    this.firstActionMs = Math.max(0, finiteTime(nowMs) - this.enteredAtMs);
    this.phase = 'micro-offer';
    return true;
  }

  startMicroDrill(nowMs: number): boolean {
    if (this.phase !== 'micro-offer') return false;
    this.microStartedAtMs = finiteTime(nowMs);
    this.phase = 'micro-off';
    return true;
  }

  skipMicroDrill(): boolean {
    if (this.phase !== 'micro-offer' && !this.microActive) return false;
    this.phase = 'training';
    return true;
  }

  get microActive(): boolean {
    return this.phase === 'micro-off' || this.phase === 'micro-lock' || this.phase === 'micro-tag';
  }

  microRemainingMs(nowMs: number): number {
    if (!this.microActive || this.microStartedAtMs === undefined) return 0;
    return Math.max(0, FIRST_LOCK_LIMIT_MS - Math.max(0, finiteTime(nowMs) - this.microStartedAtMs));
  }

  /** Only the ordered off → lock → tag sequence awards a stamp. */
  performMicro(action: FirstLockAction, nowMs: number): boolean {
    this.tick(nowMs);
    if (this.phase === 'micro-off' && action === 'switch-off') this.phase = 'micro-lock';
    else if (this.phase === 'micro-lock' && action === 'apply-lock') this.phase = 'micro-tag';
    else if (this.phase === 'micro-tag' && action === 'apply-tag') {
      this.firstLockEarned = true;
      this.phase = 'first-lock-stamp';
    } else return false;
    return true;
  }

  /** Expiry continues the lesson without treating the optional practice as failure. */
  tick(nowMs: number): boolean {
    if (!this.microActive || this.microRemainingMs(nowMs) > 0) return false;
    this.phase = 'training';
    return true;
  }

  continueTraining(): boolean {
    if (this.phase !== 'first-lock-stamp') return false;
    this.phase = 'training';
    return true;
  }

  chooseReturning(choice: ReturningChoice): boolean {
    if (this.phase !== 'returning-choice') return false;
    this.returningChoice = choice;
    this.phase = 'training';
    return true;
  }
}

const gestureBit: Record<DemoGesture, number> = {
  poke: 1, 'pinch-grab': 2, place: 4, 'hold-to-confirm': 8,
};

/** One demonstration per newly needed gesture; successful input cancels it immediately. */
export class GhostDemoTracker {
  activeGesture: DemoGesture | undefined;
  startedAtMs = 0;
  private seenMask = 0;
  private activeDurationMs = GHOST_DEMO_DURATION_MS;

  constructor(seen: readonly DemoGesture[] = []) {
    for (const gesture of seen) this.seenMask |= gestureBit[gesture];
  }

  hasSeen(gesture: DemoGesture): boolean {
    return (this.seenMask & gestureBit[gesture]) !== 0;
  }

  start(gesture: DemoGesture, nowMs: number): boolean {
    if (this.hasSeen(gesture)) return false;
    this.seenMask |= gestureBit[gesture];
    this.activeGesture = gesture;
    this.startedAtMs = finiteTime(nowMs);
    this.activeDurationMs = GHOST_DEMO_DURATION_MS;
    return true;
  }

  succeed(gesture: DemoGesture): boolean {
    this.seenMask |= gestureBit[gesture];
    if (this.activeGesture !== gesture) return false;
    this.activeGesture = undefined;
    return true;
  }

  /** Reset or leave a lesson without replaying already introduced gestures. */
  cancel(): void {
    this.activeGesture = undefined;
  }

  /** Explicit instructor repeat_demo remains possible after the automatic first demo. */
  repeat(gesture: DemoGesture, nowMs: number, durationMs = GHOST_DEMO_DURATION_MS): void {
    this.seenMask |= gestureBit[gesture];
    this.activeGesture = gesture;
    this.startedAtMs = finiteTime(nowMs);
    this.activeDurationMs = Number.isFinite(durationMs) && durationMs > 0
      ? Math.min(30_000, durationMs) : GHOST_DEMO_DURATION_MS;
  }

  elapsedMs(nowMs: number): number {
    return Math.max(0, finiteTime(nowMs) - this.startedAtMs);
  }

  tick(nowMs: number): boolean {
    if (!this.activeGesture || this.elapsedMs(nowMs) < this.activeDurationMs) return false;
    this.activeGesture = undefined;
    return true;
  }
}

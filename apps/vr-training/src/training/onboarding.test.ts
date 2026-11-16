import { describe, expect, it } from 'vitest';
import {
  FIRST_LOCK_LIMIT_MS, GHOST_DEMO_DURATION_MS, GhostDemoTracker, OnboardingSession,
  type DemoGesture,
} from './onboarding.js';

function firstTarget(): OnboardingSession {
  const session = new OnboardingSession();
  session.enterXR(1_000);
  session.handsTracked(true, true);
  return session;
}

function microDrill(): OnboardingSession {
  const session = firstTarget();
  session.firstTargetSucceeded(4_000);
  session.startMicroDrill(6_000);
  return session;
}

describe('first-five-minutes onboarding', () => {
  it('requires immersive entry and a tracked hand before showing the first target', () => {
    const session = new OnboardingSession();
    expect(session.handsTracked(true, true)).toBe(false);
    expect(session.firstTargetSucceeded(1_000)).toBe(false);
    session.enterXR(1_000);
    expect(session.phase).toBe('raise-hands');
    expect(session.handsTracked(false, false)).toBe(false);
    expect(session.firstTargetSucceeded(2_000)).toBe(false);
    expect(session.firstActionMs).toBeUndefined();
  });

  it.each([[true, false], [false, true], [true, true]])('either tracked hand starts the target (%s/%s)', (left, right) => {
    const session = new OnboardingSession();
    session.enterXR(1_000);
    expect(session.handsTracked(left, right)).toBe(true);
    expect(session.phase).toBe('first-target');
    expect(session.handsTracked(false, false)).toBe(false);
    expect(session.phase).toBe('first-target');
  });

  it('measures first successful identification from the first XR entry notification', () => {
    const session = firstTarget();
    session.enterXR(8_000);
    expect(session.firstTargetSucceeded(9_000)).toBe(true);
    expect(session.firstActionMs).toBe(8_000);
    expect(session.firstActionMs).toBeLessThan(20_000);
    expect(session.phase).toBe('micro-offer');
    expect(session.firstTargetSucceeded(20_000)).toBe(false);
    expect(session.firstActionMs).toBe(8_000);
  });

  it('returns to Raise your hands after tracking loss without restarting the first-action clock', () => {
    const session = firstTarget();
    expect(session.trackingLost()).toBe(true);
    expect(session.phase).toBe('raise-hands');
    expect(session.trackingLost()).toBe(false);
    expect(session.handsTracked(false, false)).toBe(false);
    expect(session.firstTargetSucceeded(9_000)).toBe(false);
    session.enterXR(10_000);
    expect(session.handsTracked(false, true)).toBe(true);
    expect(session.firstTargetSucceeded(15_000)).toBe(true);
    expect(session.firstActionMs).toBe(14_000);
    expect(session.enteredAtMs).toBe(1_000);
  });

  it('preserves optional-practice and completed progress when hand tracking is lost', () => {
    const session = firstTarget();
    session.firstTargetSucceeded(4_000);
    expect(session.trackingLost()).toBe(false);
    expect(session.phase).toBe('micro-offer');
    session.startMicroDrill(6_000);
    expect(session.trackingLost()).toBe(false);
    expect(session.phase).toBe('micro-off');
    session.performMicro('switch-off', 7_000);
    expect(session.trackingLost()).toBe(false);
    expect(session.phase).toBe('micro-lock');
    session.performMicro('apply-lock', 8_000);
    expect(session.trackingLost()).toBe(false);
    expect(session.phase).toBe('micro-tag');
    session.performMicro('apply-tag', 9_000);
    expect(session.trackingLost()).toBe(false);
    expect(session.phase).toBe('first-lock-stamp');
    session.continueTraining();
    expect(session.trackingLost()).toBe(false);
    expect(session.phase).toBe('training');
    expect(session.firstLockEarned).toBe(true);
    expect(session.firstActionMs).toBe(3_000);
  });

  it('keeps a returning visitor on their choice during tracking loss', () => {
    const session = new OnboardingSession({ returning: true });
    session.enterXR(1_000);
    expect(session.trackingLost()).toBe(false);
    expect(session.phase).toBe('returning-choice');
    expect(session.chooseReturning('daily')).toBe(true);
    expect(session.returningChoice).toBe('daily');
  });

  it('keeps the micro drill optional and starts its timer only when selected', () => {
    const session = firstTarget();
    session.firstTargetSucceeded(4_000);
    expect(session.tick(120_000)).toBe(false);
    expect(session.phase).toBe('micro-offer');
    expect(session.microStartedAtMs).toBeUndefined();
    expect(session.startMicroDrill(120_000)).toBe(true);
    expect(session.microRemainingMs(125_000)).toBe(85_000);
    expect(session.startMicroDrill(130_000)).toBe(false);
    expect(session.microStartedAtMs).toBe(120_000);
  });

  it('can skip the offer without awarding a stamp', () => {
    const session = firstTarget();
    session.firstTargetSucceeded(4_000);
    expect(session.skipMicroDrill()).toBe(true);
    expect(session.phase).toBe('training');
    expect(session.firstLockEarned).toBe(false);
    expect(session.startMicroDrill(8_000)).toBe(false);
  });

  it('awards First lock only for switch off then lock then tag', () => {
    const session = microDrill();
    expect(session.performMicro('apply-lock', 7_000)).toBe(false);
    expect(session.phase).toBe('micro-off');
    expect(session.performMicro('switch-off', 8_000)).toBe(true);
    expect(session.performMicro('apply-tag', 9_000)).toBe(false);
    expect(session.phase).toBe('micro-lock');
    expect(session.performMicro('apply-lock', 10_000)).toBe(true);
    expect(session.phase).toBe('micro-tag');
    expect(session.performMicro('apply-tag', 11_000)).toBe(true);
    expect(session.phase).toBe('first-lock-stamp');
    expect(session.firstLockEarned).toBe(true);
    expect(session.tick(300_000)).toBe(false);
    expect(session.continueTraining()).toBe(true);
    expect(session.phase).toBe('training');
    expect(session.continueTraining()).toBe(false);
  });

  it('allows skipping active practice without awarding a stamp', () => {
    const session = microDrill();
    session.performMicro('switch-off', 7_000);
    expect(session.skipMicroDrill()).toBe(true);
    expect(session.phase).toBe('training');
    expect(session.firstLockEarned).toBe(false);
    expect(session.skipMicroDrill()).toBe(false);
  });

  it('ends optional practice at exactly 90 seconds without a failed training attempt', () => {
    const session = microDrill();
    expect(session.tick(6_000 + FIRST_LOCK_LIMIT_MS - 1)).toBe(false);
    expect(session.tick(6_000 + FIRST_LOCK_LIMIT_MS)).toBe(true);
    expect(session.phase).toBe('training');
    expect(session.firstLockEarned).toBe(false);
    expect(session.microRemainingMs(1_000_000)).toBe(0);
  });

  it('cannot earn a stamp with a last-second action after the deadline', () => {
    const session = microDrill();
    session.performMicro('switch-off', 8_000);
    session.performMicro('apply-lock', 10_000);
    expect(session.performMicro('apply-tag', 6_000 + FIRST_LOCK_LIMIT_MS)).toBe(false);
    expect(session.phase).toBe('training');
    expect(session.firstLockEarned).toBe(false);
  });

  it.each(['continue', 'daily'] as const)('returning users enter the %s choice without replaying onboarding', (choice) => {
    const session = new OnboardingSession({ returning: true });
    session.enterXR(1_000);
    expect(session.phase).toBe('returning-choice');
    expect(session.handsTracked(true, false)).toBe(false);
    expect(session.firstTargetSucceeded(3_000)).toBe(false);
    expect(session.chooseReturning(choice)).toBe(true);
    expect(session.phase).toBe('training');
    expect(session.returningChoice).toBe(choice);
    expect(session.chooseReturning('daily')).toBe(false);
    expect(session.firstActionMs).toBeUndefined();
  });

  it('guards timing against nonfinite and earlier timestamps', () => {
    const session = firstTarget();
    session.firstTargetSucceeded(-500);
    expect(session.firstActionMs).toBe(0);
    session.startMicroDrill(Number.NaN);
    expect(session.microRemainingMs(-10)).toBe(FIRST_LOCK_LIMIT_MS);
    expect(session.microRemainingMs(Number.POSITIVE_INFINITY)).toBe(FIRST_LOCK_LIMIT_MS);
  });
});

describe('one-time ghost-hand demos', () => {
  const gestures: readonly DemoGesture[] = ['poke', 'pinch-grab', 'place', 'hold-to-confirm'];

  it.each(gestures)('starts and expires %s once without a frame-triggered replay', (gesture) => {
    const demos = new GhostDemoTracker();
    expect(demos.start(gesture, 1_000)).toBe(true);
    expect(demos.activeGesture).toBe(gesture);
    expect(demos.start(gesture, 2_000)).toBe(false);
    expect(demos.startedAtMs).toBe(1_000);
    expect(demos.tick(1_000 + GHOST_DEMO_DURATION_MS - 1)).toBe(false);
    expect(demos.tick(1_000 + GHOST_DEMO_DURATION_MS)).toBe(true);
    expect(demos.activeGesture).toBeUndefined();
    expect(demos.start(gesture, 8_000)).toBe(false);
  });

  it('immediately skips a demonstration when the learner succeeds', () => {
    const demos = new GhostDemoTracker();
    demos.start('pinch-grab', 1_000);
    expect(demos.succeed('pinch-grab')).toBe(true);
    expect(demos.activeGesture).toBeUndefined();
    expect(demos.start('pinch-grab', 2_000)).toBe(false);
  });

  it('does not play a demo after the learner has already used that gesture successfully', () => {
    const demos = new GhostDemoTracker();
    expect(demos.succeed('poke')).toBe(false);
    expect(demos.start('poke', 1_000)).toBe(false);
    expect(demos.start('place', 2_000)).toBe(true);
  });

  it('keeps the current demo when a different gesture succeeds', () => {
    const demos = new GhostDemoTracker();
    demos.start('place', 1_000);
    expect(demos.succeed('poke')).toBe(false);
    expect(demos.activeGesture).toBe('place');
    expect(demos.hasSeen('poke')).toBe(true);
  });

  it('cancels a lesson transition immediately while preserving learned gestures', () => {
    const demos = new GhostDemoTracker();
    demos.start('poke', 1_000);
    demos.cancel();
    expect(demos.activeGesture).toBeUndefined();
    expect(demos.tick(20_000)).toBe(false);
    expect(demos.start('poke', 21_000)).toBe(false);
    expect(demos.start('pinch-grab', 22_000)).toBe(true);
  });

  it('supports saved familiarity and an explicit repeat_demo request', () => {
    const demos = new GhostDemoTracker(['poke', 'place']);
    expect(demos.start('poke', 1_000)).toBe(false);
    expect(demos.start('hold-to-confirm', 2_000)).toBe(true);
    demos.repeat('poke', 3_000);
    expect(demos.activeGesture).toBe('poke');
    expect(demos.elapsedMs(3_500)).toBe(500);
    expect(demos.elapsedMs(2_000)).toBe(0);
    expect(demos.succeed('poke')).toBe(true);
  });

  it('allows an accessible 20-second repeat without lengthening the next automatic demo', () => {
    const demos = new GhostDemoTracker();
    demos.repeat('poke', 1_000, 20_000);
    expect(demos.tick(1_000 + GHOST_DEMO_DURATION_MS)).toBe(false);
    expect(demos.tick(20_999)).toBe(false);
    expect(demos.tick(21_000)).toBe(true);
    expect(demos.start('place', 22_000)).toBe(true);
    expect(demos.tick(22_000 + GHOST_DEMO_DURATION_MS - 1)).toBe(false);
    expect(demos.tick(22_000 + GHOST_DEMO_DURATION_MS)).toBe(true);
  });

  it('skips an extended manual repeat immediately when the gesture succeeds', () => {
    const demos = new GhostDemoTracker();
    demos.repeat('hold-to-confirm', 1_000, 20_000);
    expect(demos.succeed('hold-to-confirm')).toBe(true);
    expect(demos.activeGesture).toBeUndefined();
    expect(demos.tick(30_000)).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -20])('uses eight seconds for an invalid manual duration %s', (duration) => {
    const demos = new GhostDemoTracker();
    demos.repeat('poke', 1_000, duration);
    expect(demos.tick(1_000 + GHOST_DEMO_DURATION_MS - 1)).toBe(false);
    expect(demos.tick(1_000 + GHOST_DEMO_DURATION_MS)).toBe(true);
  });

  it('bounds manual viewing time at thirty seconds', () => {
    const demos = new GhostDemoTracker();
    demos.repeat('place', 1_000, 90_000);
    expect(demos.tick(30_999)).toBe(false);
    expect(demos.tick(31_000)).toBe(true);
  });
});

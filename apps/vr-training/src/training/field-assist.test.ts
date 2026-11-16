import { describe, expect, it } from 'vitest';
import {
  answerStep, ASSIST_MODULES, backupLine, calibrateLane, CALLOUTS, currentFieldStep, EMERGENCY_LINE, fieldStepsFor, holdGate,
  laneExposure, placeCallout, proximity, resumeAfterRecheck, skipTo, sosMessage, sosTick, startCrewGuide, unitBearings, worstProximity,
} from './field-assist';
import { elecLotoModule } from './modules/elec-loto';
import { waterBurstModule } from './modules/water-burst';

describe('crew guide field steps', () => {
  it('derives a field variant for every module with a gate on every mapped critical step', () => {
    for (const module of ASSIST_MODULES) {
      const steps = fieldStepsFor(module);
      expect(steps.map((step) => step.id)).toEqual([...module.steps].sort((a, b) => a.order - b.order).map((step) => step.id));
      for (const step of steps) if (step.stopGate) expect(step.check).toBeTruthy();
    }
    const elec = fieldStepsFor(elecLotoModule);
    expect(elec.find((step) => step.id === 'test-dead')).toMatchObject({ stopGate: true, verification: 'reading-entry' });
    expect(elec.find((step) => step.id === 're-prove-tester')?.stopGate).toBe(true);
    expect(fieldStepsFor(waterBurstModule).find((step) => step.id === 'trench-safety')?.stopGate).toBe(true);
  });

  it('plain steps advance on one confirm; gates need yes and a 1 s hold', () => {
    let s = startCrewGuide(elecLotoModule);
    s = answerStep(s, 'yes', 0); s = answerStep(s, 'yes', 1);
    expect(currentFieldStep(s)?.id).toBe('switch-off');
    s = answerStep(s, 'yes', 2);
    expect(s.phase).toBe('gate-confirmed');
    expect(holdGate(s, 600, 3).phase).toBe('gate-confirmed');
    s = holdGate(s, 1000, 4);
    expect(currentFieldStep(s)?.id).toBe('apply-lock');
  });

  it('refuses to skip past a gate and enters stop-work on no / not sure', () => {
    let s = startCrewGuide(elecLotoModule);
    expect(skipTo(s, 'safe-to-work').index).toBe(0);
    expect(skipTo(s, 'notify-control').index).toBe(1);
    s = answerStep(answerStep(s, 'yes', 0), 'yes', 1);
    s = answerStep(s, 'not-sure', 2);
    expect(s.phase).toBe('stop-work');
    expect(answerStep(s, 'yes', 3).phase).toBe('stop-work');
    expect(resumeAfterRecheck(s, 'no', 4).phase).toBe('stop-work');
    s = resumeAfterRecheck(s, 'yes', 5);
    expect(s.phase).toBe('gate-confirmed');
    s = holdGate(s, 1200, 6);
    expect(s.log.map((entry) => entry.outcome)).toEqual(['confirmed', 'confirmed', 'stopped', 'resumed', 'confirmed']);
  });

  it('completes a whole module', () => {
    let s = startCrewGuide(waterBurstModule);
    let t = 0;
    while (s.phase !== 'complete') { s = answerStep(s, 'yes', t++); s = holdGate(s, 1000, t++); }
    expect(currentFieldStep(s)).toBeUndefined();
  });
});

describe('hazard callouts', () => {
  it('uses default radii, clamps custom ones and grades proximity', () => {
    let list = placeCallout([], 'live-line', 0, 0);
    list = placeCallout(list, 'open-trench', 20, 0, 'control-feed', 500);
    expect(list[0].radiusM).toBe(CALLOUTS['live-line'].radiusM);
    expect(list[1].radiusM).toBe(100);
    expect(proximity(list[0], 9.9, 0)).toBe('inside');
    expect(proximity(list[0], 14, 0)).toBe('approaching');
    expect(proximity(list[0], 16, 0)).toBe('clear');
  });
  it('reports the worst hazard nearby', () => {
    const list = placeCallout(placeCallout([], 'open-trench', 0, 0), 'live-line', 30, 0);
    expect(worstProximity(list, 21, 0)).toMatchObject({ level: 'inside', callout: { kind: 'live-line' } });
    expect(worstProximity(list, -50, 0).level).toBe('clear');
  });
});

describe('situational awareness', () => {
  const lane = calibrateLane('L1', { x: 0, z: -50 }, { x: 0, z: 50 });
  it('detects in-lane, near-lane and safe positions', () => {
    expect(laneExposure([lane], { x: 1, z: 0 })).toBe('in-live-lane');
    expect(laneExposure([lane], { x: 2.5, z: 0 })).toBe('near-live-lane');
    expect(laneExposure([lane], { x: 4, z: 0 })).toBe('safe');
    expect(laneExposure([{ ...lane, live: false }], { x: 0, z: 0 })).toBe('safe');
    expect(() => calibrateLane('bad', { x: 0, z: 0 }, { x: 0.2, z: 0 })).toThrow();
  });
  it('gives bearings for own units and the soonest backup', () => {
    const units = [{ callsign: 'M-12', type: 'police' as const, x: 0, z: -100, etaMin: 4 }, { callsign: 'A-3', type: 'ems' as const, x: 50, z: 0, etaMin: 7 }];
    const b = unitBearings(units, { x: 0, z: 0 }, 0);
    expect(b[0]).toMatchObject({ callsign: 'A-3', distanceM: 50, bearingDeg: 90 });
    expect(b[1].bearingDeg).toBe(0);
    expect(backupLine(units)).toBe('Backup: Unit M-12 · 4 min');
  });
  it('SOS needs a 2 s hold, cancels on release and is simulated', () => {
    let s = sosTick({ phase: 'idle', heldMs: 0 }, true, 1500);
    expect(s.phase).toBe('holding');
    expect(sosTick(s, false, 16).phase).toBe('idle');
    s = sosTick(s, true, 600);
    expect(sosMessage(s)).toBe('SOS sent to control (simulated)');
    expect(EMERGENCY_LINE).toContain('10111');
  });
});

describe('privacy guard', () => {
  it('assist types carry no person, face or media fields', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./field-assist.ts', import.meta.url), 'utf8');
    for (const banned of ['face', 'suspect', 'photoUrl', 'videoUrl', 'audioUrl', 'personId', 'plate']) expect(new RegExp(`\\b${banned}\\b`, 'i').test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).toBe(false);
  });
});

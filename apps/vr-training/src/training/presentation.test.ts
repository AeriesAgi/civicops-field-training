import { describe, expect, it } from 'vitest';
import { contextAction, checklist, resultStats } from './presentation.js';
import { start, perform } from './procedure.js';
import { createScenario } from './modules/elec-loto.js';
import { buildAttempt } from './scoring.js';

describe('context actions and concise safety evidence', () => {
  it('exposes only notification and the final eligible confirmation', () => {
    expect(contextAction('notify-control', false)).toBe('notify-control');
    expect(contextAction('safe-to-work', false)).toBe('safe-to-work');
    for (const step of ['identify-circuit', 'switch-off', 'apply-lock', 'apply-tag', 'prove-tester', 'test-dead', 're-prove-tester']) expect(contextAction(step, false)).toBeUndefined();
    expect(contextAction('safe-to-work', true)).toBeUndefined();
  });
  it('uses different shapes for done, current and pending checks', () => {
    let state = start(createScenario());
    expect(checklist(state, 'identify-circuit', 1)).toBe('> 1');
    expect(checklist(state, 'notify-control', 2)).toBe('o 2');
    state = perform(state, { type: 'identify-circuit', breakerId: 'sl-3' }, 0);
    expect(checklist(state, 'identify-circuit', 1)).toBe('[x] 1');
    expect(checklist(state, 'notify-control', 2)).toBe('> 2');
  });
  it('reports time, actual errors and independently passed critical checks', () => {
    const state = perform(start(createScenario()), 'safe-to-work', 100);
    const attempt = buildAttempt(state, { startedAt: '2026-10-08T10:00:00Z', completedAt: '2026-10-08T10:01:05Z' });
    expect(resultStats(attempt)).toEqual({ time: '1:05', errors: 1, critical: 0 });
  });
});

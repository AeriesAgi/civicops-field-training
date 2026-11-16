import { describe, expect, it } from 'vitest';
import { canRestartDevLaunch, commandDeadline, executeCommand } from './xr-command.mjs';
const timeout = () => ({ status: null, stdout: '', stderr: '', error: Object.assign(new Error('host timeout'), { code: 'ETIMEDOUT' }) });
const success = { status: 0, stdout: JSON.stringify({ ok: true, data: { result: { value: 42 } } }) };

describe('safe CLI timeout recovery', () => {
  it('keeps browser requests inside the SDK lease while tolerating host pauses for XR commands', () => {
    expect(commandDeadline('browser')).toBeLessThanOrEqual(110_000);
    expect(commandDeadline('xr')).toBeGreaterThan(10 * 60_000);
  });
  it('retries an observation after a host timeout and returns fresh state', () => {
    let calls = 0;
    expect(executeCommand(() => ++calls === 1 ? timeout() : success, { retrySafe: true })).toEqual({ value: 42 });
    expect(calls).toBe(2);
  });
  it('never replays a possibly dispatched input mutation', () => {
    let calls = 0;
    expect(() => executeCommand(() => { calls++; return timeout(); })).toThrow('host timeout');
    expect(calls).toBe(1);
  });
  it('bounds read retries and rejects application failures without retrying', () => {
    let calls = 0;
    expect(() => executeCommand(() => { calls++; return timeout(); }, { retrySafe: true })).toThrow();
    expect(calls).toBe(3);
    calls = 0;
    expect(() => executeCommand(() => { calls++; return { status: 1, stdout: JSON.stringify({ ok: false, error: { code: 'missing_entity' } }) }; }, { retrySafe: true })).toThrow('missing_entity');
    expect(calls).toBe(1);
  });
  it('refuses unknown outcomes and recovered sessions without replaying', () => {
    for (const outcome of ['outcome_unknown', 'not_executed']) {
      let calls = 0;
      expect(() => executeCommand(() => { calls++; return { status: 0, stdout: JSON.stringify({ ok: true, outcome }) }; }, { retrySafe: true })).toThrow('inspect state');
      expect(calls).toBe(1);
    }
  });
});

// Editor/browser launch revisions can arrive before the app frame exists.
it('waits for the application command bridge, not a browser launch revision', async () => {
  const { managedAppReady } = await import('./xr-command.mjs');
  expect(managedAppReady({ state: { browserConnected: false, browserCommandReady: false } })).toBe(false);
  expect(managedAppReady({ state: { browserConnected: true, browserCommandReady: false } })).toBe(false);
  expect(managedAppReady({ state: { browserConnected: true, browserCommandReady: true } })).toBe(true);
});

it('restarts only a confirmed-clean launcher timeout, never an unknown or native-input failure',()=>{
  const clean={ok:false,error:{code:'dev_up_timeout',details:{cleanupConfirmed:true}}};
  expect(canRestartDevLaunch(clean)).toBe(true);
  expect(canRestartDevLaunch({...clean,outcome:'outcome_unknown'})).toBe(false);
  expect(canRestartDevLaunch({...clean,error:{...clean.error,details:{cleanupConfirmed:false}}})).toBe(false);
  expect(canRestartDevLaunch({...clean,error:{...clean.error,code:'runtime_command_failed'}})).toBe(false);
});

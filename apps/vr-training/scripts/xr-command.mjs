import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Browser automation leases are capped at 110 seconds by IWSDK 1.0.1.
export const commandDeadline = domain => domain === 'browser' ? 100_000 : 900_000;

/** Retry timed-out observations only. Dispatched input is never replayed. */
export function executeCommand(invoke, { retrySafe = false, onRetry = () => {} } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = invoke();
    if (retrySafe && result.error?.code === 'ETIMEDOUT' && attempt < 2) {
      onRetry(attempt + 1); continue;
    }
    let envelope;
    try { envelope = JSON.parse(result.stdout || result.stderr); }
    catch { throw new Error(String(result.error ?? result.stderr ?? result.stdout)); }
    assert(result.status === 0 && envelope.ok !== false, JSON.stringify(envelope));
    assert(!['not_executed', 'outcome_unknown'].includes(envelope.outcome), 'Command was not safely completed; inspect state before retrying');
    return envelope.data?.result ?? envelope.data ?? envelope;
  }
}

/** A lifecycle revision change does not imply that the application is ready. */
export function managedAppReady(snapshot) {
  const state = snapshot.state ?? snapshot.data?.state;
  return state?.browserCommandReady === true && state?.browserConnected === true;
}

/** No XR input has run, and IWSDK explicitly confirms the timed-out launcher is gone. */
export function canRestartDevLaunch(result) {
  return result?.ok === false && result.outcome === undefined
    && result.error?.code === 'dev_up_timeout' && result.error.details?.cleanupConfirmed === true;
}

if(process.argv[1]?.endsWith('/xr-command.mjs')&&process.argv[2]==='can-restart-launch'){
  try{process.exitCode=canRestartDevLaunch(JSON.parse(readFileSync(process.argv[3],'utf8')))?0:1;}
  catch{process.exitCode=1;}
}

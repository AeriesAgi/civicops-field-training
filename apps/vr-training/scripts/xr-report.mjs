import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Documentation and the report aggregator do not change the app or hand inputs. */
function runtimeChanges(changes='') {
  return changes.split('\n').map(line=>line.trim().replace(/^(?:[A-Z?!]{1,2}) /,'')).filter(Boolean).filter(line=>
    !/\.md$/i.test(line)&&!/(?:^|\/)scripts\/xr-report(?:\.test)?\.mjs$/.test(line)
    // These standalone still-camera/report tools are not imported by e2e-xr,
    // xr-driver or the app. Keep hand-input/sanitizer scripts strictly compared.
    &&!/(?:^|\/)scripts\/(?:capture-round6-(?:roads|taxi)\.mjs|review-round6\.sh|report-round6\.mjs)$/.test(line)
    &&!/(?:^|\/)scripts\/(?:capture-round7-(?:roads|electrical)\.mjs|review-round7(?:-sky)?\.sh|report-round7\.mjs|preview-round7-taxi\.mjs)$/.test(line)
    &&!/(?:^|\/)tools\/blender\/review-taxi-lods\.py$/.test(line));
}

/** Aggregate only checkpoints explicitly completed in this invocation. */
export function aggregateReports(requested, completed, checkpoints) {
  const ids = { electrical: 'elec-loto', water: 'water-burst', roads: 'roads-zone', fire: 'scene-safety', assist: 'field-assist', ar:'ar-room' };
  assert(requested.every(name => ids[name]), 'Unknown requested case');
  assert.equal(new Set(requested).size, requested.length, 'Duplicate requested cases');
  assert.equal(new Set(completed).size, completed.length, 'Duplicate completed cases');
  assert(completed.every(name => requested.includes(name)), 'Unexpected completed case');
  assert.equal(checkpoints.length, completed.length);
  for (const [index, report] of checkpoints.entries()) {
    assert.equal(report.passed, true, 'A failed checkpoint cannot pass the suite');
    assert.equal(report.modules.length, 1, 'One completed module per isolated checkpoint');
    assert.equal(report.modules[0].passed, true);
    assert.equal(report.modules[0].module, ids[completed[index]], 'Checkpoint must match its requested case');
    assert.equal(report.revision, checkpoints[0].revision, 'Do not mix source revisions');
    assert.deepEqual(runtimeChanges(report.changedFiles),runtimeChanges(checkpoints[0].changedFiles), 'Do not mix runtime working trees');
  }
  return {
    generatedAt: new Date().toISOString(), revision: checkpoints[0]?.revision,
    changedFiles: checkpoints[0]?.changedFiles, input: 'IWER tracked hands only',
    isolation: 'Fresh managed browser per case; field/Assist cases check their return path, AR checks placement/restore/fallback.',
    sourceScope:'Same revision and runtime/input changes. Markdown and named standalone round-6/7 still, source-model and report tools do not alter the app or native hand run.',
    limitations: checkpoints[0]?.limitations ?? [], requested, completed,
    observations: checkpoints.flatMap(r => r.observations),
    captures: checkpoints.flatMap(r => r.captures), modules: checkpoints.flatMap(r => r.modules),
    passed: requested.length > 0 && requested.length === completed.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requested = process.argv[2].split(' '), completed = process.argv.slice(3);
  const reports = completed.map(name => JSON.parse(readFileSync(`artifacts/xr-e2e/${name}-report.json`, 'utf8')));
  writeFileSync('artifacts/xr-e2e/report.json', JSON.stringify(aggregateReports(requested, completed, reports), null, 2));
}

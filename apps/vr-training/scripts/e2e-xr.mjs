import {roomAR} from './e2e-ar.mjs';
import {assistNavigationTarget,assistNavigationPressed} from './assist-navigation-ack.mjs';
// Genuine IWER hand regressions. No ECS writes, staged scenes or procedure injection.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { aim, browser, capture, click, command, fromWorld, grab, inspect, modelAnchor, move, open, pinch, place, placeAtGrip, pose, query, read, rotate, run, selectObject, transform, until, values, wait } from './xr-driver.mjs';

const evidence = {
  generatedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  changedFiles: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  input: 'IWER tracked hands only',
  passed: false,
  limitations: ['Emulator hand poses can exceed natural reach; this replay does not verify seated comfort or the teleport gesture.', 'Software-renderer counters do not establish Quest frame rate.'],
  observations: [], captures: [], modules: [],
};
const save = () => writeFileSync('artifacts/xr-e2e/report.json', JSON.stringify(evidence, null, 2));
const session = { 'elec-loto': ['bench-rig', 'TrainingSession'], 'water-burst': ['water-session', 'WaterSession'], 'roads-zone': ['roads-session', 'RoadsSession'], 'scene-safety': ['fire-session', 'SceneSafetySession'] };
let current;
const state = () => values(...session[current]);
async function step(expected) {
  const actual = await until(`${current} expected ${expected}`, state, s => s.step === expected && !s.failed);
  evidence.observations.push({ module: current, expected, actual }); save();
  console.log(`${current}: ${expected}`);
  return actual;
}
const shot = name => { const result = capture(name); evidence.captures.push(result); save(); };
const point = name => {
  if (name === 'KnownLiveContact') return modelAnchor('proving-unit', 'hero-proving-unit.glb', name);
  if (/^ValveSeat[A-D]$|^BarrierSeat$|^SignSeat$/.test(name)) return modelAnchor('water-road', 'water-road.glb', name);
  return transform(name).position;
};
const attempts = () => read(`JSON.parse(localStorage.getItem('civicops.training.progress.v1')??'[]')`);
async function finishEvidence(prefix, countBefore) {
  const s = await until(`${current} complete`, state, s => s.complete && !s.failed && s.score >= 80);
  const saved = attempts().filter(a => a.moduleId === current);
  assert.equal(saved.length, countBefore + 1, `${current} must persist exactly one new attempt`);
  const attempt = saved.at(-1);
  const performance = values(session[current][0], 'TrainingSession');
  assert.equal(attempt.passed, true); assert.equal(attempt.inputMode, 'hands'); assert.deepEqual(attempt.criticalErrors, []);
  assert.equal(attempt.steps.filter(s => s.outcome === 'correct' && !s.stepId.startsWith('pre-')).length, current === 'elec-loto' ? 9 : current === 'roads-zone' ? 13 : 7);
  const resultPanel = current === 'elec-loto' ? 'results-panel' : `${prefix}-results-panel`;
  const resultCopy = JSON.stringify(inspect(resultPanel));
  assert(resultCopy.includes('PASS'));
  assert(/ASSISTANT|OPERATOR|SUPERVISOR/i.test(resultCopy), 'Saved practice ladder must be visible');
  pose('hand-left',[-.35,.75,.25]);pose('hand-right',[.35,.75,.25]);
  shot(`${prefix}-pass`);
  await click(resultPanel, 'try-again');
  const fresh = await step({ 'elec-loto': 'identify-circuit', 'water-burst': 'make-area-safe', 'roads-zone': 'park-vehicle', 'scene-safety': 'place-blocker' }[current]);
  assert.equal(fresh.complete, false); assert.equal(fresh.score, 100);
  if(current==='roads-zone')assert.equal(fresh.crewDispatch,'standby');
  const stepsPanel = current === 'elec-loto' ? 'steps-panel' : `${prefix}-steps-panel`;
  await click(stepsPanel, current === 'elec-loto' ? 'jobs-lesson' : 'back-to-jobs');
  await until(`${current} return hub`, () => read(`({module:window.civicOpsModule,fade:window.civicOpsFade,error:window.civicOpsModuleError})`), s => s.module === 'board' && s.fade < .05 && !s.error, 40);
  assert.equal(run('ecs', 'find', { withComponents: ['Grabbed'] }).entities.length, 0);
  assert.equal(attempts().filter(a => a.moduleId === current).length, countBefore + 1, 'Retry/exit must not award an incomplete attempt');
  evidence.modules.push({ module: current, passed: true, score: s.score, retry: true, returnToHub: true, performance, attempt }); save();
}

async function electrical() {
  current = 'elec-loto'; await open(current);
  const before = attempts().filter(a => a.moduleId === current).length;
  shot('electrical-start');
  if (values('bench-rig', 'FirstMinutes').phase === 'returning-choice') await click('steps-panel', 'intro-primary');
  await selectObject('breaker-sl-3', [0, 0, .032]);
  if (values('bench-rig', 'FirstMinutes').phase === 'micro-offer') await click('steps-panel', 'intro-secondary');
  await step('notify-control');
  await click('controls-panel', 'notify-control'); await step('switch-off');
  await selectObject('breaker-sl-3', [0, 0, .032]); await step('apply-lock');
  await place('padlock', transform('lock-zone').position); await step('apply-tag');
  await place('danger-tag', transform('tag-zone').position); await step('prove-tester');
  await grab('voltage-tester');
  const contact = async (target, next, y = 0) => {
    const sensor = point(target); sensor[1] += y;
    const tester = transform('voltage-tester'); const tip = rotate([0, 0, -.1], tester.quaternion);
    const hand = run('xr', 'get-transform', { device: 'hand-right' });
    const p = hand.position ?? hand.transform?.position;
    assert(p, `Hand pose unavailable: ${JSON.stringify(hand)}`);
    move((Array.isArray(p) ? p : [p.x, p.y, p.z]).map((n, i) => n + sensor[i] - tester.position[i] - tip[i]));
    await step(next);
  };
  await contact('KnownLiveContact', 'test-dead'); await contact('terminals', 're-prove-tester', .024); await contact('KnownLiveContact', 'safe-to-work'); pinch(0);
  await click('controls-panel', 'safe-to-work', 1500);
  await finishEvidence('electrical', before);
}

async function water() {
  current = 'water-burst'; await open(current); const before = attempts().filter(a => a.moduleId === current).length;
  shot('water-start');
  await place('water-barrier-kit', point('BarrierSeat')); await place('water-sign', point('SignSeat'));
  await click('water-controls-panel', 'set-spoil-back'); await step('identify-valves');
  await click('water-network-panel', 'plan-primary'); await step('notify-control');
  await click('water-controls-panel', 'notify-control'); await step('close-valves');
  for (const valve of ['A', 'B']) {
    const cover = point(`water-cover-${valve}`);
    await grab(`water-cover-${valve}`); move([cover[0], cover[1] + .5, cover[2]]); query('water-session'); pinch(0);
    const seat = point(`ValveSeat${valve}`);
    const key = await grab('water-key', [0, .15, 0]);
    if (state().keyValve) { move([key[0], key[1] + 1, key[2]]); await until('key lifted clear', state, s => !s.keyValve); }
    move([seat[0], seat[1] + .15, seat[2]]);
    await until(`key seated ${valve}`, state, s => s.keyValve === valve);
    for (let turn = 0; turn < 3; turn++) for (const roll of [90, 179, -90, 0]) {
      move([seat[0], seat[1] + .15, seat[2]], 1.2, { pitch: 0, yaw: 0, roll });
      assert.equal(state().failed, false, 'Controlled valve closure');
    }
    pinch(0); assert(state()[`turns${valve}`] >= 2.99, `${valve} needs three actual wrist turns`);
  }
  await step('confirm-isolation');
  await click('water-controls-panel', 'open-washout'); await click('water-controls-panel', 'confirm-isolation'); await step('trench-safety');
  for (const action of ['check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding', 'trench-safety']) await click('water-controls-panel', action);
  await step('ready-for-repair'); await click('water-controls-panel', 'ready-for-repair', 1500);
  await finishEvidence('water', before);
}

async function roads() {
  current = 'roads-zone'; await open(current); const before = attempts().filter(a => a.moduleId === current).length;
  shot('roads-start');
  await click('roads-controls-panel','incident-action');await click('roads-controls-panel','incident-action');
  await click('roads-controls-panel', 'work-start'); await click('roads-controls-panel', 'beacon-toggle'); await step('advance-warning');
  await place('roads-warning', fromWorld([-6, 0, 4.65]), -90); await step('cone-taper');
  for (let i = 0; i < 6; i++) await place(`roads-cone-${i + 1}`, fromWorld([-4.5 + i * 1.25, 0, 2.75 - i * .47]));
  await step('keep-left'); await place('roads-keep-left', fromWorld([-4.5, 0, 4.65]), -90); await step('protect-work-area');
  // Use the manufactured rail grip; the floor pivot sits between the legs.
  // Raised kerbs make grabbing that empty floor origin unreliable.
  const barrier=async(name,position,yaw=0)=>{
    const contact=await placeAtGrip(name,'roads-barrier.glb',fromWorld(position),yaw);
    evidence.observations.push({module:current,measuredGripContact:contact});save();
  };
  for (let i = 0; i < 12; i++) await barrier(`roads-barrier-${i + 1}`, [8 + (i % 6) * 2, 0, i < 6 ? .35 : 3.65]);
  for (let i = 0; i < 4; i++) await barrier(`roads-barrier-${i + 13}`, [i < 2 ? 7.9 : 18.1, 0, i % 2 ? 2.75 : .95],90);
  await step('position-flaggers'); await click('roads-controls-panel','work-start');
  await until('both marshals reach protected bays',()=>state(),s=>s.crewDispatch==='on-station',120);
  await step('test-traffic');
  pose('headset',fromWorld([3.8,1.7,2.6]));
  {const target=fromWorld([5.7,1.6,4.65]);run('xr','look-at',{device:'headset',target:{x:target[0],y:target[1],z:target[2]}});}
  pose('hand-left',[-.35,.75,.25]);pose('hand-right',[.35,.75,.25]);shot('roads-crew-station');
  await click('roads-controls-panel', 'zone-check');
  assert.equal(state().zoneGood, true);
  await place('PinchTapeReel',fromWorld([10,1.05,3.65]));
  for(let i=0;i<3;i++)await click('roads-controls-panel','incident-action');
  assert.equal(state().incidentStep,'ready');
  await click('roads-controls-panel', 'run-traffic');
  await until('traffic demonstration finished', () => inspect('roads-controls-panel', '#traffic-finish')[0], s => s?.state?.visible && s?.state?.displayed, 120);
  await click('roads-controls-panel', 'traffic-finish');
  await finishEvidence('roads', before);
}

async function fire() {
  current = 'scene-safety'; await open(current); const before = attempts().filter(a => a.moduleId === current).length;
  shot('fire-start');
  await place('fire-engine', fromWorld([-1.9, 0, 11.5]), .7 * 180 / Math.PI); await step('warning-taper');
  for (let i = 0; i < 6; i++) await place(`fire-cone-${i + 1}`, fromWorld([-5.3 + i * .6, 0, 20 - i * 2.4]));
  for (const [i, x, z] of [[1, -5.6, 21.2], [2, -4.9, 18.4], [3, -4.2, 15.8]]) await place(`fire-flare-${i}`, fromWorld([x, 0, z]));
  await step('size-up');
  // Keep the ray hand clear of nearby casualties. A native probe proved that
  // near-touch priority otherwise presses casualty 1 while the cable stays hovered.
  for (const [index,hazard] of ['fuel-spill', 'downed-cable', 'unstable-vehicle', 'traffic'].entries()){await selectObject(`hazard-${hazard}`, [.24, 0, 0], [-.8, .65, 0]);await until(`hazard ${hazard} recorded`,state,s=>s.found===index+1);}
  await step('cable-exclusion'); await place('fire-exclusion', fromWorld([-6.2, 0, 2.4])); await step('safe-approach');
  pose('headset', fromWorld([-4.2, 1.25, 5.8])); await click('fire-controls-panel', 'mark-approach'); await step('triage');
  for (const [id, tag, x, z] of [['c1', 'minor', -5.2, 5.6], ['c2', 'delayed', -2.7, 1.3], ['c3', 'immediate', -1.5, -.5], ['c4', 'expectant', -4.4, -1.5]]) {
    await selectObject(`fire-${id}`, [0, 1, 0]); await place(`fire-tag-${tag}`, fromWorld([x, 1.05, z]));
  }
  await step('handover'); await click('fire-controls-panel', 'send-handover'); await click('fire-handover-panel', 'see-results');
  await finishEvidence('fire', before);
}

async function assistClick(action, holdMs = 0) {
  let previous;
  const p = await until(`assist-${action} steady`,()=>read(`window.civicOpsWhere(["assist-${action}"])[0][1]`),p=>{if(!Array.isArray(p))return false;const steady=previous&&Math.hypot(...p.map((n,i)=>n-previous[i]))<.003;previous=p;return steady;});
  const normal=rotate([0,0,.45],transform(`assist-${action}`).quaternion);
  pinch(0);pose('hand-right',p.map((n,i)=>n+normal[i]));aim('hand-right',p);
  await until(`hover assist-${action}`,()=>query(`assist-${action}`),s=>s.components.some(c=>c.componentId==='Hovered'));
  if(action==='jobs'){
    pinch(1);
    // Observe across document replacement; the old XR bridge is intentionally gone.
    await browser(`export default async function({page}){
      const deadline=Date.now()+90000;let last;
      while(Date.now()<deadline){
        for(const target of page.frames()){
          try{last=await target.evaluate(()=>({module:window.civicOpsModule,fade:window.civicOpsFade,error:window.civicOpsModuleError}));}
          catch{continue;}
          if(last.module==='board'&&last.fade<.05&&!last.error)return true;
        }
        await page.waitForTimeout(250);
      }
      throw new Error('Jobs board route did not settle: '+JSON.stringify(last));
    }`,true);
    return;
  }
  const destination=assistNavigationTarget(action);
  if(destination){
    try{
      pinch(1);
      await until(`navigation press assist-${action}`,()=>({
        pressed:run('ecs','find',{withComponents:['FieldAssistTarget','Pressed'],limit:30}).entities.map(e=>e.name),
        visible:run('ecs','find',{withComponents:['FieldAssistTarget'],limit:40}).entities.map(e=>e.name),
      }),s=>assistNavigationPressed(action,s.pressed,s.visible));
    }finally{pinch(0);}
    await until(`navigation release assist-${action}`,()=>run('ecs','find',{withComponents:['FieldAssistTarget','Pressed'],limit:30}).entities,s=>s.length===0);
    await until(`destination ${destination}`,()=>run('ecs','find',{namePattern:`^${destination}$`,limit:5}).entities,s=>s.length===1);
    return;
  }
  try {
    pinch(1);
    await until(`press assist-${action}`,()=>query(`assist-${action}`),s=>s.components.some(c=>c.componentId==='Pressed'));
    for(let frame=0;frame<3;frame++)run('ecs','find',{withComponents:['FieldAssistTarget','Pressed'],limit:30});
    if (holdMs) await wait(holdMs);
  } finally {pinch(0);}
  await until(`release assist-${action}`,()=>run('ecs','find',{withComponents:['FieldAssistTarget','Pressed'],limit:30}).entities,s=>s.length===0);
}
async function assist() {
  current = 'field-assist'; await open(current);
  const before = read(`JSON.parse(window.civicOpsAssistLog()).entries.length`);
  await assistClick('open-crew'); shot('assist-start');
  let stopped = false;
  for (let i = 0; i < 9; i++) {
    await assistClick('answer-yes');
    const buttons = run('ecs', 'find', { namePattern: '^assist-gate-hold$' }).entities;
    if (buttons.length) {
      if (!stopped) {
        await assistClick('answer-not-sure');
        assert.equal(run('ecs', 'find', { namePattern: '^assist-(gate-hold|answer-yes)$' }).entities.length, 0, 'Stop work removes all advance controls');
        assert.equal(run('ecs', 'find', { namePattern: '^assist-recheck$' }).entities.length, 1);
        shot('assist-stop');
        await assistClick('recheck');
        assert.equal(run('ecs', 'find', { namePattern: '^assist-gate-hold$' }).entities.length, 1, 'Human recheck still requires a deliberate hold');
        stopped = true;
      }
      await assistClick('gate-hold', 1500);
    }
    evidence.observations.push({module:current,guideIteration:i+1,buttons:run('ecs','find',{withComponents:['FieldAssistTarget'],limit:30}).entities.map(e=>e.name),logEntries:read('JSON.parse(window.civicOpsAssistLog()).entries.length')});
  }
  assert.equal(stopped, true, 'Exercise a real negative safety gate');
  assert.equal(run('ecs', 'find', { namePattern: '^assist-open-log$' }).entities.length, 1);
  await assistClick('open-log');
  const log = read(`JSON.parse(window.civicOpsAssistLog()).entries`);
  assert.equal(log.length, before + 12);
  assert.equal(log.slice(before).filter(e => e.step.decision === 'human-confirmed').length, 10);
  assert.deepEqual(log.slice(before).filter(e => e.step.decision === 'human-review-required').map(e => e.step.outcome), ['stopped', 'needs-review']);
  assert.equal(log.slice(before).filter(e => e.step.step === 'confirm-readiness').length, 1);
  assert.equal(await read(`(async()=>{const {verifyFieldLog}=await import('/src/training/field-step-log.ts');return verifyFieldLog(JSON.parse(window.civicOpsAssistLog()).entries)})()`), -1);
  shot('assist-complete'); await assistClick('picker'); await assistClick('jobs');
  await until('Assist return hub', () => read(`({module:window.civicOpsModule,fade:window.civicOpsFade,error:window.civicOpsModuleError})`), s => s.module === 'board' && s.fade < .05 && !s.error, 40);
  evidence.modules.push({ module: current, passed: true, returnToHub: true, stopAndRecheck: true, logEntries: log.length - before }); save();
}

async function ar(){const {captures,...result}=await roomAR();evidence.captures.push(...captures);evidence.modules.push({...result,passed:true});save();}

const cases = { electrical, water, roads, fire, assist, ar };
const requested = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cases);
try {
  // runtime wait can return when the editor is ready, before the app iframe
  // exists. Fence the actual managed application before any browser command.
  await until('managed application ready', () => command(['dev', 'status']), s => s.state?.browserCommandReady === true, 60);
  for (const name of requested) {
    assert(cases[name], `Unknown module ${name}`); console.log(`START ${name}`);
    await cases[name]();
    writeFileSync(`artifacts/xr-e2e/${name}-report.json`, JSON.stringify({
      ...evidence, passed: true, snapshotScope: 'Completed modules only; this checkpoint does not assert the entire requested suite passed.',
      modules: [evidence.modules[evidence.modules.length - 1]],
    }, null, 2));
    console.log(`PASS ${name}`);
  }
  evidence.passed = true;
} catch (error) { evidence.passed = false; evidence.error = String(error); throw error; }
finally { save(); try { pinch(0); } catch {} }

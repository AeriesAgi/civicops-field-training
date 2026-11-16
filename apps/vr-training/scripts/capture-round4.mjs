// Managed-runtime evidence only: all procedure actions are real emulated hands.
// Source .tools/env.sh, then start the managed session with:
// npx iwsdk dev up --ai-mode agent --headless --open --allow-browser-automation \
//   --screenshot-width 1280 --screenshot-height 900
// Agent mode keeps the owner's true viewport fixed across CLI/CDP connections.
// node scripts/capture-round4.mjs all|views|procedure|procedure-verify|settings|reset|hero|tools|stats
// For manual image review at live contacts, use procedure-photo (held tester),
// procedure-photo-finish (held confirmation), then release-photo-hold. Explicit
// photographic pauses retain real hand selection; reset/reload ends the pause.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const destination = 'artifacts/screens';
const executable = './node_modules/.bin/iwsdk';
const evidence = { captures: [], observations: [] };
const currentPhase = process.argv[2] ?? 'all';
// Keep earlier evidence intact when replaying the same real-hand regression in a later round.
const capturePrefix = process.env.CIVICOPS_CAPTURE_PREFIX ?? 'vr04';
if (!/^vr\d+(?:-[a-z0-9]+)*$/.test(capturePrefix)) throw new Error('Invalid capture prefix');
function persistEvidence() {
  writeFileSync(`artifacts/${capturePrefix}-${currentPhase}-evidence.json`, JSON.stringify(evidence, null, 2));
}
const scene = JSON.parse(readFileSync('public/scenes/main.iwsdk.scene.json', 'utf8'));
const panels = new Map();
let sessionIndex;
let retainHeldInput = false;
const findNode = (id, nodes = scene.nodes) => {
  for (const node of nodes ?? []) {
    if (node.id === id) return node;
    const child = node.children ? findNode(id, node.children) : undefined;
    if (child) return child;
  }
};

function decode(domain, action, result) {
  if (result.error) throw new Error(`${domain} ${action}: ${result.error.message}`);
  let envelope;
  try { envelope = JSON.parse(result.stdout); }
  catch {
    // CLI emits structured failure envelopes on stderr, successful ones on stdout.
    try { envelope = JSON.parse(result.stderr); }
    catch { throw new Error(`${domain} ${action}: invalid CLI JSON\n${result.stdout}\n${result.stderr}`); }
  }
  if (result.status !== 0 || envelope.ok === false) {
    throw new Error(`${domain} ${action}: ${JSON.stringify(envelope)}\n${result.stderr}`);
  }
  // CLI recovery never silently repeats a dispatched mutation.
  if (envelope.outcome === 'not_executed' || envelope.outcome === 'outcome_unknown') {
    throw new Error(`${domain} ${action}: ${envelope.outcome}; inspect the managed state before rerunning`);
  }
  return envelope.data?.result ?? envelope.data ?? envelope.result ?? envelope;
}

function cliArgs(domain, action, parameters, output) {
  const args = [domain, action, '--input-json', JSON.stringify(parameters), '--timeout', '45000'];
  if (output) args.push('--output-file', output);
  return args;
}

function run(domain, action, parameters = {}, output) {
  return decode(domain, action, spawnSync(executable, cliArgs(domain, action, parameters, output), {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }));
}

const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const pose = (device, x, y, z, pitch = 0, yaw = 0, roll = 0) => run('xr', 'set-transform', {
  device, position: { x, y, z }, orientation: { pitch, yaw, roll },
});
const aim = (device, x, y, z) => run('xr', 'look-at', { device, target: { x, y, z } });
const pinch = value => run('xr', 'set-select-value', { device: 'hand-right', value });
const move = (x, y, z) => run('xr', 'animate-to', {
  device: 'hand-right', position: { x, y, z }, duration: .5,
});
const vec = value => Array.isArray(value) ? value : [value.x, value.y, value.z];

function sceneTransform(nodeId) {
  const result = run('scene', 'transform', { nodeId });
  const transform = result.globalTransform ?? result.worldTransform ?? result.global ?? result;
  const position = vec(result.positionRelativeToXROrigin ?? result.globalPosition ?? transform.position);
  const quaternion = result.globalQuaternion ?? transform.quaternion ?? transform.rotationQuaternion;
  const scale = vec(result.globalScale ?? transform.scale ?? [1, 1, 1]);
  return { position, quaternion, scale, result };
}

function rotate(point, quaternion) {
  if (!quaternion) throw new Error('scene transform omitted global quaternion; cannot safely aim at a rotated panel');
  const [x, y, z] = point;
  const [qx, qy, qz, qw] = Array.isArray(quaternion)
    ? quaternion : [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
  const ix = qw*x + qy*z - qz*y, iy = qw*y + qz*x - qx*z;
  const iz = qw*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
  return [ix*qw - iw*qx - iy*qz + iz*qy,
    iy*qw - iw*qy - iz*qx + ix*qz,
    iz*qw - iw*qz - ix*qy + iy*qx];
}

function panelIndex(nodeId) {
  if (!panels.has(nodeId)) {
    const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entities = run('ecs', 'find', { namePattern: `^${escaped}$` }).entities;
    if (entities.length !== 1) throw new Error(`Expected one live panel ${nodeId}, found ${entities.length}`);
    panels.set(nodeId, entities[0].entityIndex);
  }
  return panels.get(nodeId);
}

function inspect(nodeId, selector) {
  const result = run('ui', 'inspect', { entityIndex: panelIndex(nodeId), selector, limit: 50 });
  if (result.elements.length !== 1) throw new Error(`${nodeId} ${selector}: expected one live element, got ${result.elements.length}`);
  return result.elements[0];
}

// Obtain the exact source ancestor chain. Each ancestor needs a stable ID or a
// unique class; live layout values, never authored button offsets, supply centers.
function ancestorSelectors(nodeId, elementId) {
  const node = findNode(nodeId);
  if (!node) throw new Error(`Unknown scene panel ${nodeId}`);
  const assetId = node.content.asset;
  const manifest = readFileSync('src/assets.ts', 'utf8');
  const helperPattern = new RegExp(`['\"]${assetId}['\"]\\s*:\\s*ui\\(\\s*['\"]([^'\"]+)['\"]`);
  const assetPattern = new RegExp(`['\"]?${assetId}['\"]?\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm');
  const asset = manifest.match(assetPattern)?.[1];
  const helper = manifest.match(helperPattern)?.[1];
  const source = helper ? `${helper}.uikitml` : asset?.match(/src:\s*['\"](?:\.\/)?ui\/([^'\"]+)['\"]/)?.[1]
    ?? asset?.match(/url:\s*['\"](?:\.\/)?ui\/([^'\"]+)['\"]/)?.[1];
  if (!source) throw new Error(`Cannot resolve UIKitML source for manifest ${assetId}`);
  const markup = readFileSync(`public/ui/${source}`, 'utf8').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  for (const match of markup.matchAll(/<\/?([A-Za-z][\w.-]*)([^>]*)>/g)) {
    if (match[0].startsWith('</')) { stack.pop(); continue; }
    const id = match[2].match(/\bid\s*=\s*['\"]([^'\"]+)['\"]/)?.[1];
    const className = match[2].match(/\bclass\s*=\s*['\"]([^'\"]+)['\"]/)?.[1]?.split(/\s+/)[0];
    const selector = id ? `#${id}` : className ? `.${className}` : null;
    if (id === elementId) {
      const ancestors = stack.filter(item => !['html', 'body'].includes(item.tag));
      if (ancestors.some(item => !item.selector)) throw new Error(`${nodeId} #${elementId} has an unnamed layout ancestor; add a stable ancestor ID`);
      return [...ancestors.map(item => item.selector), `#${elementId}`];
    }
    if (!match[0].endsWith('/>') && !['img', 'br', 'input', 'hr', 'meta', 'link'].includes(match[1])) stack.push({ tag: match[1], selector });
  }
  throw new Error(`${nodeId} lacks #${elementId}`);
}

function uiPoint(nodeId, elementId) {
  let x = 0, y = 0;
  const selectors = ancestorSelectors(nodeId, elementId);
  const document = run('ui', 'inspect', { entityIndex: panelIndex(nodeId), limit: 50 });
  for (const selector of selectors) {
    const named = selector.startsWith('#') ? document.elements.find(element => element.id === selector.slice(1)) : undefined;
    const center = (named ?? inspect(nodeId, selector)).layout?.relativeCenter;
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) throw new Error(`${nodeId} ${selector}: no measured relativeCenter`);
    x += center[0]; y += center[1];
  }
  const transform = sceneTransform(nodeId);
  const offset = rotate([x * .01 * transform.scale[0], y * .01 * transform.scale[1], 0], transform.quaternion);
  const point = offset.map((value, axis) => value + transform.position[axis]);
  evidence.observations.push({ nodeId, elementId, selectors, point });
  return { point, transform };
}

function aimButton(nodeId, elementId, originOffset = [0, 0, 0]) {
  const { point, transform } = uiPoint(nodeId, elementId);
  // Keep the emulated index outside the SDK's 20cm touch-hover radius so this
  // intentional ray test cannot be pre-empted by a nearer touch pointer.
  const normal = rotate([0, 0, .42], transform.quaternion);
  pinch(0);
  pose('hand-right', point[0] + normal[0] + originOffset[0], point[1] + normal[1] + originOffset[1], point[2] + normal[2] + originOffset[2]);
  aim('hand-right', ...point);
  let settled = 0;
  for (let attempt = 0; attempt < 8 && settled < 2; attempt++) {
    settled = inspect(nodeId, `#${elementId}`).state?.hovered ? settled + 1 : 0;
  }
  if (settled < 2) throw new Error(`${nodeId} #${elementId}: tracked-hand ray did not settle; inspect live layout/state`);
  return point;
}

function clickButton(nodeId, elementId) {
  aimButton(nodeId, elementId);
  pinch(1);
  // Keep genuine selection held across several managed reads. The software
  // renderer can miss a shorter pulse between XR frames; no press is injected.
  for (let frame = 0; frame < 3; frame++) inspect(nodeId, `#${elementId}`);
  pinch(0);
}

function clickObject(nodeId) {
  const { position } = sceneTransform(nodeId);
  const before = values(state()).step;
  pose('hand-right', position[0], position[1], position[2] + .26);
  aim('hand-right', ...position);
  pinch(1);
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const sample = state();
      if (values(sample).step !== before) return;
    }
    throw new Error(`${nodeId}: held tracked-hand selection did not advance ${before}`);
  } finally { pinch(0); }
}

function state() {
  if (sessionIndex === undefined) {
    const entities = run('ecs', 'find', { withComponents: ['TrainingSession'] }).entities;
    if (entities.length !== 1) throw new Error(`Expected one TrainingSession, found ${entities.length}`);
    sessionIndex = entities[0].entityIndex;
  }
  return run('ecs', 'query', { entityIndex: sessionIndex, components: ['TrainingSession', 'FirstMinutes'] });
}
const firstMinutes = sample => sample.components.find(component => component.componentId === 'FirstMinutes').values;
const values = sample => sample.components.find(component => component.componentId === 'TrainingSession').values;

function observe(label, expectedStep) {
  let sample;
  for (let attempt = 0; attempt < 8; attempt++) {
    sample = state();
    if (!expectedStep || values(sample).step === expectedStep) break;
  }
  if (expectedStep && values(sample).step !== expectedStep) throw new Error(`${label}: expected ${expectedStep}, got ${JSON.stringify(values(sample))}`);
  evidence.observations.push({ label, state: sample });
  console.log(JSON.stringify({ label, values: values(sample) }));
  return sample;
}

async function waitForWorld(previousGeneration, previousEpoch) {
  for (let attempt = 0; attempt < 35; attempt++) {
    const result = spawnSync(executable, ['dev', 'status'], { encoding: 'utf8' });
    const envelope = decode('dev', 'status', result);
    const app = envelope.state?.session?.browser?.clients?.find(client => client.role === 'app');
    const ready = envelope.state?.browserCommandReady ?? envelope.browserCommandReady;
    const fresh = previousGeneration === undefined || app?.tabGeneration > previousGeneration ||
      (previousEpoch !== undefined && app?.browserEpoch > previousEpoch);
    if (ready && fresh) {
      // The transport can reconnect before World.create finishes asset loading
      // and TrainingSystem initialization. Fence the actual application too.
      let sessions;
      try { sessions = run('ecs', 'find', { withComponents: ['TrainingSession'] }).entities; }
      catch (error) {
        // HMR can disconnect a previously ready generation. This read-only
        // fence may retry; no dispatched mutation is ever silently repeated.
        if (!String(error).includes('connection_lost') && !String(error).includes('Target disconnected')) throw error;
        await delay(1000); continue;
      }
      if (sessions.length > 1) throw new Error(`Expected one TrainingSession, found ${sessions.length}`);
      if (sessions.length === 1) { panels.clear(); sessionIndex = sessions[0].entityIndex; return; }
    }
    await delay(1000);
  }
  throw new Error('Managed application did not finish loading');
}

async function reloadWorld() {
  let before = run('xr', 'status');
  if (before.sessionActive) {
    run('xr', 'exit');
    for (let attempt = 0; attempt < 8; attempt++) {
      before = run('xr', 'status');
      if (!before.sessionActive) break;
      await delay(1000);
    }
    if (before.sessionActive) throw new Error('XR did not end before the fenced reload');
  }
  const generation = before.browser?.clients?.find(client => client.role === 'app')?.tabGeneration;
  const epoch = before.browser?.lifecycle?.browserEpoch;
  if (generation === undefined) throw new Error('Managed app generation unavailable; cannot fence browser reload readiness');
  run('browser', 'reload');
  await delay(1000);
  await waitForWorld(generation, epoch);
}

function waitForFrame() {
  for (let attempt = 0; attempt < 12; attempt++) if (values(state()).drawCalls > 0) return;
  throw new Error('No completed render frame to capture');
}

function screenshot(name, transient = false) {
  const path = `${destination}/${capturePrefix}-${name}.png`;
  const script = captureScript(name, transient);
  const result = decode('browser', 'run', spawnSync(executable, ['browser', 'run', script, '--timeout', '100000'], { encoding: 'utf8' }));
  assertImageDimensions(path);
  evidence.captures.push({ name, path, result });
  observe(`capture:${name}`);
  persistEvidence();
}

function assertImageDimensions(path) {
  const bytes = readFileSync(path);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 1280) throw new Error(`Evidence ${path} is actually ${width}x${height}; viewport metadata is not proof of image resolution`);
  return { width, height };
}

function captureScript(name, transient = false) {
  if (!/^[a-z][a-z-]*$/.test(name)) throw new Error('Invalid evidence screenshot name');
  const path = `${destination}/${capturePrefix}-${name}.png`;
  const script = `artifacts/${capturePrefix}-capture-${name}.mjs`;
  if (transient) {
    // Earlier stable captures prove the fixed canvas size and hide only DOM
    // chrome. Capture a short real gesture without re-reading that layout.
    writeFileSync(script, `import {writeFileSync} from 'node:fs';
      export default async function(session) {
        const image=await session.cdp.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false,optimizeForSpeed:true});
        writeFileSync(${JSON.stringify(path)},Buffer.from(image.data,'base64'));
        return {path:${JSON.stringify(path)},native:true,transient:true};
      }`);
    return script;
  }
  writeFileSync(script, `import sanitize from '../scripts/capture-round4.mjs';
    import {writeFileSync} from 'node:fs';
    export default async function (session) {
      const progress=stage=>writeFileSync('artifacts/${capturePrefix}-capture-${name}-stage.json',JSON.stringify({stage,at:Date.now()}));
      progress('presentation-before');
      const presentation=await sanitize({...session,captureProgress:progress});
      progress('presentation-after');
      const target=session.frame??session.page;
      // Preserve the owner's fixed native viewport and XR framebuffer. No resize
      // overrides, window RAF waits, or element screenshot stability waits.
      progress('bounds-before');
      const metrics=await target.evaluate(()=>{
        const canvases=[...document.querySelectorAll('canvas')];
        const rect=canvases[0]?.getBoundingClientRect();
        return {bounds:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,
          buffer:canvases.map(canvas=>({width:canvas.width,height:canvas.height,cssWidth:canvas.getBoundingClientRect().width,cssHeight:canvas.getBoundingClientRect().height}))};
      });
      const {bounds,buffer}=metrics;
      if(!bounds || bounds.width<1280 || buffer.some(canvas=>canvas.cssWidth>0 && canvas.width<1280)) {
        throw new Error('The actual rendered canvas is below1280px: '+JSON.stringify({bounds,buffer})+'. Restart the managed session with --ai-mode agent and the documented screenshot dimensions.');
      }
      progress('capture-before');
      // Capture the real native view. Chromium's XR surface capture stalls on
      // this software host; native-view capture needs no renderer/state changes.
      const image=await session.cdp.send('Page.captureScreenshot',{
        format:'png',fromSurface:false,captureBeyondViewport:false,optimizeForSpeed:true
      });
      writeFileSync(${JSON.stringify(path)},Buffer.from(image.data,'base64'));
      progress('captured');
      return {path:${JSON.stringify(path)},width:bounds.width,height:bounds.height,presentation,buffer};
    }\n`);
  return script;
}

async function captureAsync(name) {
  const script = captureScript(name);
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, ['browser', 'run', script, '--timeout', '100000']);
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', part => { stdout += part; });
    child.stderr.on('data', part => { stderr += part; });
    child.on('error', reject);
    child.on('close', status => {
      try { resolvePromise(decode('browser', 'run', { status, stdout, stderr })); }
      catch (error) { reject(error); }
    });
  });
}

async function enableStats() {
  const before = run('xr', 'status');
  if (before.sessionActive) throw new Error('Use the stats phase before entering XR; changing the app URL ends an immersive session');
  // Keep the real application visible while its async assets and custom systems
  // initialize; transport readiness alone does not imply a useful render frame.
  const shown = decode('browser', 'run', spawnSync(executable, ['browser', 'run', 'scripts/capture-round4.mjs', '--timeout', '100000'], { encoding: 'utf8' }));
  evidence.observations.push({ label: 'runtime-presentation', result: shown });
  const generation = before.browser.clients.find(client => client.role === 'app').tabGeneration;
  const epoch = before.browser.lifecycle.browserEpoch;
  const script = `artifacts/${capturePrefix}-stats-url.mjs`;
  writeFileSync(script, `export default async function ({page,frame}) {
    const target=frame??page;
    const url=new URL(target.url());
    url.searchParams.set('stats','1');
    const changed=url.href!==target.url();
    if(changed) await target.goto(url.href,{waitUntil:'domcontentloaded'});
    return {changed,url:target.url()};
  }\n`);
  const result = decode('browser', 'run', spawnSync(executable, ['browser', 'run', script, '--timeout', '45000'], { encoding: 'utf8' }));
  evidence.observations.push({ label: 'stats-url', result });
  if (result.changed) await waitForWorld(generation, epoch);
  else await waitForWorld();
  waitForFrame();
}

function seated() {
  pose('headset', 0, 1.45, .18, -24);
  pose('hand-left', -.34, .90, -.10); pose('hand-right', .34, .90, -.10);
}

function enterHands() {
  if (!run('xr', 'status').sessionActive) {
    run('xr', 'enter');
  }
  run('xr', 'set-input-mode', { mode: 'hand' }); seated();
}

async function hero() {
  const status = run('xr', 'status');
  if (status.sessionActive) run('xr', 'exit');
  await reloadWorld(); await enableStats();
  enterHands();
  pose('headset', 0, 1.45, .35, -20);
  aim('headset', 0, 1.12, -.50);
  pose('hand-left', -.38, 1.01, -.02);
  pose('hand-right', .38, 1.01, -.02);
  screenshot('hero');
}

function views() {
  enterHands(); screenshot('overview');
  board();
  tools(); seated();
}

function board() {
  pose('headset', 0, 1.20, -.03, -10); aim('headset', ...sceneTransform('distribution-board').position); screenshot('board'); seated();
}

function tools() {
  pose('hand-left', -.38, .90, .05); pose('hand-right', .38, .90, .05);
  pose('headset', -.035, 1.10, -.13, -62); aim('headset', -.035, .775, -.30); screenshot('tools'); seated();
}

function settings() {
  enterHands();
  clickButton('settings-toggle-panel', 'open-settings');
  pose('headset', .02, 1.45, .18, -24); screenshot('settings');
  settingsBudget();
}

function settingsBudget() {
  // Exercise the largest accessibility tray through its genuine hand control;
  // leave the standard arrangement restored for the captured procedure.
  if (!inspect('settings-panel', '#one-handed').text.includes('ON')) clickButton('settings-panel', 'one-handed');
  for (let frame = 0; frame < 3; frame++) observe(`settings-one-hand-fallback:${frame}`);
  if (inspect('settings-panel', '#one-handed').text.includes('ON')) clickButton('settings-panel', 'one-handed');
  clickButton('settings-panel', 'close-settings'); seated();
  persistEvidence();
}

function feedbackChecks() {
  enterHands();
  if (firstMinutes(state()).phase === 'returning-choice') clickButton('steps-panel', 'intro-primary');
  clickButton('steps-panel', 'explain-why');
  const why = inspect('captions-panel', '#caption');
  evidence.observations.push({ label: 'why-identify-circuit', element: why });
  console.log(JSON.stringify({label:'why-caption',element:why}));
  if (why.text !== 'Matching the schematic prevents isolating a different circuit.') throw new Error('Why did not explain the current identification step');
  clickButton('settings-toggle-panel', 'open-settings');
  const percent = () => Number(inspect('settings-panel', '#volume-up').text.match(/(\d+)%/)?.[1]);
  const before = percent();
  if (!Number.isFinite(before) || before < 10) throw new Error('Missing initial master volume');
  clickButton('settings-panel', 'volume-down');
  const down = percent();
  if (down !== before - 10) throw new Error('Master volume down did not change by ten percent');
  clickButton('settings-panel', 'volume-up');
  const restored = percent();
  if (restored !== before) throw new Error('Master volume did not restore');
  evidence.observations.push({ label: 'master-volume-hand-controls', before, down, restored });
  seated(); screenshot('settings'); settingsBudget();
}

function pokeUiCheck() {
  enterHands(); clickObject('breaker-sl-3'); observe('identify-before-ui-poke', 'notify-control');
  const { point, transform } = uiPoint('controls-panel', 'notify-control');
  const normal = rotate([0, 0, 1], transform.quaternion);
  const far = point.map((value, axis) => value + .08 * normal[axis]);
  pinch(0); pose('hand-right', ...far);
  const tip = values(state()).rightIndexTip;
  const wrist = far.map((value, axis) => value + far[axis] - tip[axis]);
  pose('hand-right', ...wrist);
  pose('hand-right', ...wrist.map((value, axis) => value - .095 * normal[axis]));
  const contact = inspect('controls-panel', '#notify-control');
  pose('hand-right', ...wrist);
  const advanced = observe('zero-select-ui-poke', 'switch-off');
  evidence.observations.push({ label: 'zero-select-ui-poke-calibration', point, normal, wrist, contact, state: advanced });
  persistEvidence();
}

function testerPhoto(rearGrip = true) {
  // Genuine tracked wrist motion retains the terminal contact. The rear grip
  // moves the glove away from the LCD; inspect the actual world-space tip below.
  if (rearGrip) {
    const wrist = [.274, .825, -.181];
    pose('hand-right', ...wrist, -10, 0, -25);
    const first = sceneTransform('voltage-tester');
    const probe = rotate([0, 0, -.10], first.quaternion);
    // A genuine wrist translation preserves the terminal contact while rolling
    // the rear grip. Never move the object directly or change training state.
    const terminal = [.232, .773, -.34]; // Preserved LineContact socket anchor.
    for (let axis = 0; axis < 3; axis++) wrist[axis] += terminal[axis] - first.position[axis] - probe[axis];
    pose('hand-right', ...wrist, -10, 0, -25);
  } else {
    pose('hand-right', .255, .7988819, -.2434074, -15, 0, 35);
    pose('headset', -.06, 1.20, -.08); aim('headset', .285, .805, -.18);
  }
  const transform = sceneTransform('voltage-tester');
  const offset = rotate([0, 0, -.10], transform.quaternion);
  const tip = offset.map((value, axis) => value + transform.position[axis]);
  evidence.observations.push({ label: 'actual-held-tester-transform', transform, tip });
  if (rearGrip) {
    const lcdOffset = rotate([0, .01901, .010], transform.quaternion);
    const lcd = lcdOffset.map((value, axis) => value + transform.position[axis]);
    pose('hand-left', -.38, .90, .05);
    // Show the LCD from the free side of the grip, with the complete current
    // step card above it and the more distant caption outside this detail view.
    pose('headset', .12, 1.10, -.02); aim('headset', .27, .91, -.35);
    evidence.observations.push({label:'actual-held-tester-lcd', lcd});
  }
  screenshot('tester');
}

async function procedure(captureIntermediate = true, captureFinal = true, pauseAtTester = false, rearGrip = captureIntermediate, resume = false, verifyTesterDemo = false) {
  if (!resume) { await reloadWorld(); await enableStats(); enterHands(); }
  if (firstMinutes(state()).phase === 'returning-choice') clickButton('steps-panel', 'intro-primary');
  if (resume && firstMinutes(state()).dailySeed === 1) clickButton('work-order-panel', 'check-schematic');
  clickObject('breaker-sl-3');
  if (firstMinutes(state()).phase === 'micro-offer') clickButton('steps-panel', 'intro-secondary'); observe('identify-circuit', 'notify-control');
  clickButton('controls-panel', 'notify-control'); observe('notify-control', 'switch-off');
  clickObject('breaker-sl-3'); observe('switch-off', 'apply-lock');
  const lock = sceneTransform('padlock').position, lockZone = sceneTransform('lock-zone').position;
  pose('hand-right', ...lock); pinch(1); move(...lockZone);
  pinch(0);
  observe('apply-lock', 'apply-tag');
  if (captureIntermediate) { pose('hand-right', .34, .90, -.10); pose('headset', .10, 1.45, .18); aim('headset', ...sceneTransform('distribution-board').position); screenshot('lockout'); }
  const tag = sceneTransform('danger-tag').position, tagZone = sceneTransform('tag-zone').position;
  pose('hand-right', ...tag); pinch(1); move(...tagZone); pinch(0); observe('attach-tag', 'prove-tester');
  if (verifyTesterDemo) {
    clickButton('steps-panel', 'repeat-demo');
    const replay = state();
    if (firstMinutes(replay).demo !== 'pinch-grab' || values(replay).step !== 'prove-tester') throw new Error('Tester Demo did not replay safe tool-grab gesture');
    evidence.observations.push({label:'safe-tester-grab-replay',state:replay});
  }
  const tester = sceneTransform('voltage-tester').position;
  const grip = rearGrip ? [0, .025, .067] : [0, 0, 0];
  pose('hand-right', ...tester.map((value, axis) => value + grip[axis])); pinch(1);
  if (verifyTesterDemo) {
    const grabbed = state();
    if (firstMinutes(grabbed).demo !== '') throw new Error('Successful tester grab did not skip the replay');
    evidence.observations.push({label:'tester-grab-skips-replay',state:grabbed});
  }
  move(.14, .786 + grip[1], -.24 + grip[2]); observe('prove-tester', 'test-dead');
  move(.232, .773 + grip[1], -.24 + grip[2]); observe('test-dead', 're-prove-tester');
  if (captureIntermediate || rearGrip) testerPhoto(rearGrip);
  if (pauseAtTester) {
    observe('tester-photo-awaiting-inspection', 're-prove-tester');
    // Deliberate capture-stage continuation: retain the real grabbed tool while
    // a human/image viewer checks it. Run procedure-photo-finish next.
    retainHeldInput = true;
    return;
  }
  await finishProcedure(captureIntermediate, captureFinal, false, rearGrip);
}

async function finishProcedure(captureIntermediate = true, captureFinal = true, pauseAtReady = false, rearGrip = false) {
  observe('resume-tester-contact', 're-prove-tester');
  pose('hand-right', .14, rearGrip ? .811 : .786, rearGrip ? -.173 : -.24); observe('re-prove-tester', 'safe-to-work'); pinch(0); seated();
  aimButton('controls-panel', 'safe-to-work', [-.24, 0, 0]); pinch(1);
  // HoldConfirm remains visibly READY until release, making this honest capture
  // robust even on a software renderer. No training state or UI is injected.
  await delay(950);
  let ready = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const label = inspect('controls-panel', '#hold-label');
    if (JSON.stringify(label).includes('Release to confirm')) { ready = true; break; }
  }
  if (!ready) throw new Error('Held Safe to work did not reach its deliberate confirmation threshold');
  if (captureIntermediate) {
    pose('headset', .08, 1.45, .18, -14);
    aim('headset', .08, 1.185, -.69);
    const path = `${destination}/${capturePrefix}-safe-hold.png`;
    const held = inspect('controls-panel', '#safe-to-work');
    const capture = await captureAsync('safe-hold');
    evidence.captures.push({ name: 'safe-hold', path, result: capture });
    assertImageDimensions(path);
    evidence.observations.push({ label: 'safe-to-work-held', element: held });
    persistEvidence();
  }
  if (pauseAtReady) { retainHeldInput = true; return; }
  await completeHeld(captureIntermediate, captureFinal);
}

async function completeHeld(captureIntermediate = true, captureFinal = true) {
  pinch(0);
  const completed = observe('safe-to-work');
  if (captureIntermediate) writeFileSync(`artifacts/${capturePrefix}-capture-trial-state.json`, JSON.stringify(completed, null, 2));
  persistEvidence();
  if (captureIntermediate && values(completed).complete && !values(completed).failed && values(completed).score < 80) {
    // Software-host screenshot waits can trigger idle hints. Preserve that
    // genuine trial, then perform a fresh real-hand attempt without those waits.
    evidence.observations.push({ label: 'repeat-after-capture-idle-hints', state: completed });
    await procedure(false, captureFinal);
    return;
  }
  if (!values(completed).complete || values(completed).failed || values(completed).score < 80) throw new Error(`Procedure did not pass: ${JSON.stringify(values(completed))}`);
  writeFileSync(`artifacts/${capturePrefix}-procedure-state.json`, JSON.stringify(completed, null, 2));
  if (!captureFinal) return;
  pose('hand-left', -.38, .90, -.02); pose('hand-right', .38, .90, -.02);
  pose('headset', 0, 1.45, .18, -24); aim('headset', ...sceneTransform('results-panel').position); screenshot('results');
}

function reset() {
  enterHands();
  clickButton('results-panel', 'try-again');
  const fresh = observe('reset', 'identify-circuit');
  if (values(fresh).complete || values(fresh).failed || values(fresh).score !== 100 || values(fresh).hints !== 0) throw new Error('Try again did not restore a fresh attempt');
  writeFileSync(`artifacts/${capturePrefix}-reset-state.json`, JSON.stringify(fresh, null, 2));
}

function releasePhotographicHold() {
  pinch(0);
  const completed = observe('photographic-hold-released');
  if (!values(completed).complete || values(completed).failed) throw new Error('Photographic real-hand procedure did not complete all critical checks');
  writeFileSync(`artifacts/${capturePrefix}-capture-trial-state.json`, JSON.stringify(completed, null, 2));
  persistEvidence();
}

function jobs() {
  enterHands();
  clickButton('results-panel', 'back-to-jobs');
  const start = inspect('jobs-panel', '#start-module');
  if (!start.state?.displayed || !start.state?.visible) throw new Error('Back to jobs did not show the training job');
  evidence.observations.push({ label: 'back-to-jobs', element: start });
  clickButton('jobs-panel', 'start-module');
  const fresh = observe('start-training-from-jobs', 'identify-circuit');
  if (values(fresh).complete || values(fresh).failed || values(fresh).score !== 100 || values(fresh).hints !== 0) throw new Error('Start training did not restore a fresh attempt');
  writeFileSync(`artifacts/${capturePrefix}-jobs-state.json`, JSON.stringify(fresh, null, 2));
}

async function clearFirstUse() {
  const script = `artifacts/${capturePrefix}-clear-first-use.mjs`;
  writeFileSync(script, `export default async function({page,frame}) { const target=frame??page; return await target.evaluate(()=>{const priorAttempts=localStorage.getItem('civicops.training.progress.v1');localStorage.removeItem('civicops.training.first-minutes.v1');localStorage.removeItem('civicops.training.progress.v1');return {fixture:'fresh synthetic user',priorAttempts}}); }`);
  decode('browser','run',spawnSync(executable,['browser','run',script,'--timeout','45000'],{encoding:'utf8'}));
  await reloadWorld(); await enableStats();
}

async function prepareFirstUse() {
  await clearFirstUse();
  run('xr','enter');
  run('xr','set-input-mode',{mode:'hand'});
  run('xr','set-connected',{device:'hand-left',connected:false});
  run('xr','set-connected',{device:'hand-right',connected:false});
  pose('headset',0,1.45,.18,-24);
}

async function firstScenes() {
  await prepareFirstUse();
  screenshot('raise-hands');
  pose('hand-right',.34,.90,-.10);
  run('xr','set-connected',{device:'hand-right',connected:true});
  screenshot('first-target');

}

async function timing() {
  await clearFirstUse();
  run('xr','enter');
  pose('headset',0,1.45,.18,-24);
  run('xr','set-input-mode',{mode:'hand'});
  pose('hand-right',.045,1.15,-.358);
  aim('hand-right',.045,1.15,-.618);
  run('xr','set-connected',{device:'hand-right',connected:true});
  pinch(1);
  const sample=observe('first-meaningful-action','notify-control'); pinch(0);
  const minutes=firstMinutes(sample);
  if(minutes.firstActionMs<0 || minutes.firstActionMs>=20000) throw new Error('First action exceeded 20 seconds: '+JSON.stringify(minutes));
  writeFileSync(`artifacts/${capturePrefix}-first-action-timing.json`,JSON.stringify(minutes,null,2));
}

async function timingPoke() {
  await clearFirstUse(); run('xr','enter'); pose('headset',0,1.45,.18,-24);
  run('xr','set-input-mode',{mode:'hand'}); pinch(0);
  // Actual emulated index poke, calibrated from the open neutral-pose joint
  // offset measured in this same rig. No ray pinch or scene state mutation.
  // Begin clear of the front rocker. The authored .023m pivot + .014m
  // ridge puts the touch surface at z=-.581m, rather than the case center.
  pose('hand-right',.078625,1.085786,-.456539);
  pose('hand-right',.078625,1.085786,-.546539);
  const sample=observe('first-meaningful-index-poke','notify-control');
  const minutes=firstMinutes(sample);
  const select=run('xr','get-select-value',{device:'hand-right'});
  evidence.observations.push({label:'zero-pinch-during-index-poke',select});
  if(minutes.firstActionMs<0 || minutes.firstActionMs>=20000) throw new Error('Index poke exceeded 20 seconds: '+JSON.stringify(minutes));
  writeFileSync(`artifacts/${capturePrefix}-first-poke-timing.json`,JSON.stringify({minutes,select},null,2));
  pose('hand-right',.34,.90,-.10);
}

async function micro() {
  if(firstMinutes(state()).phase!=='micro-offer') await timingPoke();
  enterHands();
  if(firstMinutes(state()).phase!=='micro-offer') throw new Error('Run timing before micro');
  clickButton('steps-panel','intro-primary');
  if(firstMinutes(state()).phase!=='micro-off') throw new Error('First-lock choice did not activate through real hand selection');
  clickObject('breaker-sl-3'); observe('micro-off','apply-lock');
  const lock=sceneTransform('padlock').position, zone=sceneTransform('lock-zone').position;
  pose('hand-right',...lock);pinch(1);move(...zone);pinch(0);observe('micro-lock','apply-tag');
  const tag=sceneTransform('danger-tag').position, tagZone=sceneTransform('tag-zone').position;
  pose('hand-right',...tag);pinch(1);move(...tagZone);pinch(0);
  const stamp=observe('first-lock-stamp');
  if(firstMinutes(stamp).phase!=='first-lock-stamp'||!firstMinutes(stamp).firstLock) throw new Error('Ordered drill did not earn stamp');
  seated(); screenshot('first-lock-stamp');
  writeFileSync(`artifacts/${capturePrefix}-first-lock-state.json`,JSON.stringify(stamp,null,2));
}

async function ghost() {
  await reloadWorld(); await enableStats(); enterHands();
  if(firstMinutes(state()).phase==='returning-choice') clickButton('steps-panel','intro-primary');
  clickObject('breaker-sl-3');
  if(firstMinutes(state()).phase==='micro-offer') clickButton('steps-panel','intro-secondary');
  clickButton('controls-panel','notify-control'); clickObject('breaker-sl-3');
  observe('ghost-step','apply-lock');
  seated();
  ghostRepeat();
}

function ghostRepeat() {
  // Give the front-tray demonstration space in a natural seated downward view.
  pose('headset',0,1.45,.30,-34);
  aimButton('steps-panel','repeat-demo');
  decode('browser','run',spawnSync(executable,['browser','run','scripts/capture-round4.mjs','--timeout','45000'],{encoding:'utf8'}));
  pinch(1);
  screenshot('ghost-demo', true); pinch(0);
}

function touchLiveTerminals() {
  // Touch the actual live LineContact using the emulated index fingertip. The
  // captured joint buffer calibrates one wrist translation; no scene state moves.
  pose('hand-right',.232,.85,-.30);
  const tip=values(state()).rightIndexTip;
  pose('hand-right',.232+(.232-tip[0]),.85+(.773-tip[1]),-.30+(-.34-tip[2]));
  const failed=observe('live-hand-contact');
  if(!values(failed).failed||!values(failed).complete) throw new Error('Actual hand contact did not stop the unsafe attempt');
  return failed;
}

async function unsafe() {
  await reloadWorld(); await enableStats(); enterHands();
  if(firstMinutes(state()).phase==='returning-choice') clickButton('steps-panel','intro-primary');
  const failed = touchLiveTerminals();
  seated(); screenshot('unsafe');
  writeFileSync(`artifacts/${capturePrefix}-unsafe-state.json`,JSON.stringify(failed,null,2));
}

// This supported browser-run entry point changes only DOM presentation for
// evidence images. It never reads or mutates the scene/application state.
export default async function hideEmulatorOverlay({ page, frame, captureProgress }) {
  // Agent mode opens the editor first. Use the genuine desktop Runtime control
  // so the application canvas is visible before reading or capturing its frame.
  captureProgress?.('runtime-view-before');
  const view = await page.evaluate(() => document.documentElement.dataset.iwsdkWorkspaceView);
  if (view && view !== 'runtime') {
    await page.locator('.workspace-view-switcher').evaluate(element => element.style.removeProperty('visibility'));
    await page.locator('[data-workspace-view-button="runtime"]').click({ force: true, noWaitAfter: true, timeout: 5000 });
  }
  captureProgress?.('runtime-view-after');
  const contexts = [page, frame].filter((target, index, all) => target && all.indexOf(target) === index);
  const results = [];
  for (const target of contexts) {
    captureProgress?.('dom-before');
    results.push(await target.evaluate(() => {
    const hidden = [];
    const candidates = [];
    const visit = root => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) visit(element.shadowRoot);
        const text = element.textContent?.trim();
        const marker = `${element.id} ${typeof element.className === 'string' ? element.className : ''}`;
        if (/Enter XR|Remote Control Active/i.test(text ?? '') && text.length < 300) {
          candidates.push({ tag: element.tagName, id: element.id, class: typeof element.className === 'string' ? element.className : '',
            text: text.slice(0, 180), parent: element.parentElement?.outerHTML.slice(0, 1500) });
        }
        if (/iwer.*(control|overlay|ui)|(?:control|overlay).*iwer/i.test(marker) ||
          (/^(?:Enter XR|[●\s]*Remote Control Active)$/i.test(text ?? '')) ||
          (/^(?:Runtime\s*Editor|Editor\s*Runtime)$/i.test(text ?? '') && !['BODY', 'HTML'].includes(element.tagName)
            && !element.querySelector('iframe,canvas') && element.getBoundingClientRect().width < 500) ||
          /^(?:stats|civicops-stats)$/i.test(element.id)) {
          element.style.setProperty('visibility', 'hidden', 'important');
          hidden.push({ tag: element.tagName, id: element.id, text: text?.slice(0, 80) });
        }
      }
    };
    visit(document);
    document.documentElement.dataset.civicopsCaptureChrome = 'hidden';
    const bounds = element => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, id: element.id, width: rect.width, height: rect.height, x: rect.x, y: rect.y,
        style: element.getAttribute('style'), src: element.getAttribute('src') };
    };
    return { hidden, candidates, width: innerWidth, height: innerHeight, url: location.href,
      surfaces: [...document.querySelectorAll('iframe,canvas')].map(bounds), body: bounds(document.body) };
    }));
    captureProgress?.('dom-after');
  }
  return results;
}

async function main() {
  mkdirSync(destination, { recursive: true }); mkdirSync('artifacts', { recursive: true });
  const phase = process.argv[2] ?? 'all';
  await waitForWorld();
  try {
    if (phase === 'first-scenes') await firstScenes();
    else if (phase === 'ghost') await ghost();
    else if (phase === 'ghost-repeat') ghostRepeat();
    else if (phase === 'timing') await timing();
    else if (phase === 'timing-poke') await timingPoke();
    else if (phase === 'micro') await micro();
    else if (phase === 'unsafe') await unsafe();
    else if (phase === 'returning') { await reloadWorld(); await enableStats(); enterHands(); const resumed = state(); if (firstMinutes(resumed).phase !== 'returning-choice' || !firstMinutes(resumed).firstLock) throw new Error('Reload did not restore returning choice and first-lock marker'); evidence.observations.push({label:'persisted-returning-choice',state:resumed}); screenshot('returning'); }
    else if (phase === 'daily') { enterHands(); clickButton('results-panel','daily-drill'); observe('daily-start', 'identify-circuit'); await procedure(false, true, false, false, true); const status = inspect('results-panel', '#daily-status'); if (!JSON.stringify(status).includes('COMPLETED')) throw new Error('Passing daily drill did not persist completion'); evidence.observations.push({label:'daily-completed',element:status}); }
    else if (phase === 'all') { await enableStats(); views(); settings(); await procedure(); reset(); await hero(); }
    else if (phase === 'hero') await hero();
    else if (phase === 'presentation') { await reloadWorld(); await enableStats(); views(); settings(); await hero(); }
    else if (phase === 'views') views();
    else if (phase === 'views-fresh') { await reloadWorld(); views(); }
    else if (phase === 'procedure') await procedure();
    else if (phase === 'procedure-photo') await procedure(true, false, true);
    else if (phase === 'procedure-tester-photo') await procedure(false, false, true, true);
    else if (phase === 'tester-reframe') { testerPhoto(true); retainHeldInput = true; }
    else if (phase === 'procedure-photo-finish') await finishProcedure(true, false, true, true);
    else if (phase === 'procedure-photo-finish-rear') await finishProcedure(false, false, true, true);
    else if (phase === 'safe-reframe') { pose('headset', .08, 1.45, .18); aim('headset', .08, 1.185, -.69); screenshot('safe-hold'); retainHeldInput = true; }
    else if (phase === 'release-photo-hold') releasePhotographicHold();
    else if (phase === 'jobs') jobs();
    else if (phase === 'jobs-after-stop') { enterHands(); touchLiveTerminals(); jobs(); }
    else if (phase === 'procedure-fast') await procedure(false);
    else if (phase === 'procedure-demo-verify') await procedure(false, true, false, false, false, true);
    else if (phase === 'procedure-verify') { await procedure(false, false); reset(); }
    else if (phase === 'settings') settings();
    else if (phase === 'settings-budget') { enterHands(); settingsBudget(); }
    else if (phase === 'feedback-checks') feedbackChecks();
    else if (phase === 'poke-ui-check') pokeUiCheck();
    else if (phase === 'poke-ui-fresh') { await reloadWorld(); await enableStats(); enterHands(); if (firstMinutes(state()).phase === 'returning-choice') clickButton('steps-panel','intro-primary'); pokeUiCheck(); }
    else if (phase === 'notify-ray-check') { await reloadWorld(); await enableStats(); enterHands(); if (firstMinutes(state()).phase === 'returning-choice') clickButton('steps-panel','intro-primary'); clickObject('breaker-sl-3'); observe('identify-before-notify-ray', 'notify-control'); clickButton('controls-panel','notify-control'); observe('notify-ray-release', 'switch-off'); }
    else if (phase === 'reset') reset();
    else if (phase === 'stats') await enableStats();
    else if (phase === 'enter') enterHands();
    else if (phase === 'tools') { enterHands(); tools(); }
    else if (phase === 'board') { enterHands(); board(); }
    else if (phase === 'details') { enterHands(); board(); tools(); }
    else throw new Error('Use all, presentation, hero, views, views-fresh, board, tools, details, procedure, procedure-fast, procedure-verify, procedure-photo, procedure-tester-photo, tester-reframe, procedure-photo-finish, procedure-photo-finish-rear, safe-reframe, release-photo-hold, jobs, settings, settings-budget, reset, stats or enter');
  } finally {
    writeFileSync(`artifacts/${capturePrefix}-${phase}-evidence.json`, JSON.stringify(evidence, null, 2));
    // Failures release real input. Only explicit successful photographic pauses
    // retain selection so the image can be inspected before the next action.
    if (!retainHeldInput) try { pinch(0); } catch { /* keep the original diagnostic */ }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

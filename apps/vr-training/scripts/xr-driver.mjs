// Read live ECS/UI state; change only the emulated headset and hands.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import {gripDestination} from './capture-round5b.mjs';
import { createHash } from 'node:crypto';
import { commandDeadline, executeCommand, managedAppReady } from './xr-command.mjs';

const cli = resolve('node_modules/.bin/iwsdk');
const scratch = resolve('artifacts/xr-e2e');
mkdirSync(scratch, { recursive: true });
export const screens = resolve(process.env.CIVICOPS_XR_SCREENS ?? ('artifacts/xr-e2e/screens'));
const capturePrefix = process.env.CIVICOPS_CAPTURE_PREFIX ?? 'vr10';
assert(/^vr\d+(?:-[a-z0-9]+)*$/.test(capturePrefix), 'Invalid capture prefix');
mkdirSync(screens, { recursive: true });
const sanitize = pathToFileURL(resolve('scripts/capture-round4.mjs')).href;
export const wait = ms => new Promise(done => setTimeout(done, ms));
export function command(args, retrySafe = false) {
  try { return executeCommand(() => {
    const started = Date.now();
    appendFileSync(`${scratch}/commands.jsonl`, JSON.stringify({ at: new Date().toISOString(), args }) + '\n');
    // Host suspends have exceeded ten minutes. Keep the SDK's acknowledgement
    // alive across those pauses; the suite still has the shared one-hour cap.
    const deadline = commandDeadline(args[0]);
    const result = spawnSync(cli, [...args, '--timeout', String(deadline)], { encoding: 'utf8', maxBuffer: 8 << 20, timeout: deadline + 10_000 });
    appendFileSync(`${scratch}/commands.jsonl`, JSON.stringify({ completedAt: new Date().toISOString(), command: args.slice(0, 2), durationMs: Date.now() - started, status: result.status, errorCode: result.error?.code }) + '\n');
    return result;
  }, { retrySafe, onRetry: attempt => console.warn(`Retry ${attempt}/2: timed-out observation ${args.slice(0, 2).join(' ')}`) }); }
  catch (error) { throw new Error(`iwsdk ${args.slice(0, 2).join(' ')}: ${error.message}`); }
}
const observations = new Set(['ecs:find', 'ecs:query', 'ui:inspect', 'scene:transform', 'xr:status', 'xr:get-transform', 'dev:status']);
export const run = (domain, action, input = {}) => command([domain, action, '--input-json', JSON.stringify(input)], observations.has(`${domain}:${action}`));
export function browser(source, retrySafe = false) {
  const path = `${scratch}/request-${createHash('sha256').update(source).digest('hex').slice(0, 16)}.mjs`;
  writeFileSync(path, source);
  if (process.env.CIVICOPS_EXTERNAL_CDP === '1') {
    return executeCommand(()=>{
      const started=Date.now();
      appendFileSync(`${scratch}/commands.jsonl`,JSON.stringify({at:new Date().toISOString(),cdpRequest:path,retrySafe})+'\n');
      const result=spawnSync(process.execPath,['scripts/managed-cdp-request.mjs',path],{encoding:'utf8',maxBuffer:8<<20,timeout:commandDeadline('browser')+10_000});
      appendFileSync(`${scratch}/commands.jsonl`,JSON.stringify({completedAt:new Date().toISOString(),cdpRequest:path,durationMs:Date.now()-started,status:result.status,errorCode:result.error?.code})+'\n');
      return result;
    },{retrySafe,onRetry:attempt=>console.warn(`Retry ${attempt}/2: timed-out browser observation`)});
  }
  return command(['browser', 'run', path], retrySafe);
}
export const read = expression => browser(`export default async function({page,frame}){return (frame??page).evaluate(()=>(${expression}))}`, true);
export const pose = (device, position, orientation = { pitch: 0, yaw: 0, roll: 0 }) => run('xr', 'set-transform', { device, position: vector(position), orientation });
export const vector = p => Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
export const pinch = value => run('xr', 'set-select-value', { device: 'hand-right', value });
export const aim = (device, point) => run('xr', 'look-at', { device, target: vector(point) });
export const move = (point, duration = .6, orientation) => run('xr', 'animate-to', { device: 'hand-right', position: vector(point), duration, ...(orientation ? { orientation } : {}) });
export const rotate = (p, q) => {
  const [x, y, z] = p; const [qx, qy, qz, qw] = Array.isArray(q) ? q : [q.x, q.y, q.z, q.w];
  const ix = qw*x + qy*z - qz*y, iy = qw*y + qz*x - qx*z, iz = qw*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
  return [ix*qw - iw*qx - iy*qz + iz*qy, iy*qw - iw*qy - iz*qx + ix*qz, iz*qw - iw*qz - ix*qy + iy*qx];
};
const multiply = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const identity = () => ({ position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] });
function compose(parent, child) {
  const offset = rotate(child.position.map((n, i) => n * parent.scale[i]), parent.quaternion);
  return { position: parent.position.map((n, i) => n + offset[i]), quaternion: multiply(parent.quaternion, child.quaternion), scale: parent.scale.map((n, i) => n * child.scale[i]) };
}
export function transform(nodeId) {
  if (authored.has(nodeId)) {
    const t = run('scene', 'transform', { nodeId });
    const g = t.globalTransform ?? t.worldTransform ?? t.global ?? t;
    const array = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
    return { position: array(t.positionRelativeToXROrigin ?? t.globalPosition ?? g.position), quaternion: t.globalQuaternion ?? g.quaternion ?? g.rotationQuaternion, scale: array(t.globalScale ?? g.scale ?? [1, 1, 1]) };
  }
  return runtimeTransform(entity(nodeId));
}
function runtimeTransform(index, depth = 0) {
  assert(depth < 20, 'Runtime transform hierarchy must be acyclic');
  const snapshot = query(index, ['Transform']);
  if (authored.has(snapshot.name)) return transform(snapshot.name);
  const t = snapshot.components.find(c => c.componentId === 'Transform')?.values;
  if (!t) return transform(sceneRoot);
  const local = { position: t.position, quaternion: t.orientation, scale: t.scale };
  return compose(t.parent?.entityIndex !== undefined ? runtimeTransform(t.parent.entityIndex, depth + 1) : transform(sceneRoot), local);
}
/** Read original glTF contact nodes without reaching into the application world. */
export function modelAnchor(root, file, name) {
  const bytes = readFileSync(`public/models/${file}`);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const index = json.nodes.findIndex(n => n.name === name);
  assert(index >= 0, `Missing model anchor ${name}`);
  const parents = new Map();
  json.nodes.forEach((n, i) => { for (const child of n.children ?? []) parents.set(child, i); });
  const chain = []; for (let i = index; i !== undefined; i = parents.get(i)) chain.unshift(json.nodes[i]);
  let local = identity();
  for (const node of chain) {
    assert(!node.matrix, 'Anchor reader expects exported TRS nodes');
    local = compose(local, { position: node.translation ?? [0,0,0], quaternion: node.rotation ?? [0,0,0,1], scale: node.scale ?? [1,1,1] });
  }
  return compose(transform(root), local).position;
}
const entityIds = new Map();
export function entity(name) {
  if (!name.startsWith('assist-') && entityIds.has(name)) return entityIds.get(name);
  const matches = run('ecs', 'find', { namePattern: `^${name}$`, limit: 10 }).entities;
  assert.equal(matches.length, 1, `Expected one ${name}`);
  if (!name.startsWith('assist-')) entityIds.set(name, matches[0].entityIndex);
  return matches[0].entityIndex;
}
export const query = (index, components) => run('ecs', 'query', { entityIndex: typeof index === 'string' ? entity(index) : index, ...(components ? {components} : {}) });
export const values = (name, component) => query(name, [component]).components.find(c => c.componentId === component)?.values;
export async function until(label, sample, predicate, limit = 12) {
  let value;
  for (let i = 0; i < limit; i++) {
    value = sample();
    if (predicate(value)) return value;
    await wait(250);
  }
  throw new Error(`${label}: ${JSON.stringify(value)}`);
}

let scene;
let sceneRoot;
const authored = new Set();
const panelIds = new Map();
// Locomotion can settle the rig onto the road after entry. Read its current
// origin through the identity field root instead of assuming the spawn offset.
export const fromWorld = point => {
  const root = transform(sceneRoot);
  return point.map((n, i) => n + root.position[i]);
};
export async function open(module, extra = '') {
  await until('managed application bridge', () => run('dev', 'status'), managedAppReady, 80);
  panelIds.clear(); entityIds.clear();
  const file = { 'elec-loto': 'main', 'water-burst': 'water', 'roads-zone': 'roads', 'scene-safety': 'fire', 'field-assist': 'ar', board: 'board' }[module];
  scene = JSON.parse(readFileSync(`public/scenes/${file}.iwsdk.scene.json`, 'utf8'));
  sceneRoot = { main: 'bench-rig', water: 'water-session', roads: 'roads-session', fire: 'fire-session', ar:'ar-session', board: 'department-board-panel' }[file];
  authored.clear();
  const visit = nodes => { for (const node of nodes) { authored.add(node.id); visit(node.children ?? []); } };
  visit(scene.nodes);
  browser(`import sanitize from ${JSON.stringify(sanitize)};export default sanitize;`);
  if (run('xr', 'status').sessionActive) run('xr', 'exit');
  const search = `?stats=1&quickstart=0&${module === 'field-assist' ? 'mode=assist' : `module=${module}`}${extra}`;
  browser(`export default async function({page,frame}){const t=frame??page;const u=new URL(t.url());u.search=${JSON.stringify(search)};await t.goto(u.href,{waitUntil:'domcontentloaded'});return true}`);
  browser(`import sanitize from ${JSON.stringify(sanitize)};export default sanitize;`);
  const loading = await until(`load ${module} or its required pre-shift`, () => read(`({module:window.civicOpsModule,error:window.civicOpsModuleError,fade:window.civicOpsFade,preparation:window.civicOpsPreparation})`), s => { if (s.error) throw new Error(`Module load failed: ${s.error}`); return s.module === module && s.fade < .05 || s.preparation?.moduleId === module; }, 60);
  const fieldScene = scene, fieldRoot = sceneRoot;
  if (loading.preparation) {
    scene = JSON.parse(readFileSync('public/scenes/board.iwsdk.scene.json', 'utf8')); sceneRoot = 'department-board-panel';
    authored.clear(); visit(scene.nodes);
  }
  run('xr', 'enter'); run('xr', 'set-input-mode', { mode: 'hand' });
  pose('headset', [0, 1.25, 0], { pitch: -10, yaw: 0, roll: 0 });
  pose('hand-left', [-.25, .95, -.1]); pose('hand-right', [.25, .95, -.1]);
  assert.equal(run('xr', 'status').sessionActive, true);
  if (loading.preparation) {
    // Read the same programme source for expected answers; only tracked-hand UI
    // clicks can advance preparation. No application state is written by the runner.
    const ts = await import('typescript');
    const javascript = ts.transpileModule(readFileSync('src/training/programmes.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const { TRAINING_PROGRAMMES } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
    capture(`${module}-pre-shift`);
    for (const [index, check] of TRAINING_PROGRAMMES[module].checks.entries()) {
      await click('department-board-panel', `programme-choice-${check.correct}`);
      await until(`pre-shift check ${index + 1}`, () => read('window.civicOpsPreparation'), s => s?.index === index + 1 && s.phase !== 'stopped');
    }
    await click('department-board-panel', 'programme-choice-0');
    await until(`enter ${module} after pre-shift`, () => read('({module:window.civicOpsModule,fade:window.civicOpsFade,error:window.civicOpsModuleError})'), s => { if (s.error) throw new Error(`Module load failed: ${s.error}`); return s.module === module && s.fade < .05; }, 60);
    scene = fieldScene; sceneRoot = fieldRoot; authored.clear(); visit(scene.nodes); panelIds.clear(); entityIds.clear();
    pose('headset', [0, 1.25, 0], { pitch: -10, yaw: 0, roll: 0 });
    pose('hand-left', [-.25, .95, -.1]); pose('hand-right', [.25, .95, -.1]);
  }
}

export function inspect(panel, selector) {
  if (!panelIds.has(panel)) panelIds.set(panel, entity(panel));
  return run('ui', 'inspect', { entityIndex: panelIds.get(panel), ...(selector ? { selector } : {}), limit: 50 }).elements;
}
function findNode(id, nodes = scene.nodes) {
  for (const node of nodes) { if (node.id === id) return node; const child = findNode(id, node.children ?? []); if (child) return child; }
}
function ancestors(panel, id) {
  const asset = findNode(panel)?.content.asset;
  const manifest = readFileSync('src/assets.ts', 'utf8');
  const ui = manifest.match(new RegExp(`['"]${asset}['"]\\s*:\\s*ui\\(\\s*['"]([^'"]+)['"]`))?.[1];
  assert(ui, `No UI source for ${panel}`);
  const markup = readFileSync(`public/ui/${ui}.uikitml`, 'utf8').replace(/<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
  const stack = [];
  for (const match of markup.matchAll(/<\/?([A-Za-z][\w.-]*)([^>]*)>/g)) {
    if (match[0].startsWith('</')) { stack.pop(); continue; }
    const elementId = match[2].match(/\bid\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const className = match[2].match(/\bclass\s*=\s*['"]([^'"]+)['"]/)?.[1]?.split(/\s+/)[0];
    const parent = stack.at(-1); const occurrence = className ? parent?.counts[className] ?? 0 : 0;
    if (className && parent) parent.counts[className] = occurrence + 1;
    const selector = elementId ? `#${elementId}` : className ? `${parent?.selector ? parent.selector + ' ' : ''}.${className}` : null;
    if (elementId === id) return [...stack.filter(s => !['html', 'body'].includes(s.tag)), { selector, occurrence }];
    if (!match[0].endsWith('/>') && !['img', 'br', 'hr', 'meta', 'link', 'input'].includes(match[1])) stack.push({ tag: match[1], selector, occurrence, counts: {} });
  }
  throw new Error(`Missing ${panel} #${id}`);
}
export function buttonPoint(panel, id) {
  const all = inspect(panel); let x = 0, y = 0;
  for (const { selector, occurrence } of ancestors(panel, id)) {
    assert(selector, `Unnamed ancestor of ${panel} #${id}`);
    const named = /^#[\w-]+$/.test(selector) ? all.find(e => e.id === selector.slice(1)) : undefined;
    const found = named ?? inspect(panel, selector)[occurrence];
    assert(found?.layout?.relativeCenter, `Missing layout for ${panel} ${selector}`);
    x += found.layout.relativeCenter[0]; y += found.layout.relativeCenter[1];
  }
  const t = transform(panel); const offset = rotate([x * .01 * t.scale[0], y * .01 * t.scale[1], 0], t.quaternion);
  return { point: t.position.map((n, i) => n + offset[i]), normal: rotate([0, 0, .42], t.quaternion) };
}
export async function click(panel, id, holdMs = 0) {
  const { point, normal } = buttonPoint(panel, id);
  pinch(0); pose('hand-right', point.map((n, i) => n + normal[i])); aim('hand-right', point);
  await until(`hover ${panel} #${id}`, () => inspect(panel, `#${id}`)[0], s => s?.state?.hovered);
  pinch(1);
  // UIKit's `active` flag is not a press acknowledgment. Keep real input held
  // across completed command/frame reads, then assert the application outcome.
  for (let frame = 0; frame < 3; frame++) inspect(panel, `#${id}`);
  if (holdMs) await wait(holdMs);
  pinch(0);
}
export async function selectObject(name, localOffset = [0, 0, 0], originOffset = [0, .35, 1.2]) {
  const t = transform(name); const offset = rotate(localOffset, t.quaternion); const p = t.position.map((n, i) => n + offset[i]);
  pinch(0); pose('hand-right', p.map((n, i) => n + originOffset[i])); aim('hand-right', p);
  await until(`hover ${name}`,()=>query(name),s=>s.components.some(c=>c.componentId==='Hovered'));
  try {
    pinch(1);
    await until(`press ${name}`,()=>query(name),s=>s.components.some(c=>c.componentId==='Pressed'));
    for(let frame=0;frame<3;frame++)query(name);
  } finally { pinch(0); }
  await until(`release ${name}`,()=>run('ecs','find',{namePattern:`^${name}$`,withComponents:['Pressed'],limit:5}).entities,s=>s.length===0);
}
export async function grab(name, offset = [0, 0, 0]) {
  const p = transform(name).position.map((n, i) => n + offset[i]);
  pinch(0); pose('hand-right', p); pinch(1);
  await until(`grab ${name}`, () => query(name), s => s.components.some(c => c.componentId === 'Grabbed'));
  return p;
}
export async function place(name, point, yaw = 0, offset = [0, 0, 0]) {
  const initial = transform(name); const forward = rotate([0, 0, 1], initial.quaternion);
  const initialYaw = Math.atan2(forward[0], forward[2]) * 180 / Math.PI;
  pinch(0); pose('hand-right', initial.position.map((n, i) => n + offset[i])); pinch(1);
  await until(`grab ${name}`, () => query(name), s => s.components.some(c => c.componentId === 'Grabbed'));
  move(point.map((n, i) => n + offset[i]), .7, { pitch: 0, yaw: yaw - initialYaw, roll: 0 });
  query(name); pinch(0);
  await until(`release ${name}`, () => query(name), s => !s.components.some(c => c.componentId === 'Grabbed'));
}
/** Align the measured XR grip, rather than the emulator's wrist, to a model grip.
 * This is tracked input only; the world is read to calibrate the hand transform.
 */
export async function placeAtGrip(name, file, point, yaw = 0) {
  const initial=transform(name),target=modelAnchor(name,file,'Grip');
  pinch(0);pose('hand-right',target);
  const measured=read('(()=>{const origin=window.FRAMEWORK_MCP_RUNTIME.world.input.xr.xrOrigin;const grip=origin.gripSpaces.right;return origin.worldToLocal(grip.getWorldPosition(grip.position.clone())).toArray();})()');
  assert(Array.isArray(measured)&&measured.length===3&&measured.every(Number.isFinite),'A real XR grip pose is required');
  const wrist=target.map((n,i)=>n-(measured[i]-target[i]));
  console.log('GRIP_CONTACT',JSON.stringify({name,target,measured,wrist}));
  pose('hand-right',wrist);pinch(1);
  const captured=await until(`grab ${name} at model Grip`,()=>run('ecs','find',{withComponents:['Grabbed'],limit:20}).entities,items=>items.length>0);
  if(!captured.some(e=>e.name===name)){
    pinch(0);throw new Error(`Expected ${name}; actual captured objects: ${JSON.stringify(captured)}; contact ${JSON.stringify({target,measured,wrist})}`);
  }
  assert(query(name).components.some(c=>c.componentId==='Grabbed'),'The intended prop must own the grab');
  const held=transform(name),offset=held.position.map((n,i)=>n-wrist[i]);
  const forward=rotate([0,0,1],initial.quaternion),initialYaw=Math.atan2(forward[0],forward[2]);
  const destination=gripDestination(point,offset,initialYaw,yaw*Math.PI/180);
  move(destination.position,.7,{pitch:0,yaw:destination.yaw,roll:0});
  assert(query(name).components.some(c=>c.componentId==='Grabbed'),'Keep the actual pinch through movement');
  pinch(0);await until(`release ${name}`,()=>query(name),s=>!s.components.some(c=>c.componentId==='Grabbed'));
  return {name,source:initial.position,target,measured,wrist,heldOffset:offset,destination};
}
export function capture(name) {
  const path = `${screens}/${capturePrefix}-${name}.png`;
  const stats = browser(`import sanitize from ${JSON.stringify(sanitize)};export default async function(s){await sanitize(s);return (s.frame??s.page).evaluate(()=>({...window.civicOpsStats,textures:window.civicOpsTextureAudit?.()}))}`, true);
  // Use the SDK's managed capture path rather than retaining a CDP screenshot
  // request inside a long-lived browser automation task.
  console.log('CAPTURE_STATS', name, JSON.stringify({drawCalls:stats.drawCalls,triangles:stats.triangles,fps:stats.fps}));
  if (process.env.CIVICOPS_CAPTURE_CDP === '1') {
    // Managed CDP capture avoids the SDK's 27s compositor deadline on SwiftShader.
    // The browser automation lease remains bounded to 100s; no app state changes.
    browser(`import {writeFileSync} from 'node:fs';export default async function(session){const shot=await session.cdp.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false,optimizeForSpeed:true});writeFileSync(${JSON.stringify(path)},Buffer.from(shot.data,'base64'));return {path:${JSON.stringify(path)}}}`, true);
  } else command(['browser', 'screenshot', '--input-json', '{}', '--output-file', path], true);
  assert(readFileSync(path).readUInt32BE(16) >= 1280, 'Capture width must be at least 1280px');
  return { path, stats };
}

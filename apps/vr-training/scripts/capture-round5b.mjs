// Round vr05b managed hand evidence. No simulation-state, placement or score injection.
// Usage: node scripts/capture-round5b.mjs overview|from-board|vehicle|warning|cones|layout|zone-check|run-traffic|finish
// Optional fault proof: fault-check -> repair (90 score), then fresh-good (real reset and rebuilt clean 100).
// Resume a target with: node scripts/capture-round5b.mjs part roads-barrier-3.
// cones-held preserves an actual pinch; cone-release lowers/releases it. Parent owns dev/session lifecycle.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const executable='./node_modules/.bin/iwsdk';
let phase=process.argv[2]??'overview';
const evidence={captures:[],observations:[]};
const panels=new Map();
let sessionEntityIndex;
let sessionKind=phase==='board'?'ModuleBoard':'RoadsSession';
let scene=JSON.parse(readFileSync('public/scenes/'+(phase==='board'?'board':'roads')+'.iwsdk.scene.json','utf8'));
const findNode=(id,nodes=scene.nodes)=>{for(const node of nodes??[]){if(node.id===id)return node;const found=node.children?findNode(id,node.children):undefined;if(found)return found;}};
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
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 50_000,
  }));
}

const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const pose = (device, x, y, z, pitch = 0, yaw = 0, roll = 0) => run('xr', 'set-transform', {
  device, position: { x, y, z }, orientation: { pitch, yaw, roll },
});
const aim = (device, x, y, z) => run('xr', 'look-at', { device, target: { x, y, z } });
const pinch = (value, device='hand-right') => run('xr', 'set-select-value', { device, value });
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

export function rotate(point, quaternion) {
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
    const parent=stack.at(-1);
    const occurrence=className?(parent?.classCounts[className]??0):0;
    if(className&&parent)parent.classCounts[className]=occurrence+1;
    const selector = id ? `#${id}` : className ? parent?.selector ? `${parent.selector} .${className}` : `.${className}` : null;
    if (id === elementId) {
      const ancestors = stack.filter(item => !['html', 'body'].includes(item.tag));
      if (ancestors.some(item => !item.selector)) throw new Error(`${nodeId} #${elementId} has an unnamed layout ancestor; add a stable ancestor ID`);
      return [...ancestors.map(item => ({selector:item.selector,occurrence:item.occurrence})), {selector:`#${elementId}`,occurrence:0}];
    }
    if (!match[0].endsWith('/>') && !['img', 'br', 'input', 'hr', 'meta', 'link'].includes(match[1])) stack.push({ tag: match[1], selector, occurrence, classCounts:{} });
  }
  throw new Error(`${nodeId} lacks #${elementId}`);
}

function uiPoint(nodeId, elementId) {
  let x = 0, y = 0;
  const selectors = ancestorSelectors(nodeId, elementId);
  const document = run('ui', 'inspect', { entityIndex: panelIndex(nodeId), limit: 50 });
  for (const {selector,occurrence} of selectors) {
    const named = selector.startsWith('#') ? document.elements.find(element => element.id === selector.slice(1)) : undefined;
    const matches=named?undefined:run('ui','inspect',{entityIndex:panelIndex(nodeId),selector,limit:50}).elements;
    const center = (named ?? matches?.[occurrence]).layout?.relativeCenter;
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) throw new Error(`${nodeId} ${selector}: no measured relativeCenter`);
    x += center[0]; y += center[1];
  }
  const transform = sceneTransform(nodeId);
  const offset = rotate([x * .01 * transform.scale[0], y * .01 * transform.scale[1], 0], transform.quaternion);
  const point = offset.map((value, axis) => value + transform.position[axis]);
  evidence.observations.push({ nodeId, elementId, selectors, point });
  return { point, transform };
}

function aimButton(nodeId, elementId, originOffset = [0, 0, 0], device='hand-right') {
  const { point, transform } = uiPoint(nodeId, elementId);
  // Keep the emulated index outside the SDK's 20cm touch-hover radius so this
  // intentional ray test cannot be pre-empted by a nearer touch pointer.
  const normal = rotate([0, 0, .42], transform.quaternion);
  pinch(0,device);
  pose(device, point[0] + normal[0] + originOffset[0], point[1] + normal[1] + originOffset[1], point[2] + normal[2] + originOffset[2]);
  aim(device, ...point);
  let settled = 0;
  for (let attempt = 0; attempt < 8 && settled < 2; attempt++) {
    settled = inspect(nodeId, `#${elementId}`).state?.hovered ? settled + 1 : 0;
  }
  if (settled < 2) throw new Error(`${nodeId} #${elementId}: tracked-hand ray did not settle; inspect live layout/state`);
  return point;
}

function clickButton(nodeId, elementId, device='hand-right') {
  aimButton(nodeId, elementId,[0,0,0],device);
  pinch(1,device);
  // Keep genuine selection held across several managed reads. The software
  // renderer can miss a shorter pulse between XR frames; no press is injected.
  for (let frame = 0; frame < 3; frame++) inspect(nodeId, `#${elementId}`);
  pinch(0,device);
}

// Calibrate the tracked index tip at a safe resting pose, then make a real
// near-touch press and withdraw while staying within the hover radius.
let indexTipOffset;
function pokeButton(nodeId,elementId){
 pinch(0);const resting=[.34,1.04,.07];pose('hand-right',...resting,0,0,0);
 if(!indexTipOffset){
  const actual=browserScript('index-tip-read',`export default async function({page,frame}){return (frame??page).evaluate(()=>{const origin=window.FRAMEWORK_MCP_RUNTIME.world.input.xr.xrOrigin;const tip=origin.indexTipSpaces.right;return origin.worldToLocal(tip.getWorldPosition(tip.position.clone())).toArray();});}`);
  indexTipOffset=actual.map((value,axis)=>value-resting[axis]);
 }
 const {point,transform}=uiPoint(nodeId,elementId);
 const normal=rotate([0,0,1],transform.quaternion);
 const wrist=distance=>point.map((value,axis)=>value+normal[axis]*distance-indexTipOffset[axis]);
 pose('hand-right',...wrist(.07),0,0,0);
 for(let frame=0;frame<3;frame++)inspect(nodeId,`#${elementId}`);
 move(...wrist(.009));for(let frame=0;frame<3;frame++)inspect(nodeId,`#${elementId}`);
 move(...wrist(.07));for(let frame=0;frame<3;frame++)inspect(nodeId,`#${elementId}`);
 evidence.observations.push({label:'tracked-index-poke',nodeId,elementId,point,normal,indexTipOffset});
}


function browserScript(name,source){const path=`artifacts/vr05b-${name}.mjs`;writeFileSync(path,source);return decode('browser','run',spawnSync(executable,['browser','run',path,'--timeout','45000'],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:50_000}));}
function states(){if(sessionEntityIndex===undefined){const pattern=sessionKind==='RoadsSession'?'^roads-session$':'^department-rig$';const entities=run('ecs','find',{namePattern:pattern}).entities.filter(entity=>entity.componentIds.includes(sessionKind));if(entities.length!==1)throw Error('Expected one live module: '+JSON.stringify(entities));sessionEntityIndex=entities[0].entityIndex;}return run('ecs','query',{entityIndex:sessionEntityIndex});}
function component(name){return states().components.find(x=>x.componentId===name)?.values;}
function observe(label){const state=states();evidence.observations.push({label,state});console.log(JSON.stringify({label,state}));writeFileSync(`artifacts/vr05b-${phase}-evidence.json`,JSON.stringify(evidence,null,2));return state;}
function capture(name){if(!run('xr','status').sessionActive)throw Error('Screenshot requires active immersive hand session');const path=`artifacts/screens/vr05b-${name}.png`;const result=browserScript('capture-'+name,`import sanitize from '../scripts/capture-round4.mjs';import {writeFileSync} from 'node:fs';export default async function(session){const target=session.frame??session.page;const size=await target.evaluate(()=>{const c=document.querySelector('canvas');return {width:c.width,height:c.height,cssWidth:c.getBoundingClientRect().width,chromeHidden:document.documentElement.dataset.civicopsCaptureChrome==='hidden'}});if(!size.chromeHidden)await sanitize(session);if(size.width<1280||size.cssWidth<1280)throw Error('Native canvas below1280px');const shot=await session.cdp.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false,optimizeForSpeed:true});writeFileSync(${JSON.stringify(path)},Buffer.from(shot.data,'base64'));return {path:${JSON.stringify(path)},size};}`);const image=readFileSync(path);if(image.readUInt32BE(16)<1280)throw Error('Capture resolution failed');evidence.captures.push({path,result});observe('capture:'+name);}
async function enter(module,workOrderType,seed){
 const status=run('xr','status');if(status.sessionActive)run('xr','exit');
 const query=(workOrderType ? '?stats=1&workOrderType='+encodeURIComponent(workOrderType) : '?stats=1&module='+module)+(seed===undefined?'':`&seed=${seed}`);
 browserScript('navigate',`export default async function({page,frame}){const target=frame??page;const u=new URL(target.url());u.search=${JSON.stringify(query)};await target.goto(u.toString(),{waitUntil:'domcontentloaded'});return {url:u.toString()};}`);
 panels.clear();sessionEntityIndex=undefined;
 for(let n=0;n<30;n++){try{const current=states();if(current.components.some(x=>x.componentId===sessionKind))break;}catch(error){if(n===29)throw error;}await delay(1000);}
 browserScript('presentation',`import sanitize from '../scripts/capture-round4.mjs';export default sanitize;`);
 run('xr','enter');run('xr','set-input-mode',{mode:'hand'});pose('headset',0,1.45,.18,module==='roads-zone'?-32:-24);
 pose('hand-left',-.34,1.04,.07);pose('hand-right',.34,1.04,.07);
 for(let n=0;n<3;n++)states();startBudget();
}
function startBudget(){return browserScript('start-budget',`export default async function({page,frame}){return (frame??page).evaluate(()=>{if(window.civicOpsVr05bBudget)return window.civicOpsVr05bBudget;const sample={peakDrawCalls:0,peakTriangles:0,peakTextureCount:0,peakGeometryCount:0,xrFrames:0};window.civicOpsVr05bBudget=sample;function measure(){const s=window.civicOpsStats;if(s?.xr){sample.peakDrawCalls=Math.max(sample.peakDrawCalls,s.drawCalls);sample.peakTriangles=Math.max(sample.peakTriangles,s.triangles);sample.peakTextureCount=Math.max(sample.peakTextureCount,s.textures);sample.peakGeometryCount=Math.max(sample.peakGeometryCount,s.geometries);sample.xrFrames++;}requestAnimationFrame(measure);}requestAnimationFrame(measure);return sample;});}`);}
function audit(label){const result=browserScript('audit-'+label,`export default async function({page,frame}){return (frame??page).evaluate(()=>({stats:window.civicOpsStats,budget:window.civicOpsVr05bBudget,textures:window.civicOpsTextureAudit?.(),attempts:JSON.parse(localStorage.getItem('civicops.training.progress.v1')??'[]').filter(a=>a.moduleId==='roads-zone').map(a=>({id:a.attemptId,moduleId:a.moduleId,score:a.score,passed:a.passed,criticalErrors:a.criticalErrors,steps:a.steps.map(s=>({id:s.stepId,outcome:s.outcome}))})),models:performance.getEntriesByType('resource').filter(r=>/\\.glb(?:\\?|$)/.test(r.name)).map(r=>({url:r.name,bytes:r.transferSize}))}));}`);evidence.observations.push({label,result});writeFileSync(`artifacts/vr05b-${phase}-evidence.json`,JSON.stringify(evidence,null,2));return result;}

const targets=new Map();
// Model-authored Grip heights put the pinch on the solid rail/sign/body surface.
const heights={cone:.38,delineator:.036,barrier:.039,vehicle:.90,warning:.54,'keep-left':.54,flagger:.50};
let nearGripOffset;
let retainHeldInput=false;
const heldFile='artifacts/vr05b-held-cone.json';
const normalize=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const yawOf=quaternion=>{
 const forward=rotate([0,0,1],quaternion);
 return Math.atan2(forward[0],forward[2]);
};

/** Mirror of the pure good-layout fixture, checked against it by unit tests. */
export function captureLayout(speedLimit=60,blindBend=false){
 if(speedLimit!==60&&speedLimit!==80)throw Error('Capture scenario must use 60 or 80 km/h');
 const start=speedLimit===80?-6.3:-4.5,gap=speedLimit===80?1.65:1.25;
 const range=blindBend?(speedLimit===80?[-8.2,-7.5]:[-7.8,-6.8]):speedLimit===80?[-7.4,-6.2]:[-6.2,-5.0];
 return {
  vehicle:{id:'vehicle',x:-10,z:4.95,yaw:0},beaconOn:true,
  warning:{id:'warning',x:range[0]+.2,z:4.65,yaw:-Math.PI/2},
  delineators:[],
  cones:Array.from({length:6},(_,index)=>({id:`cone-${index+1}`,x:start+index*gap,z:2.75-index*.47,yaw:0})),
  keepLeft:{id:'keep-left',x:start,z:4.65,yaw:-Math.PI/2},
  barriers:[...[8,10,12,14,16,18].map((x,index)=>({id:`barrier-${index+1}`,x,z:.35,yaw:0})),
   ...[8,10,12,14,16,18].map((x,index)=>({id:`barrier-${index+7}`,x,z:3.65,yaw:0})),
   {id:'barrier-13',x:7.9,z:.95,yaw:Math.PI/2},{id:'barrier-14',x:7.9,z:2.75,yaw:Math.PI/2},
   {id:'barrier-15',x:18.1,z:.95,yaw:Math.PI/2},{id:'barrier-16',x:18.1,z:2.75,yaw:Math.PI/2}],
  flaggers:[{id:'flagger-1',x:5.7,z:4.65,yaw:-Math.PI/2},{id:'flagger-2',x:22,z:4.65,yaw:Math.PI/2}],
 };
}

/** Compensate the measured held origin offset while turning the real tracked wrist. */
export function gripDestination(objectOrigin,heldOffset,initialObjectYaw,targetObjectYaw,initialHandYawDegrees=0){
 const delta=normalize(targetObjectYaw-initialObjectYaw);
 const quaternion=[0,Math.sin(delta/2),0,Math.cos(delta/2)];
 const rotated=rotate(heldOffset,quaternion);
 return {position:objectOrigin.map((value,axis)=>value-rotated[axis]),yaw:initialHandYawDegrees+delta*180/Math.PI};
}

function targetEntity(name){
 if(!targets.has(name)){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const found=run('ecs','find',{namePattern:`^${escaped}$`}).entities;
  if(found.length!==1)throw Error(`Expected one target ${name}, found ${found.length}`);
  targets.set(name,found[0].entityIndex);
 }
 return targets.get(name);
}
function targetState(name){return run('ecs','query',{entityIndex:targetEntity(name)});}
function grabbed(name){return targetState(name).components.some(item=>item.componentId==='Grabbed');}
function targetValues(name){return targetState(name).components.find(item=>item.componentId==='RoadsTarget')?.values;}
function clearSceneCaches(next){
 sessionKind=next;sessionEntityIndex=undefined;panels.clear();targets.clear();
 scene=JSON.parse(readFileSync(`public/scenes/${next==='ModuleBoard'?'board':'roads'}.iwsdk.scene.json`,'utf8'));
}
async function waitForSession(next){
 clearSceneCaches(next);
 for(let attempt=0;attempt<120;attempt++){
  try{if(component(next))return;}catch(error){if(attempt===119)throw error;}
  await delay(750);
 }
 throw Error(`${next} did not initialise within the managed wait`);
}
function roads(){const result=component('RoadsSession');if(!result)throw Error('Roads lesson is not live');return result;}
function fixture(){
 const current=roads();
 const bend=JSON.stringify(inspect('roads-controls-panel','#zone-status')).includes('BEND');
 return captureLayout(current.speedLimit,bend);
}
function definitionFor(name){
 const parts=fixture();
 if(name==='roads-bakkie')return parts.vehicle;
 if(name==='roads-warning')return parts.warning;
 if(name==='roads-keep-left')return parts.keepLeft;
 const number=Number(name.match(/-(\d+)$/)?.[1]);
 if(name.startsWith('roads-delineator-'))return {id:`delineator-${number}`,x:-.025+(number-1)*.075,z:.128,yaw:0};
 if(name.startsWith('roads-cone-'))return parts.cones[number-1];
 if(name.startsWith('roads-barrier-'))return parts.barriers[number-1];
 if(name.startsWith('roads-marshal-'))return parts.flaggers[number-1];
 throw Error(`No capture fixture for ${name}`);
}
function worldPoint(placement,lift=0){
 const root=sceneTransform('roads-session');
 const offset=rotate([placement.x*root.scale[0],(.025+lift)*root.scale[1],placement.z*root.scale[2]],root.quaternion);
 return offset.map((value,axis)=>value+root.position[axis]);
}
function assertOrigin(name,point,yaw){
 const actual=sceneTransform(name);
 const error=Math.max(...actual.position.map((value,axis)=>Math.abs(value-point[axis])));
 const yawError=Math.abs(normalize(yawOf(actual.quaternion)-yaw));
 evidence.observations.push({label:`origin:${name}`,expected:{point,yaw},actual,error,yawError});
 if(error>.008||yawError>.08)throw Error(`${name}: tracked grab origin differs by ${error.toFixed(4)}m / ${yawError.toFixed(3)}rad; inspect held pose before continuation`);
}
function grabTarget(name){
 pinch(0);
 const source=sceneTransform(name),values=targetValues(name);
 if(!values)throw Error(`${name} is not a Roads hand target`);
 const point=[source.position[0],source.position[1]+heights[values.kind],source.position[2]];
 pose('hand-right',...point,0,0,0);
 if(!nearGripOffset){
  const actual=browserScript('hand-grip-read',`export default async function({page,frame}){return (frame??page).evaluate(()=>{const origin=window.FRAMEWORK_MCP_RUNTIME.world.input.xr.xrOrigin;const grip=origin.gripSpaces.right;return origin.worldToLocal(grip.getWorldPosition(grip.position.clone())).toArray();});}`);
  nearGripOffset=actual.map((value,axis)=>value-point[axis]);
  evidence.observations.push({label:'measured-emulated-grip-offset',input:point,actual,offset:nearGripOffset});
 }
 const aligned=point.map((value,axis)=>value-nearGripOffset[axis]);
 pose('hand-right',...aligned,0,0,0);pinch(1);
 for(let attempt=0;attempt<8;attempt++){
  if(grabbed(name)){
   const held=sceneTransform(name);
   const heldOffset=held.position.map((value,axis)=>value-aligned[axis]);
   evidence.observations.push({label:`real-pinch:${name}`,source,hand:aligned,gripTarget:point,held,heldOffset,state:targetState(name)});
   return {heldOffset,initialObjectYaw:yawOf(held.quaternion)};
  }
 }
 pinch(0);throw Error(`${name} did not qualify Grabbed through tracked-hand pinch; no state was injected`);
}
function animateGrip(destination){
 return run('xr','animate-to',{device:'hand-right',position:{x:destination.position[0],y:destination.position[1],z:destination.position[2]},orientation:{pitch:0,yaw:destination.yaw,roll:0},duration:.5});
}
function placeTarget(name,placement=definitionFor(name),lift=0){
 const current=roads();if(current.complete||current.failed)throw Error('Reset the stopped/completed lesson before placing parts');
 const held=grabTarget(name);
 const origin=worldPoint(placement,lift);
 const destination=gripDestination(origin,held.heldOffset,held.initialObjectYaw,placement.yaw);
 animateGrip(destination);for(let frame=0;frame<3;frame++)states();
 if(!grabbed(name))throw Error(`${name} released before its tracked-hand movement completed`);
 assertOrigin(name,origin,placement.yaw);
 if(lift){
  writeFileSync(heldFile,JSON.stringify({name,placement,held,origin,destination,lift},null,2));
  retainHeldInput=true;observe(`holding:${name}`);return;
 }
 pinch(0);for(let frame=0;frame<3;frame++)states();assertOrigin(name,worldPoint(placement),placement.yaw);
 observe(`placed:${name}`);
 if(roads().failed)throw Error(`${name}: module stopped during placement`);
}
function releaseHeldCone(){
 const saved=JSON.parse(readFileSync(heldFile,'utf8'));
 if(saved.name!=='roads-cone-6'||!grabbed(saved.name))throw Error('Cone continuation requires the original real right-hand pinch');
 assertOrigin(saved.name,saved.origin,saved.placement.yaw);
 const origin=worldPoint(saved.placement);
 const destination=gripDestination(origin,saved.held.heldOffset,saved.held.initialObjectYaw,saved.placement.yaw,saved.held.initialHandYawDegrees??0);
 animateGrip(destination);for(let frame=0;frame<3;frame++)states();pinch(0);
 retainHeldInput=false;for(let frame=0;frame<3;frame++)states();assertOrigin(saved.name,origin,saved.placement.yaw);
 observe('released:last-cone');
}
function parkVehicle(){
 placeTarget('roads-bakkie');
 if(!/\bON\b/.test(inspect('roads-controls-panel','#beacon-status').text??''))clickButton('roads-controls-panel','beacon-toggle');
 observe('vehicle-upstream-beacon-on');
 if(roads().step==='park-vehicle')throw Error('Vehicle placement/beacon did not complete the first safety check');
}
function warning(){placeTarget('roads-warning');observe('advance-warning-facing-approach');}
function photographHeldCone(){
 const saved=JSON.parse(readFileSync(heldFile,'utf8'));
 if(saved.name!=='roads-cone-6'||!grabbed(saved.name))throw Error('Photograph requires the genuine selected cone');
 // Regrab at thumb/index contact through genuine input. The native 70 mm grab
 // radius reaches this contact-aligned grip; yaw 180 moves the palm away from
 // neighbouring cone5. Restore the same layout before picking the cone up.
 releaseHeldCone();
 browserScript('pinch-photo-pose',`export default async function({page,frame}){return (frame??page).evaluate(()=>{const hand=window.IWER_DEVICE.hands.right;hand.poseId='pinch';hand.updateHandPose();return {poseId:hand.poseId,pinchValue:hand.pinchValue};});}`);
 const initialHandYawDegrees=180,station=[.34,1.04,.07];
 pose('hand-right',...station,0,initialHandYawDegrees,0);
 for(let frame=0;frame<3;frame++)states();
 const contact=browserScript('pinch-photo-joints',`export default async function({page,frame}){
  return (frame??page).evaluate(async()=>{
   const world=window.FRAMEWORK_MCP_RUNTIME.world,manager=world.renderer.xr;
   const session=manager.getSession(),reference=manager.getReferenceSpace();
   const source=world.input.xr.visualAdapters.hand.right.inputSource;
   if(!session||!reference||!source?.hand)throw Error('Tracked right hand unavailable');
   return new Promise((resolve,reject)=>session.requestAnimationFrame((_,xrFrame)=>{
    try{
     const points=['thumb-tip','index-finger-tip'].map(name=>{
      const pose=xrFrame.getJointPose(source.hand.get(name),reference);
      if(!pose)throw Error('Tracked '+name+' unavailable');
      const p=pose.transform.position;return [p.x,p.y,p.z];
     });
     const midpoint=points[0].map((value,axis)=>(value+points[1][axis])/2);
     const gap=Math.hypot(...points[0].map((value,axis)=>value-points[1][axis]));
     resolve({points,midpoint,gap,poseId:window.IWER_DEVICE.hands.right.poseId,pinchValue:window.IWER_DEVICE.hands.right.pinchValue});
    }catch(error){reject(error);}
   }));
  });
 }`);
 if(contact.poseId!=='pinch'||contact.gap>=.008)throw Error('Built-in thumb/index pinch did not reach contact');
 const midpointOffset=contact.midpoint.map((value,axis)=>value-station[axis]);
 const source=sceneTransform(saved.name);
 const gripPoint=[source.position[0],source.position[1]+heights.cone,source.position[2]];
 const aligned=gripPoint.map((value,axis)=>value-midpointOffset[axis]);
 pose('hand-right',...aligned,0,initialHandYawDegrees,0);pinch(1);
 let selected=false;for(let frame=0;frame<8;frame++){if(grabbed(saved.name)){selected=true;break;}}
 if(!selected){pinch(0);throw Error('Contact-aligned cone6 pinch did not qualify Grabbed');}
 const actual=sceneTransform(saved.name);
 const held={heldOffset:actual.position.map((value,axis)=>value-aligned[axis]),initialObjectYaw:yawOf(actual.quaternion),initialHandYawDegrees};
 const origin=worldPoint(saved.placement,saved.lift);
 const destination=gripDestination(origin,held.heldOffset,held.initialObjectYaw,saved.placement.yaw,initialHandYawDegrees);
 animateGrip(destination);for(let frame=0;frame<3;frame++)states();
 if(!grabbed(saved.name))throw Error('Contact-aligned cone released before photograph');
 assertOrigin(saved.name,origin,saved.placement.yaw);
 writeFileSync(heldFile,JSON.stringify({...saved,held,origin,destination},null,2));retainHeldInput=true;
 evidence.observations.push({label:'contact-aligned-real-pinch',name:saved.name,contact,midpointOffset,hand:aligned,gripPoint,held});
 pinch(1);capture('placing-cones');
 if(!grabbed(saved.name))throw Error('Photograph lost its native hand grab');
 pinch(1);
 browserScript('restore-hand-pose',`export default async function({page,frame}){return (frame??page).evaluate(()=>{const hand=window.IWER_DEVICE.hands.right;hand.poseId='default';hand.updateHandPose();return {poseId:hand.poseId};});}`);
}
function cones(hold=false){
 for(let index=1;index<=5;index++)placeTarget(`roads-cone-${index}`);
 placeTarget('roads-cone-6',definitionFor('roads-cone-6'),.07);
 photographHeldCone();
 if(!hold)releaseHeldCone();
}
function barriers(){
 placeTarget('roads-keep-left');
 for(let index=1;index<=16;index++)placeTarget(`roads-barrier-${index}`);
 observe('excavation-enclosed-pedestrian-route-clear');
}
function flaggers(){
 for(let index=1;index<=2;index++)placeTarget(`roads-marshal-${index}`);
 pose('hand-right',.34,1.04,.07);capture('flaggers');
}
function checkGood(){
 pokeButton('roads-controls-panel','zone-check');const state=roads();observe('zone-check-good');
 if(!state.zoneGood||state.failed)throw Error(`Good hand layout did not pass the geometric audit: ${JSON.stringify(state)}`);
 pose('hand-right',.34,1.04,.07);capture('zone-check');
}
function checkFault(){
 const good=fixture(),bad={...good.cones[2],x:good.cones[1].x+.005};
 placeTarget('roads-cone-3',bad);clickButton('roads-controls-panel','zone-check');
 const state=roads();observe('zone-check-uneven-cones');
 if(state.zoneGood||state.failed||state.score!==90)throw Error(`Expected a repairable cone-spacing audit: ${JSON.stringify(state)}`);
 pose('hand-right',.34,1.04,.07);capture('zone-check-faulty');
}
function rulerProof(){
 const fresh=roads();if(fresh.complete||fresh.failed||fresh.placed!==0||fresh.score!==100)throw Error('Ruler proof requires a fresh lesson');
 placeTarget('roads-cone-1');pokeButton('roads-controls-panel','zone-check');
 const state=roads();observe('incomplete-layout-ruler-hint');
 if(state.zoneGood||state.failed||state.score!==90)throw Error('Expected a repairable incomplete-layout check');
 pose('hand-right',.34,1.04,.07);capture('ruler-hint');
}
async function board(load=true){
 if(load){clearSceneCaches('ModuleBoard');await enter('board');}
 for(const department of ['electricity','water','roads']){
  clickButton('department-board-panel',`tab-${department}`);
  const state=component('ModuleBoard'),button=inspect('department-board-panel','#open-module');
  evidence.observations.push({label:`unlocked:${department}`,state,button});
  if(state.status!=='ready'||!JSON.stringify(button).includes('Start '))throw Error(`${department} is not an unlocked training module`);
 }
 pose('headset',0,1.45,.18,-24);pose('hand-left',-.34,1.04,.07);pose('hand-right',.34,1.04,.07);
 capture('board');audit('three-unlocked-board');
}
async function overview(fromBoard=false,loaded=false){
 if(fromBoard){
  await board();clickButton('department-board-panel','open-module');await waitForSession('RoadsSession');
 }else if(!loaded){clearSceneCaches('RoadsSession');await enter('roads-zone','ROADS.POTHOLE_REPAIR');}
 else clearSceneCaches('RoadsSession');
 pose('headset',0,1.45,.18,-32);pose('hand-left',-.34,1.04,.07);pose('hand-right',.34,1.04,.07);
 if(roads().step!=='park-vehicle'||roads().placed!==0||roads().score!==100)throw Error('Overview requires a fresh Roads hand lesson');
 startBudget();capture('diorama-overview');audit('roads-overview');
}
async function runTraffic(fault=false){
 const before=roads();
 if(!fault&&(!before.zoneGood||before.score!==100))throw Error('The clean traffic run requires a checked 100-point layout');
 pokeButton('roads-controls-panel','run-traffic');observe(fault?'unsafe-traffic-started':'traffic-started');
 const current=roads();
 if(!current.running||!current.complete||current.failed!==fault)throw Error(`Traffic demonstration did not start: ${JSON.stringify(current)}`);
 const reactions=new Set();
 for(let sample=0;sample<14;sample++){
  const state=roads();reactions.add(state.trafficReaction);
  if(fault?['hard-brake','cone-contact'].includes(state.trafficReaction):state.trafficReaction==='merge')break;
  await delay(350);
 }
 evidence.observations.push({label:fault?'bad-layout-vehicle-response':'good-layout-vehicle-response',reactions:[...reactions]});
 pose('hand-right',.34,1.04,.07);capture(fault?'run-traffic-faulty':'run-traffic');audit(fault?'fault-traffic-budget':'good-traffic-budget');
}
function assertPassingResults(){
 const current=roads();
 if(!current.complete||current.failed||current.score!==100)throw Error(`Expected a full 100-point Roads pass: ${JSON.stringify(current)}`);
 const title=inspect('roads-results-panel','#result-title');
 const critical=inspect('roads-results-panel','#result-critical');
 const errors=inspect('roads-results-panel','#result-errors');
 const hints=inspect('roads-results-panel','#result-hints');
 const contains=(element,text)=>JSON.stringify(element).includes(text);
 if(!contains(title,'PASS')||!contains(critical,'5 / 5'))throw Error('Shared results must show PASS and all five critical checks');
 // Text is read from the measured UIKit element, not reconstructed from score.
 const text=element=>element.text??element.properties?.text??element.computedProperties?.text??element.props?.text;
 if(text(errors)!=='0'||text(hints)!=='0')throw Error('Shared result error/hint fields must both be zero: '+JSON.stringify({errors,hints}));
 evidence.observations.push({label:'roads-pass-100-five-critical',current,title,critical,errors,hints});
 observe('full-pass-100');
}
async function finish(){
 if(!roads().running)throw Error('Finish continuation requires a real running traffic demonstration');
 await delay(1_000);clickButton('roads-controls-panel','traffic-finish');
 assertPassingResults();pose('hand-right',.32,1.03,.09);pose('headset',0,1.45,.18,-12);
 capture('results');audit('road-results-budget');
}
async function returnBoard(fromSteps=false){
 audit('before-leaving-roads');clickButton(fromSteps?'roads-steps-panel':'roads-results-panel','back-to-jobs');await waitForSession('ModuleBoard');
 if(run('ecs','find',{namePattern:'^roads-session$'}).entities.length)throw Error('Roads module retained after leaving');
 if(run('ecs','find',{withComponents:['Grabbed']}).entities.length)throw Error('Held object retained after leaving Roads');
 await board(false);audit('after-leaving-roads');
}
async function shortTaperProof(){
 if(roads().complete)clickButton('roads-results-panel','try-again');
 if(roads().score!==100||roads().placed!==0)throw Error('Short-taper proof requires a fresh real attempt');
 parkVehicle();warning();for(let index=1;index<=3;index++)placeTarget(`roads-cone-${index}`);
 // Hold a fourth cone through the native emulator gesture, then release into
 // an intentionally incomplete taper. Pose changes affect the input device only.
 placeTarget('roads-cone-6',{...fixture().cones[3],id:'cone-6'},.07);
 photographHeldCone();
 releaseHeldCone();
 clickButton('roads-controls-panel','zone-check');observe('short-taper-audit');
 if(roads().zoneGood||roads().score!==90||roads().failed)throw Error('Expected repairable short-taper audit');
 pose('hand-right',.34,1.04,.07);capture('zone-check-faulty');await runTraffic(true);
}
async function bendOverview(){
 clearSceneCaches('ModuleBoard');await enter('board',undefined,3);
 clickButton('department-board-panel','tab-roads');clickButton('department-board-panel','open-module');await waitForSession('RoadsSession');
 pose('headset',0,1.45,.18,-32);pose('hand-left',-.34,1.04,.07);pose('hand-right',.34,1.04,.07);
 if(roads().speedLimit!==80||!JSON.stringify(inspect('roads-controls-panel','#zone-status')).includes('BEND'))throw Error('Expected the80km/h bend variant');
 startBudget();capture('daily-bend');audit('roads-bend-budget');
}
function freshGood(){
 clickButton('roads-controls-panel','reset');if(roads().score!==100||roads().placed!==0)throw Error('Real reset did not begin a clean attempt');
 parkVehicle();warning();cones();barriers();flaggers();checkGood();
}

async function main(){
 mkdirSync('artifacts',{recursive:true});mkdirSync('artifacts/screens',{recursive:true});
 try{
  if(phase==='board')await board();
  else if(phase==='overview')await overview();
  else if(phase==='from-board')await overview(true);
  else if(phase==='loaded')await overview(false,true);
  else if(phase==='vehicle')parkVehicle();
  else if(phase==='warning')warning();
  else if(phase==='cones'||phase==='cones-held')cones(phase==='cones-held');
  else if(phase==='cone-release')releaseHeldCone();
  else if(phase==='barriers')barriers();
  else if(phase==='flaggers')flaggers();
  else if(phase==='layout'){barriers();flaggers();}
  else if(phase==='part')placeTarget(process.argv[3]);
  else if(phase==='zone-check')checkGood();
  else if(phase==='fault-check')checkFault();
  else if(phase==='ruler-proof')rulerProof();
  else if(phase==='repair'){placeTarget('roads-cone-3');checkGood();}
  else if(phase==='fresh-good')freshGood();
  else if(phase==='reset'){clickButton('roads-controls-panel','reset');if(roads().score!==100||roads().placed!==0)throw Error('Real reset did not begin a clean attempt');audit('after-reset');}
  else if(phase==='run-traffic')await runTraffic();
  else if(phase==='fault-traffic')await runTraffic(true);
  else if(phase==='finish')await finish();
  else if(phase==='results'){assertPassingResults();capture('results');audit('road-results-budget');}
  else if(phase==='return-board')await returnBoard();
  else if(phase==='short-taper')await shortTaperProof();
  else if(phase==='fault-exit')await returnBoard(true);
  else if(phase==='bend-overview')await bendOverview();
  else if(phase==='audit')audit('resumed-budget');
  else if(phase==='all'){
   await overview(true);parkVehicle();warning();cones();barriers();flaggers();
   checkFault();placeTarget('roads-cone-3');checkGood();freshGood();
   await runTraffic();await finish();await returnBoard();
  }
  else throw Error('Unknown phase '+phase);
 }finally{
  writeFileSync(`artifacts/vr05b-${phase}-evidence.json`,JSON.stringify(evidence,null,2));
  if(!retainHeldInput)try{pinch(0);}catch{/* preserve the original diagnostic */}
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

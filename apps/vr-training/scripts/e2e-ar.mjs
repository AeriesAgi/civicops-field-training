// Native IWER room and anchors; all placement uses the actual emulated hand path.
import assert from 'node:assert/strict';
import {roomRayOrigin} from './room-ray-origin.mjs';
import {appendFileSync} from 'node:fs';
import {open,read,browser,run,pose,pinch,wait,until,transform,aim,capture,query} from './xr-driver.mjs';
const status=()=>read('window.civicOpsRoom');
async function action(name){
 let previous;
 const p=await until(`steady ${name}`,()=>read(`window.civicOpsWhere(["assist-${name}"])[0][1]`),v=>{if(!Array.isArray(v))return false;const stable=previous&&Math.hypot(...v.map((n,i)=>n-previous[i]))<.003;previous=v;return stable;},30);
 const t=transform(`assist-${name}`);assert(Math.hypot(...p.map((n,i)=>n-t.position[i]))<.02,'Rendered and ECS interaction poses must agree');
 const headset=run('xr','get-transform',{device:'headset'}),head=headset.position??headset.transform?.position;
 pinch(0);pose('hand-right',roomRayOrigin(head));aim('hand-right',p);
 await until(`hover ${name}`,()=>query(`assist-${name}`),s=>s.components.some(c=>c.componentId==='Hovered'));
 // Follow/return move or hide their own control on press. Observe the actual
 // room response rather than a transient pointer tag on the former target.
 try{pinch(1);const pressed=run('ecs','find',{withComponents:['FieldAssistTarget','Pressed'],limit:30}).entities.map(e=>e.name);appendFileSync('artifacts/xr-e2e/ar-input.jsonl',JSON.stringify({action:name,pressed,status:status()})+'\n');await until(`room action ${name}`,status,s=>name==='room-pin'?s.phase==='placing':!s.pinned);}
 finally{pinch(0);}
 await until(`release ${name}`,()=>run('ecs','find',{withComponents:['FieldAssistTarget','Pressed'],limit:30}).entities,s=>s.length===0);
}
async function openRoom(){await open('field-assist','&captureRoom=1');run('xr','set-connected',{device:'hand-left',connected:false});}
export async function roomAR(){
 const captures=[];
 await openRoom();
 await until('synthetic meeting room planes',status,s=>s?.planes>0,90);
 const native=run('xr','status');assert(JSON.stringify(native).includes('immersive-ar'),'The session must be immersive-ar');
 if(status().pinned){await action('room-follow');await until('fresh placement state',status,s=>!s.pinned);}
 captures.push(capture('ar-room-before'));
 await action('room-pin');await until('placement armed',status,s=>s.phase==='placing');await wait(450);pinch(0);pose('hand-right',[0,.08,-.8]);pinch(1);
 await until('plane-snapped persistent board',status,s=>s?.pinned&&s.persistent&&s.phase==='anchored'&&s.surface==='floor',90);pinch(0);
 assert.equal(status().surface,'floor');captures.push(capture('ar-room-anchored'));
 const before=read('JSON.parse(localStorage.getItem("civicops.room.anchor.v1"))');assert.deepEqual(Object.keys(before).sort(),['handle','version']);
 await openRoom();
 await until('persistent board after reload',status,s=>s?.pinned&&s.phase==='restored'&&s.persistent,90);captures.push(capture('ar-room-restored'));
 assert.equal(read('JSON.parse(localStorage.getItem("civicops.room.anchor.v1")).handle'),before.handle);
 // Re-pin in the same restored room, not just in a clean initial fixture.
 await action('room-follow');await until('restored room unpinned',status,s=>!s.pinned);
 await action('room-pin');await wait(450);pose('hand-right',[0,.08,-.8]);pinch(1);
 await until('re-pinned restored room',status,s=>s.pinned&&s.persistent&&s.phase==='anchored',90);pinch(0);
 run('xr','look-at',{device:'headset',target:{x:0,y:1.25,z:2}});
 await until('visible FoV return card',()=>read('window.civicOpsWhere(["assist-room-return"])[0][2]'),v=>v===true);
 await action('room-return');await until('unpin for manual fallback',status,s=>!s.pinned);
 // Start a fresh room session for the independent missing-plane fixture.
 await openRoom();
 // The supported IWER SEM API removes synthetic room surfaces. No app procedure is changed.
 run('xr','look-at',{device:'headset',target:{x:0,y:1.1,z:-.8}});
 browser('export default async function({page,frame}){return (frame??page).evaluate(()=>window.IWER_DEVICE.sem.deleteAll())}');await until('plane-free room',status,s=>s.planes===0);
 await action('room-pin');await until('manual placement armed',status,s=>s.phase==='placing');await wait(450);pose('hand-right',[.1,1.1,-.8]);pinch(1);await until('manual hand placement',status,s=>s.pinned&&s.surface==='manual');pinch(0);captures.push(capture('ar-room-manual'));
 return {captures,module:'ar-room',fovReturn:true,oneHanded:true,nativeSession:true,planes:true,persistentReload:true,repeatedPin:true,manualFallback:true};
}
if(process.argv[1]?.endsWith('/e2e-ar.mjs')){console.log(JSON.stringify(await roomAR()));}

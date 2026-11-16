/** Only opaque platform anchor handles persist. Never store room scans, poses or media. */
export const ROOM_ANCHOR_KEY='civicops.room.anchor.v1';
export interface AnchorSession {restorePersistentAnchor?(handle:string):Promise<XRAnchor>;}
export interface PersistentAnchor extends XRAnchor {requestPersistentHandle?():Promise<string>;}
export function readRoomHandle(storage:Pick<Storage,'getItem'>|undefined):string|undefined {
  try{const v:unknown=JSON.parse(storage?.getItem(ROOM_ANCHOR_KEY)??'null');if(v&&typeof v==='object'&&Object.keys(v).length===2&&'version'in v&&v.version===1&&'handle'in v&&typeof v.handle==='string'&&v.handle.length>0&&v.handle.length<=256)return v.handle;}catch{}return undefined;
}
export async function persistRoomAnchor(anchor:PersistentAnchor,storage:Pick<Storage,'setItem'>):Promise<boolean>{
  if(!anchor.requestPersistentHandle)return false;
  try{const handle=await anchor.requestPersistentHandle();if(!handle||handle.length>256)return false;storage.setItem(ROOM_ANCHOR_KEY,JSON.stringify({version:1,handle}));return true;}catch{return false;}
}
export async function restoreRoomAnchor(session:AnchorSession,storage:Pick<Storage,'getItem'>|undefined):Promise<XRAnchor|undefined>{
  const handle=readRoomHandle(storage);if(!handle||!session.restorePersistentAnchor)return undefined;
  try{return await session.restorePersistentAnchor(handle);}catch{return undefined;}
}
export type RoomSurface='floor'|'table'|'wall'|'manual';
export function roomSurface(orientation:string|undefined,height:number,semanticLabel?:string):RoomSurface {
  if(semanticLabel==='floor'||semanticLabel==='table'||semanticLabel==='wall')return semanticLabel;
  return orientation==='vertical'?'wall':orientation==='horizontal'?(height<.3?'floor':'table'):'manual';
}
/** Bound the point to the plane polygon's 2D envelope, including unknown room sizes. */
export function insidePlane(x:number,z:number,polygon:readonly {x:number;z:number}[],margin=.08):boolean {
  if(polygon.length<3||!Number.isFinite(x)||!Number.isFinite(z))return false;
  // Winding-independent point in polygon, with a small inset envelope at the edges.
  let inside=false,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {const a=polygon[i],b=polygon[j];minX=Math.min(minX,a.x);maxX=Math.max(maxX,a.x);minZ=Math.min(minZ,a.z);maxZ=Math.max(maxZ,a.z);if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}
  return inside&&x>=minX+margin&&x<=maxX-margin&&z>=minZ+margin&&z<=maxZ-margin;
}

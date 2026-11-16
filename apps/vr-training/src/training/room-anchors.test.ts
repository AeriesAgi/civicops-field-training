import {describe,it,expect} from 'vitest';
import {configureRoomEntry} from '../ar-entry';
import {insidePlane,persistRoomAnchor,readRoomHandle,restoreRoomAnchor,roomSurface,ROOM_ANCHOR_KEY,type PersistentAnchor} from './room-anchors';
import type {WorldOptions} from '@iwsdk/core';
const store=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},data};};
describe('native room session policy',()=>{
 it('requests AR, optional plane detection and anchors, with room locomotion disabled',()=>{const options:WorldOptions={xr:{},features:{locomotion:true},level:'/scenes/board.iwsdk.scene.json'};expect(configureRoomEntry(options,'?mode=assist')).toBe(true);expect(options.xr).toMatchObject({sessionMode:'immersive-ar',features:{handTracking:true,planeDetection:true,anchors:true}});expect(options.level).toBe('/scenes/board.iwsdk.scene.json');expect(options.features?.locomotion).toBe(false);});
 it('preserves VR configuration on every field route',()=>{const options:WorldOptions={xr:{sessionMode:'immersive-vr' as never},features:{locomotion:true}};expect(configureRoomEntry(options,'?module=roads-zone')).toBe(false);expect(options.features?.locomotion).toBe(true);});
});
describe('untested room surfaces and privacy',()=>{
 it('keeps room placement available when the browser storage property is denied',async()=>{
  let restored=false;
  expect(readRoomHandle(undefined)).toBeUndefined();
  expect(await restoreRoomAnchor({restorePersistentAnchor:async()=>{restored=true;return {} as XRAnchor;}},undefined)).toBeUndefined();
  expect(restored).toBe(false);
 });
 it('accepts interior floor points and rejects edges, concave cutouts and invalid polygons',()=>{const p=[{x:-2,z:-2},{x:2,z:-2},{x:2,z:0},{x:0,z:0},{x:0,z:2},{x:-2,z:2}];expect(insidePlane(-1,1,p)).toBe(true);expect(insidePlane(1,1,p)).toBe(false);expect(insidePlane(1.99,-1,p)).toBe(false);expect(insidePlane(NaN,0,p)).toBe(false);expect(insidePlane(0,0,[])).toBe(false);});
 it('distinguishes a real floor, elevated table, wall and missing planes',()=>{expect(roomSurface('horizontal',0)).toBe('floor');expect(roomSurface('horizontal',.74)).toBe('table');expect(roomSurface('vertical',1)).toBe('wall');expect(roomSurface(undefined,0)).toBe('manual');expect(roomSurface('horizontal',.22,'table')).toBe('table');expect(roomSurface('horizontal',.5,'floor')).toBe('floor');});
 it('persists and restores only the opaque native anchor handle',async()=>{const s=store(),anchor={requestPersistentHandle:async()=>'room-native-handle'} as PersistentAnchor;expect(await persistRoomAnchor(anchor,s)).toBe(true);expect(JSON.parse(s.getItem(ROOM_ANCHOR_KEY)!)).toEqual({version:1,handle:'room-native-handle'});expect(await restoreRoomAnchor({restorePersistentAnchor:async h=>{expect(h).toBe('room-native-handle');return anchor;}},s)).toBe(anchor);});
 it('survives unsupported anchors, revoked handles and unavailable storage',async()=>{const s=store();expect(await persistRoomAnchor({} as PersistentAnchor,s)).toBe(false);s.setItem(ROOM_ANCHOR_KEY,JSON.stringify({version:1,handle:'revoked'}));expect(await restoreRoomAnchor({restorePersistentAnchor:async()=>{throw Error('revoked');}},s)).toBeUndefined();expect(await restoreRoomAnchor({},s)).toBeUndefined();expect(await persistRoomAnchor({requestPersistentHandle:async()=>'valid'} as PersistentAnchor,{setItem:()=>{throw Error('quota');}})).toBe(false);});
 it('rejects corrupted handles and additional spatial or media fields',()=>{const s=store();for(const v of ['bad',JSON.stringify({version:1,handle:'x',roomScan:[]}),JSON.stringify({version:1,handle:''})]){s.setItem(ROOM_ANCHOR_KEY,v);expect(readRoomHandle(s)).toBeUndefined();}});
});

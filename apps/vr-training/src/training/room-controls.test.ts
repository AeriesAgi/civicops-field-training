import {describe,it,expect} from 'vitest';
import {ROOM_CONTROLS,useEmulatorRoom} from './room-controls';
describe('room capture and interaction layout',()=>{
 it('never replaces native passthrough, even with a copied capture URL',()=>{
  expect(useEmulatorRoom('?mode=assist&captureRoom=1',false)).toBe(false);
  expect(useEmulatorRoom('?mode=assist',true)).toBe(false);
  expect(useEmulatorRoom('?module=roads-zone&captureRoom=1',true)).toBe(false);
  expect(useEmulatorRoom('?mode=assist&captureRoom=1',true)).toBe(true);
 });
 it('keeps every room button clear of Jobs, Options and adjacent room actions',()=>{
  const existing=[{x:.335,y:-.165,w:.12,h:.05},{x:.335,y:-.22,w:.12,h:.04}];
  const room=ROOM_CONTROLS.map(b=>({...b,h:.05}));
  for(let i=0;i<room.length;i++)for(const b of [...existing,...room.slice(i+1)]){
   const a=room[i];
   expect(Math.abs(a.x-b.x)>=(a.w+b.w)/2+.01||Math.abs(a.y-b.y)>=(a.h+b.h)/2+.01).toBe(true);
  }
 });
});

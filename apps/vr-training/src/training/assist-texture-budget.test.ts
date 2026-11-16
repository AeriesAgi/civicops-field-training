import {describe,it,expect} from 'vitest';
import {assistCanvasSize,assistCanvasBytes,ASSIST_DECORATION_DENSITY} from './assist-texture-budget';
describe('AR decorative texture budget',()=>{
 it('keeps the entire no-text warning vignette below 64kB including mips',()=>{
  const frame=assistCanvasSize(1.3,.85,ASSIST_DECORATION_DENSITY);expect(frame).toEqual({width:125,height:82});
  expect(assistCanvasBytes(frame.width,frame.height)).toBeLessThan(65536);
  const old=assistCanvasSize(1.3,.85);expect(assistCanvasBytes(old.width,old.height)).toBeGreaterThan(22_000_000);
 });
 it('retains the current text resolution and caps large text cards',()=>{
  expect(assistCanvasSize(.44,.27)).toEqual({width:1056,height:648});
  expect(assistCanvasSize(3,3)).toEqual({width:2048,height:2048});
 });
 it('rejects broken dimensions instead of allocating an invalid canvas',()=>{
  for(const v of [0,-1,NaN,Infinity])expect(()=>assistCanvasSize(v,.2)).toThrow();
 });
});

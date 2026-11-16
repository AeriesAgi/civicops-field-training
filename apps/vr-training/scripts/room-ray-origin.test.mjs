import {describe,it,expect} from 'vitest';
import {roomRayOrigin} from './room-ray-origin.mjs';
describe('seated room ray input',()=>{
  it('stays in reach and outside nearby room-button poke volumes',()=>{
    for(const head of [{x:0,y:1.25,z:0},{x:4,y:1.6,z:-3}]){
      const p=roomRayOrigin(head);
      expect(Math.hypot(p[0]-head.x,p[1]-head.y,p[2]-head.z)).toBeLessThan(.6);
    }
    const p=roomRayOrigin({x:0,y:1.25,z:0});
    expect(roomRayOrigin([0,1.25,0])).toEqual(p);
    for(const button of [[-.13,.84,-.72],[.13,.8,-.81],[-.13,.81,-.72]])expect(Math.hypot(...p.map((n,i)=>n-button[i]))).toBeGreaterThan(.6);
  });
  it('rejects a missing pose instead of aiming from invalid coordinates',()=>{
    expect(()=>roomRayOrigin({x:NaN,y:1.25,z:0})).toThrow('headset pose');
    expect(()=>roomRayOrigin(undefined)).toThrow('headset pose');
  });
});

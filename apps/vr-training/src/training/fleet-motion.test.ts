import {describe,expect,it} from 'vitest';
import {advanceWheelAngle,fleetDetail} from './fleet-motion.js';
describe('route-driven taxi wheels and detail distance',()=>{
  it('stops the wheels with the vehicle and supports reverse travel',()=>{
    expect(advanceWheelAngle(.7,0,.34)).toBe(.7);
    expect(advanceWheelAngle(0,.34,.34)).toBeCloseTo(1);
    expect(advanceWheelAngle(1,-.34,.34)).toBeCloseTo(0);
    expect(advanceWheelAngle(1,NaN,.34)).toBe(1);
    expect(advanceWheelAngle(1,1,0)).toBe(1);
  });
  it('keeps near detail until 20m and returns to it inside 16m',()=>{
    expect(fleetDetail(18,true)).toBe(true);expect(fleetDetail(18,false)).toBe(false);
    expect(fleetDetail(15,false)).toBe(true);expect(fleetDetail(21,true)).toBe(false);
  });
});

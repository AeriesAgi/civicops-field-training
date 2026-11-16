import { describe,expect,it } from 'vitest';
import { assistNavigationTarget,assistNavigationPressed } from './assist-navigation-ack.mjs';
describe('native Assist navigation acknowledgment',()=>{
  it('accepts a retained pressed source or its exact replacement screen',()=>{
    for(const [action,target]of [['open-crew','assist-answer-yes'],['open-log','assist-export-log'],['picker','assist-open-crew']]){
      expect(assistNavigationTarget(action)).toBe(target);
      expect(assistNavigationPressed(action,[`assist-${action}`],[])).toBe(true);
      expect(assistNavigationPressed(action,[],[target])).toBe(true);
      expect(assistNavigationPressed(action,[],['assist-room-pin'])).toBe(false);
    }
  });
  it('never substitutes navigation evidence for a safety choice, hold or SOS',()=>{
    for(const action of ['answer-yes','answer-not-sure','recheck','gate-hold','sos','jobs','unknown','constructor','toString','__proto__']){
      expect(assistNavigationTarget(action)).toBeUndefined();
      expect(assistNavigationPressed(action,[`assist-${action}`],['assist-answer-yes','assist-export-log','assist-open-crew'])).toBe(false);
    }
  });
});

import {describe,it,expect} from 'vitest';
import {ChoiceReleaseQueue} from './choice-release';
describe('deliberate hand confirmation across changing choices',()=>{
 it('retains a held target and installs only the latest choices after actual release',()=>{
  const q=new ChoiceReleaseQueue<string>();expect(q.request(['yes','no'],false)).toEqual(['yes','no']);
  expect(q.request(['hold'],true)).toBeUndefined();expect(q.request(['next-step'],true)).toBeUndefined();
  expect(q.release(true)).toBeUndefined();expect(q.release(false)).toEqual(['next-step']);expect(q.release(false)).toBeUndefined();
 });
 it('does not resurrect old choices after a newer unpressed screen renders',()=>{
  const q=new ChoiceReleaseQueue<string>();q.request(['hold'],true);expect(q.request(['options'],false)).toEqual(['options']);expect(q.release(false)).toBeUndefined();
 });
 it('drops deferred UI when the guide retires',()=>{
  const q=new ChoiceReleaseQueue<string>();q.request(['next'],true);q.clear();expect(q.release(false)).toBeUndefined();
 });
});

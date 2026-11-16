import {describe,it,expect} from 'vitest';
import {createRoadsScenario,roadsZoneModule,roadsAssessmentModule} from './modules/roads-zone';
import {performRoads,startRoads,type RoadsEvent} from './roads-procedure';
import {createGoodRoadsLayout} from './roads-geometry';
import {buildAttempt,passed} from './scoring';
import {samplePotholeIncident,incidentRoadHeight,validTapeSpan,type IncidentPose} from './roads-incident';
import {TapePhysics} from './tape-physics';
import {roadsWeather} from './roads-weather';
const initial=()=>startRoads(createRoadsScenario(0,['rain-incident']));
function protectedSite(){let s=initial();const l=createGoodRoadsLayout(s.scenario);const events:RoadsEvent[]=['incident:refuge','incident:radio',{type:'place',kind:'vehicle',placement:l.vehicle!},{type:'beacon',on:true},{type:'place',kind:'warning',placement:l.warning!},...l.cones.map(placement=>({type:'place',kind:'cone',placement} as RoadsEvent)),{type:'place',kind:'keep-left',placement:l.keepLeft!},...l.barriers.map(placement=>({type:'place',kind:'barrier',placement} as RoadsEvent)),...l.flaggers.map(placement=>({type:'place',kind:'flagger',placement} as RoadsEvent)),'zone-check'];for(const e of events)s=performRoads(s,e,s.lastEventAtMs+1000);return s;}
describe('rain-hidden pothole response',()=>{
 it('requires refuge and radio before placement and stops an exposed worker',()=>{
  const l=createGoodRoadsLayout();for(const s of [initial(),performRoads(initial(),'incident:refuge')])expect(performRoads(s,{type:'place',kind:'warning',placement:l.warning!}).failed).toBe(true);
  expect(performRoads(initial(),'incident:enter-lane').criticalErrors[0]).toContain('near miss');
 });
 it('holds traffic until protection, real tape, motorist, job card and repair scheduling are complete',()=>{
  let s=protectedSite();expect(s.rainPhase).toBe('tape');expect(performRoads(s,'run-traffic').completed).toBe(false);
  expect(performRoads(s,'incident:assist').rainPhase).toBe('tape');
  for(const event of ['incident:tape','incident:assist','incident:record','incident:schedule','run-traffic'] as RoadsEvent[])s=performRoads(s,event,s.lastEventAtMs+1000);
  expect(s.rainPhase).toBe('ready');expect(s.failed).toBe(false);expect(passed(s,roadsZoneModule)).toBe(true);
  const a=buildAttempt(s,{startedAt:'2026-10-19T10:00:00Z',completedAt:'2026-10-19T10:10:00Z'},roadsZoneModule);
  expect(a.steps.filter(x=>x.stepId.startsWith('incident-')&&x.outcome==='correct')).toHaveLength(6);
 });
 it('cannot award a rain pass when any incident decision is missing, and versions the complete assessment',()=>{
  let s=protectedSite();for(const e of ['incident:tape','incident:assist','incident:record','incident:schedule','run-traffic'] as RoadsEvent[])s=performRoads(s,e,s.lastEventAtMs+1000);
  const module=roadsAssessmentModule(s.scenario);expect(module.version).toBe(3);expect(module.steps).toHaveLength(13);
  for(const id of ['incident-refuge','incident-radio','incident-tape','incident-assist','incident-record','incident-schedule']){
   expect(passed({...s,steps:s.steps.filter(step=>step.stepId!==id)},roadsZoneModule)).toBe(false);
  }
  expect(buildAttempt(s,{startedAt:'2026-10-19T10:00:00Z',completedAt:'2026-10-19T10:10:00Z'},roadsZoneModule).moduleVersion).toBe(3);
  expect(roadsAssessmentModule(createRoadsScenario()).steps).toHaveLength(7);
 });
 it('invalidates protection on a moved barrier and refuses a stale tape gate',()=>{
  const s=protectedSite();const moved=performRoads(s,{type:'remove',kind:'barrier',id:s.layout.barriers[0].id});
  expect(moved.zoneChecked).toBe(false);expect(performRoads(moved,'incident:tape').rainPhase).toBe('traffic');
 });
 it('keeps critical failure evidence and resets to the first refuge check',()=>{const failed=performRoads(protectedSite(),'incident:enter-lane');expect(failed.completed).toBe(true);expect(passed(failed,roadsZoneModule)).toBe(false);expect(performRoads(failed,'reset').rainPhase).toBe('refuge');});
 it('limps out of the live lane after a non-graphic strike with hazards on',()=>{const out:IncidentPose={x:0,z:0,yaw:0,roll:0,hazards:false,stage:'approach'};samplePotholeIncident(4.2,out);expect(out.stage).toBe('strike');expect(out.roll).toBeGreaterThan(0);samplePotholeIncident(14,out);expect(out).toMatchObject({x:34,z:4.95,hazards:true,stage:'shoulder'});});
 it('accepts only protected-side spans with reachable segments',()=>{expect(validTapeSpan(8,3.65,10,3.65)).toBe(true);for(const span of [[8,3.65,8.1,3.65],[8,3.65,14,3.65],[8,3.65,10,0],[8,3.65,NaN,3.65]])expect(validTapeSpan(...span as [number,number,number,number])).toBe(false);});
 it('keeps the damaged vehicle on the authored road and raised shoulder',()=>{expect(incidentRoadHeight(1.65)).toBeCloseTo(.07);expect(incidentRoadHeight(4.5)).toBeCloseTo(.42);expect(incidentRoadHeight(3.75)).toBeGreaterThan(.07);expect(incidentRoadHeight(3.75)).toBeLessThan(.42);});
 it('defaults to storm and supports clear and drizzle preferences',()=>{expect(roadsWeather('')).toBe('storm');expect(roadsWeather('?weather=clear')).toBe('clear');expect(roadsWeather('?weather=drizzle')).toBe('drizzle');});
});
describe('wind-driven anchored hazard ribbon',()=>{
 it('sags while retaining both endpoints through a long frame and 600 rain/wind frames',()=>{const t=new TapePhysics();t.setEnds(0,1,0,2,1,0,true);t.update(5,1);for(let i=0;i<600;i++)t.update(1/72,Math.sin(i*.03));expect([...t.points].every(Number.isFinite)).toBe(true);expect([...t.points.slice(0,3)]).toEqual([0,1,0]);expect([...t.points.slice(-3)]).toEqual([2,1,0]);expect(t.points[31]).toBeLessThan(1);expect(Math.min(...t.points)).toBeGreaterThan(-.5);});
});

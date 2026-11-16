import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import ts from 'typescript';
import { ROADS_SAFETY_NOTICE, ROADS_SCALE_NOTICE } from './modules/roads-zone';
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const responsibleAi=()=>readFileSync(new URL('../../../../docs/RESPONSIBLE_AI.md',import.meta.url),'utf8');
describe('Roads situational safety boundary',()=>{
 it('exposes only object placement, with no identity, biometric, risk or media payload',()=>{
  const file=ts.createSourceFile('roads-geometry.ts',source('./roads-geometry.ts'),ts.ScriptTarget.Latest,true);
  const declaration=file.statements.find(node=>ts.isInterfaceDeclaration(node)&&node.name.text==='RoadsPlacement') as ts.InterfaceDeclaration;
  expect(declaration.members.map(member=>member.name?.getText(file)).sort()).toEqual(['id','x','yaw','z']);
 });
 it('does not acquire camera, microphone, recording or location data',()=>{
  const runtimeFiles=['../roads-training-system.ts','./roads-geometry.ts','./roads-procedure.ts','./roads-traffic.ts','./modules/roads-zone.ts'];
  const runtime=runtimeFiles.map(source).join('\n');
  for(const forbidden of ['getUserMedia','getDisplayMedia','MediaRecorder','watchPosition','getCurrentPosition','faceDetector','faceRecognition','personIdentity','threatScore','criminalityScore','plateToPerson','passthroughFrame','latitude','longitude'])expect(runtime).not.toContain(forbidden);
 });
 it('makes human authority and schematic distance limits explicit',()=>{
  expect(ROADS_SAFETY_NOTICE).toContain("employer's SOPs");expect(ROADS_SAFETY_NOTICE).toContain('authorised person decides');
  expect(ROADS_SCALE_NOTICE).toContain('Full-scale');
 });
 it('keeps the AR preview and Roads module aligned with the repository ethics contract',()=>{
  const docs=responsibleAi().replace(/\s+/g,' ');
  for(const phrase of ['object kinds and situational hazard codes only','records no video, audio or passthrough frames','Roads checks only object geometry','human decision']) expect(docs).toContain(phrase);
  expect(docs).toContain('does not implement camera sensing, object detection, geolocation, location sharing or media capture');
 });
});

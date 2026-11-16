import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { SCENE_SAFETY_NOTICE, SCENE_SCALE_NOTICE } from './modules/scene-safety';
import { HANDOVER_FIELDS } from './scene-safety-geometry';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const responsibleAi = () => readFileSync(new URL('../../../../docs/RESPONSIBLE_AI.md', import.meta.url), 'utf8');

describe('Fire and EMS scene-safety ethics boundary', () => {
  it('keeps handover and placement free of identity, biometric and media fields', () => {
    const file = ts.createSourceFile('scene-safety-geometry.ts', source('./scene-safety-geometry.ts'), ts.ScriptTarget.Latest, true);
    const names = (wanted: string) => {
      const declaration = file.statements.find((node) => ts.isInterfaceDeclaration(node) && node.name.text === wanted) as ts.InterfaceDeclaration;
      return declaration.members.map((member) => member.name?.getText(file)).sort();
    };
    expect(names('FirePlacement')).toEqual(['id', 'x', 'yaw', 'z']);
    expect(names('SceneHandover')).toEqual(['cableStatus', 'categories', 'hazards', 'schema', 'unitsNeeded']);
    expect([...HANDOVER_FIELDS].sort()).toEqual(['cableStatus', 'categories', 'hazards', 'schema', 'unitsNeeded']);
  });

  it('does not acquire camera, microphone, recording, location or person-risk data', () => {
    const runtime = [
      '../scene-safety-training-system.ts', '../scene-safety-components.ts',
      './scene-safety-geometry.ts', './scene-safety-procedure.ts', './modules/scene-safety.ts',
    ].map(source).join('\n');
    for (const forbidden of ['getUserMedia', 'getDisplayMedia', 'MediaRecorder', 'watchPosition', 'getCurrentPosition', 'faceDetector', 'faceRecognition', 'personIdentity', 'threatScore', 'criminalityScore', 'plateToPerson', 'passthroughFrame', 'latitude', 'longitude', 'suspicious']) {
      expect(runtime).not.toContain(forbidden);
    }
    expect(runtime).not.toContain('photo');
    expect(runtime).not.toContain('biometric');
  });

  it('states human authority, illustrative care limits and full-scale training distance', () => {
    expect(SCENE_SAFETY_NOTICE).toContain("employer's SOPs");
    expect(SCENE_SAFETY_NOTICE).toContain('authorised person decides');
    expect(SCENE_SAFETY_NOTICE).toContain('does not replace emergency services');
    expect(SCENE_SCALE_NOTICE).toContain('Full-scale');
  });

  it('documents mannequin casualties, no recording and the live-line handoff', () => {
    const docs = responsibleAi().replace(/\s+/g, ' ');
    expect(docs).toContain('numbered vests');
    expect(docs).toContain('no video, audio or passthrough frames');
    expect(docs).toContain('Treat the downed line as live until Electricity confirms it dead');
    expect(docs).toContain('human decides');
  });
});

import { describe, expect, it } from 'vitest';
import { ASSIST_LOG_FIELDS, ASSIST_OBJECT_KINDS, DEFAULT_ASSIST_POLICY, parseAssistObjectAnnotation, parseAssistStepLog, validAssistPolicy, type AssistObjectAnnotation, type AssistStepLog } from './assist-contract';

const log: AssistStepLog = { schema: 'civicops.assist.step.v1', option: 'scene-safety', step: 'protect-scene', outcome: 'confirmed', hazards: ['lane-exposure'], decision: 'human-confirmed', atMs: 1200 };
const annotation = { kind: 'vehicle', hazard: 'lane-exposure', markerIndex: 0, guidance: 'keep-clear' };

describe('on-site assist hard ethics guards', () => {
  it('allows structured human-confirmed object and situation outcomes only', () => {
    expect(parseAssistStepLog(log)).toEqual(log);
    expect(Object.keys(parseAssistStepLog(log)!)).toEqual(ASSIST_LOG_FIELDS);
    expect(parseAssistObjectAnnotation(annotation)).toEqual(annotation);
    expect(ASSIST_OBJECT_KINDS).toEqual(['hazard', 'vehicle', 'fire', 'smoke', 'water', 'cone', 'line', 'trench', 'utility-asset']);
  });

  it('also prevents identity and media fields at the TypeScript authoring boundary', () => {
    // @ts-expect-error An assist log may never grow a recorded media field.
    const media: AssistStepLog = { ...log, video: 'forbidden' };
    // @ts-expect-error Object annotation types cannot acquire an identity field.
    const identity: AssistObjectAnnotation = { kind: 'vehicle', hazard: 'lane-exposure', markerIndex: 0, guidance: 'keep-clear', personId: 'forbidden' };
    expect(parseAssistStepLog(media)).toBeUndefined();
    expect(parseAssistObjectAnnotation(identity)).toBeUndefined();
  });

  it.each(['faceId', 'faceEmbedding', 'personId', 'identity', 'plateToPerson', 'biometric', 'threatScore', 'criminalityScore', 'suspiciousPerson', 'media', 'video', 'audio', 'frame', 'passthroughFrame', 'recording', 'latitude', 'longitude', 'note'])('rejects %s in every assist log and annotation boundary', (field) => {
    expect(parseAssistStepLog({ ...log, [field]: 'forbidden' })).toBeUndefined();
    expect(parseAssistObjectAnnotation({ ...annotation, [field]: 'forbidden' })).toBeUndefined();
  });

  it.each(['person', 'face', 'suspect', 'suspicious-person', 'person-risk'])('rejects identity/person category %s', (kind) => {
    expect(parseAssistObjectAnnotation({ ...annotation, kind })).toBeUndefined();
  });

  it('rejects nested media, unknown hazards and automatic decisions', () => {
    expect(parseAssistStepLog({ ...log, hazards: [{ video: 'data:' }] })).toBeUndefined();
    expect(parseAssistStepLog({ ...log, hazards: ['suspicious-person'] })).toBeUndefined();
    expect(parseAssistStepLog({ ...log, decision: 'agent-approved' })).toBeUndefined();
    expect(parseAssistStepLog({ ...log, decision: 'human-review-required' })).toBeUndefined();
    expect(parseAssistStepLog({ ...log, outcome: 'needs-review', decision: 'human-review-required' })).toBeDefined();
  });

  it.each([null, [], 42, {}, { ...log, atMs: Number.NaN }, { ...log, atMs: -1 }, { ...log, atMs: 1.1 }])('rejects invalid or unstructured input %s', (value) => {
    expect(parseAssistStepLog(value)).toBeUndefined();
  });

  it('copies validated data and prevents hidden retention through source mutation', () => {
    const source = { ...log, hazards: [...log.hazards] };
    const parsed = parseAssistStepLog(source)!;
    source.hazards.push('fire');
    expect(parsed.hazards).toEqual(['lane-exposure']);
    expect(parseAssistStepLog({ ...log, hazards: ['fire', 'fire'] })?.hazards).toEqual(['fire']);
  });

  it('requires on-device, no recording, no continuous tracking and a human decision maker', () => {
    expect(validAssistPolicy(DEFAULT_ASSIST_POLICY)).toBe(true);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, recording: true })).toBe(false);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, continuousTracking: true })).toBe(false);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, processing: 'cloud' })).toBe(false);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, decisionMaker: 'agent' })).toBe(false);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, hiddenCapture: true })).toBe(false);
  });

  it('permits location sharing only on-shift, consented and visibly active', () => {
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, locationSharing: 'on-shift' })).toBe(false);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, locationSharing: 'on-shift', sharingConsented: true })).toBe(false);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, locationSharing: 'on-shift', sharingConsented: true, sharingVisible: true })).toBe(true);
    expect(validAssistPolicy({ ...DEFAULT_ASSIST_POLICY, locationSharing: '24/7', sharingConsented: true, sharingVisible: true })).toBe(false);
  });
});

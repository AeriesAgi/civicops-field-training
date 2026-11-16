import { describe, expect, it } from 'vitest';
import schema from '../../../../contracts/field/field-step-log.v1.schema.json';
import { appendFieldStep, canonicalJson, exportFieldLog, FieldStepAppender, GENESIS_HASH, pseudonymousWorkerId, verifyFieldLog, type FieldStepInput, type FieldStepLogEntry } from './field-step-log';

const input = (atMs: number, outcome: 'confirmed' | 'stopped' = 'confirmed'): FieldStepInput => ({
  workOrderRef: 'CIV-2026-00042', workOrderTypeCode: 'ELECTRICITY', workerId: 'wk-1a2b3c4d',
  step: { schema: 'civicops.assist.step.v1', option: 'utility-isolation', step: 'check-isolation', outcome,
    hazards: ['live-asset'], decision: outcome === 'confirmed' ? 'human-confirmed' : 'human-review-required', atMs },
});

describe('field step log hash chain', () => {
  it.each([null, 42, [], 'corrupt'])('rejects corrupt saved entry %j without throwing', async (entry) => {
    expect(await verifyFieldLog([entry] as never)).toBe(0);
  });
  it('retains simultaneous gate and readiness outcomes in order and survives a rejected append', async () => {
    let log: FieldStepLogEntry[] = [];
    const writer = new FieldStepAppender(() => log, entries => { log = entries; });
    const first = writer.append(input(1));
    const invalid = writer.append({ ...input(2), workerId: 'invalid' });
    const last = writer.append({ ...input(3), step: { ...input(3).step, step: 'confirm-readiness' } });
    await expect(invalid).rejects.toThrow('rejected');
    await Promise.all([first, last]);
    expect(log.map(entry => entry.step.atMs)).toEqual([1, 3]);
    expect(log[1].step.step).toBe('confirm-readiness');
    expect(await verifyFieldLog(log)).toBe(-1);
  });

  it('copies queued input and preserves a valid chain beyond 500 confirmations', async () => {
    let log: FieldStepLogEntry[] = [];
    let stored = '';
    const writer = new FieldStepAppender(() => log, entries => { log = entries; stored = JSON.stringify(entries); });
    const pending = input(0);
    const first = writer.append(pending);
    pending.step.hazards.length = 0;
    const rest = Array.from({ length: 500 }, (_, index) => writer.append(input(index + 1)));
    await Promise.all([first, ...rest]);
    expect(log[0].step.hazards).toEqual(['live-asset']);
    expect(log).toHaveLength(501);
    expect(await verifyFieldLog(JSON.parse(stored))).toBe(-1);
  });

  it('chains entries from genesis and verifies', async () => {
    let log = await appendFieldStep([], input(1));
    log = await appendFieldStep(log, input(2, 'stopped'));
    expect(log[0].prevHash).toBe(GENESIS_HASH);
    expect(log[1].prevHash).toBe(log[0].hash);
    expect(log.map((entry) => entry.seq)).toEqual([0, 1]);
    expect(await verifyFieldLog(log)).toBe(-1);
  });

  it('detects tampering, reordering and deletion', async () => {
    let log = await appendFieldStep([], input(1));
    log = await appendFieldStep(log, input(2));
    log = await appendFieldStep(log, input(3));
    const edited = log.map((entry) => ({ ...entry, step: { ...entry.step } }));
    edited[1].step.outcome = 'stopped';
    expect(await verifyFieldLog(edited)).toBe(1);
    expect(await verifyFieldLog([log[0], log[2]])).toBe(1);
    expect(await verifyFieldLog([log[1], log[0]])).toBe(0);
  });

  it('rejects identity, media and free-text data at append and verify', async () => {
    await expect(appendFieldStep([], { ...input(1), workerId: 'Thabo Nkosi' })).rejects.toThrow();
    await expect(appendFieldStep([], { ...input(1), workOrderRef: 'call 082 555 0101' })).rejects.toThrow();
    await expect(appendFieldStep([], { ...input(1), step: { ...input(1).step, photo: 'data:' } as never })).rejects.toThrow();
    const log = await appendFieldStep([], input(1));
    expect(await verifyFieldLog([{ ...log[0], face: 'x' } as never])).toBe(0);
  });

  it('keeps the schema free of media and identity fields', () => {
    const text = JSON.stringify(schema).toLowerCase();
    for (const banned of ['image', 'photo', 'video', 'audio', 'frame', 'face', 'name', 'latitude', 'gps', 'plate']) {
      expect(text.includes(`"${banned}`)).toBe(false);
    }
    expect(schema.additionalProperties).toBe(false);
  });

  it('canonical JSON is key-order independent and ids are pseudonymous', async () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(await pseudonymousWorkerId('device-secret')).toMatch(/^wk-[0-9a-f]{8}$/);
    expect(JSON.parse(exportFieldLog(await appendFieldStep([], input(5)))).entries).toHaveLength(1);
  });
});

import { expect, it } from 'vitest';
import { TRAINING_FIELD_CONTEXT } from './field-log-context';
import { FieldStepAppender, verifyFieldLog, type FieldStepLogEntry } from './field-step-log';
import type { AssistStepLog } from './assist-contract';

it('stores real runtime training-context confirmations and review records without rejecting the worker id', async () => {
  let records: FieldStepLogEntry[] = [];
  const writer = new FieldStepAppender(() => records, next => { records = next; });
  const outcomes: AssistStepLog['outcome'][] = ['confirmed', 'stopped', 'needs-review', 'confirmed'];
  await Promise.all(outcomes.map((outcome, index) => writer.append({
    ...TRAINING_FIELD_CONTEXT, workOrderTypeCode: 'ELECTRICITY',
    step: { schema: 'civicops.assist.step.v1', option: 'utility-isolation',
      step: index === 3 ? 'confirm-readiness' : outcome === 'confirmed' ? 'check-isolation' : 'request-human-review',
      outcome, hazards: ['live-asset'], decision: outcome === 'confirmed' ? 'human-confirmed' : 'human-review-required', atMs: index * 1000 },
  })));
  expect(records.map(entry => entry.step.outcome)).toEqual(outcomes);
  expect(records.every(entry => entry.workerId === TRAINING_FIELD_CONTEXT.workerId)).toBe(true);
  expect(await verifyFieldLog(records)).toBe(-1);
});

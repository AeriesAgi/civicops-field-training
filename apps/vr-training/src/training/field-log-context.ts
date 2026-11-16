import type { FieldStepInput } from './field-step-log';

/** Fixed synthetic training context; never a real worker or staff identifier. */
export const TRAINING_FIELD_CONTEXT: Pick<FieldStepInput, 'workOrderRef' | 'workerId'> = {
  workOrderRef: 'CIV-2026-00042',
  workerId: 'wk-0d3e0001',
};

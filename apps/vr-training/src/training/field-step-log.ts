import { parseAssistStepLog, type AssistStepLog } from './assist-contract';

/**
 * Append-only on-site step log with a SHA-256 hash chain (WebCrypto).
 * Structured outcomes only: no media, coordinates, names or free text.
 * Contract: contracts/field/field-step-log.v1.schema.json.
 */
export const FIELD_LOG_SCHEMA = 'civicops.field.step-log.v1';
export const GENESIS_HASH = '0'.repeat(64);

export interface FieldStepLogEntry {
  schema: typeof FIELD_LOG_SCHEMA;
  seq: number;
  /** Synthetic CivicOps work reference such as CIV-2026-00042. */
  workOrderRef: string;
  workOrderTypeCode: string;
  /** Pseudonymous per-device worker id (wk-xxxxxxxx); never a name or staff number. */
  workerId: string;
  step: AssistStepLog;
  prevHash: string;
  hash: string;
}

export type FieldStepInput = Pick<FieldStepLogEntry, 'workOrderRef' | 'workOrderTypeCode' | 'workerId' | 'step'>;

const REF = /^CIV-\d{4}-\d{5}$/;
const TYPE = /^[A-Z][A-Z0-9_-]{1,39}$/;
const WORKER = /^wk-[0-9a-f]{8}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const FIELDS = ['schema', 'seq', 'workOrderRef', 'workOrderTypeCode', 'workerId', 'step', 'prevHash', 'hash'];

/** Stable key order so the hash never depends on object construction order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function entryHash(entry: Omit<FieldStepLogEntry, 'hash'>): Promise<string> {
  return sha256Hex(canonicalJson(entry));
}

export function validFieldInput(input: FieldStepInput): boolean {
  return REF.test(input.workOrderRef) && TYPE.test(input.workOrderTypeCode) && WORKER.test(input.workerId)
    && parseAssistStepLog(input.step) !== undefined;
}

export async function appendFieldStep(log: readonly FieldStepLogEntry[], input: FieldStepInput): Promise<FieldStepLogEntry[]> {
  if (!validFieldInput(input)) throw new Error('field step rejected: invalid or non-structured data');
  const step = parseAssistStepLog(input.step)!;
  const last = log[log.length - 1];
  const body = { schema: FIELD_LOG_SCHEMA, seq: log.length, workOrderRef: input.workOrderRef,
    workOrderTypeCode: input.workOrderTypeCode, workerId: input.workerId, step, prevHash: last?.hash ?? GENESIS_HASH } as const;
  return [...log, { ...body, hash: await entryHash(body) }];
}

/** Serialize async hashes so two same-frame confirmations cannot overwrite each other. */
export class FieldStepAppender {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly read: () => readonly FieldStepLogEntry[],
    private readonly commit: (entries: FieldStepLogEntry[]) => void,
  ) {}

  append(input: FieldStepInput): Promise<void> {
    if (!validFieldInput(input)) return Promise.reject(new Error('field step rejected: invalid or non-structured data'));
    // Copy at the input boundary, before waiting behind an earlier hash.
    const accepted = { ...input, step: parseAssistStepLog(input.step)! };
    const result = this.tail.then(async () => this.commit(await appendFieldStep(this.read(), accepted)));
    this.tail = result.catch(() => {});
    return result;
  }
}

/** Returns the index of the first broken entry, or -1 when the whole chain verifies. */
export async function verifyFieldLog(log: readonly FieldStepLogEntry[]): Promise<number> {
  let prev = GENESIS_HASH;
  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).length !== FIELDS.length || !FIELDS.every((key) => key in entry)
      || entry.schema !== FIELD_LOG_SCHEMA || entry.seq !== index || entry.prevHash !== prev || !HEX64.test(entry.hash)
      || !validFieldInput(entry)) return index;
    const { hash, ...body } = entry;
    if (await entryHash(body) !== hash) return index;
    prev = hash;
  }
  return -1;
}

export function exportFieldLog(log: readonly FieldStepLogEntry[]): string {
  return JSON.stringify({ schema: FIELD_LOG_SCHEMA, entries: log }, null, 2);
}

/** Derive a stable pseudonymous worker id from a random per-device secret; never from identity data. */
export async function pseudonymousWorkerId(deviceSecret: string): Promise<string> {
  return `wk-${(await sha256Hex(`civicops-field:${deviceSecret}`)).slice(0, 8)}`;
}

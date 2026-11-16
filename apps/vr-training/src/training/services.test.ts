import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingAttempt } from './contracts.js';
import { CivicOpsClient, exportResults } from './civicops-client.js';
import { ElevenLabsAgentInstructor, INSTRUCTOR_LINES, ScriptedInstructor, STEP_CAPTIONS } from './instructor.js';

const attempt: TrainingAttempt = {
  schema: 'civicops.training.attempt.v1', attemptId: '05368ee1-9b10-4b78-9ee3-993b4bdf8c35',
  moduleId: 'elec-loto', moduleVersion: 1, scenarioId: 'elec-loto-standard-1',
  traineeId: 'demo-trainee', crewId: 'electricity-01',
  startedAt: '2026-10-08T10:00:00.000Z', completedAt: '2026-10-08T10:01:00.000Z', durationMs: 60_000,
  steps: [], criticalErrors: [], score: 100, passed: true, inputMode: 'hands',
  accessibility: { oneHanded: false, gazePinch: false, highContrast: false, captions: true, seated: true, benchHeightOffset: 0 },
  device: { runtime: 'emulated', deviceName: 'IWER' }, instructor: { mode: 'scripted', hintsRequested: 0 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CivicOpsClient', () => {
  it('makes no network requests in demo mode', async () => {
    const fetchFn = vi.fn();
    const client = new CivicOpsClient('', fetchFn);
    expect(client.demoMode).toBe(true);
    expect(await client.syncAttempt(attempt)).toMatchObject({ status: 'local' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('posts JSON to the explicitly configured base and carries the attempt idempotency key', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const client = new CivicOpsClient('?api=https%3A%2F%2Fcivicops.example%2Fdemo%2F', fetchFn);
    expect(await client.syncAttempt(attempt)).toEqual({ status: 'synced' });
    expect(fetchFn).toHaveBeenCalledWith('https://civicops.example/demo/api/training/attempts', {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.attemptId },
      body: JSON.stringify(attempt),
    });
  });

  it.each(['', '/relative', 'javascript:alert(1)', 'ftp://civicops.example', 'https://user:secret@civicops.example', 'https://civicops.example?token=example'])('rejects invalid or credential-bearing API URL %s without a request', async (api) => {
    const fetchFn = vi.fn();
    expect(await new CivicOpsClient(`?api=${encodeURIComponent(api)}`, fetchFn).syncAttempt(attempt)).toMatchObject({ status: 'failed' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('deduplicates simultaneous and already completed syncs', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const client = new CivicOpsClient('?api=https://civicops.example', fetchFn);
    const first = client.syncAttempt(attempt);
    expect(client.syncAttempt(attempt)).toBe(first);
    await first;
    await client.syncAttempt(attempt);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a network failure with the same idempotency key', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, status: 200 });
    const client = new CivicOpsClient('?api=http://localhost:8080', fetchFn);
    expect(await client.syncAttempt(attempt)).toMatchObject({ status: 'failed' });
    expect(await client.syncAttempt(attempt)).toEqual({ status: 'synced' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][1].headers).toEqual(fetchFn.mock.calls[1][1].headers);
  });

  it('returns a failure status for rejected server responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    expect(await new CivicOpsClient('?api=https://civicops.example', fetchFn).syncAttempt(attempt))
      .toMatchObject({ status: 'failed', message: expect.stringContaining('503') });
  });

  it('downloads attempts JSON and releases its temporary browser resources', async () => {
    vi.useFakeTimers();
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(link), body: { appendChild } });
    const createObjectURL = vi.fn().mockReturnValue('blob:training-results');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    exportResults([attempt]);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(JSON.parse(await blob.text())).toEqual([attempt]);
    expect(link.download).toBe('civicops-training-attempts.json');
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:training-results');
  });
});

describe('scripted instructor', () => {
  it('captions every Module 1 procedure step', () => {
    const onCaption = vi.fn();
    const instructor = new ScriptedInstructor(onCaption);
    Object.keys(STEP_CAPTIONS).forEach((id) => instructor.sayStep(id));
    expect(onCaption).toHaveBeenCalledTimes(10);
    expect(onCaption).toHaveBeenCalledWith(STEP_CAPTIONS['test-dead']);
  });

  it('supports greeting and safety messages without requiring a speech API', () => {
    const onCaption = vi.fn();
    const instructor = new ScriptedInstructor(onCaption);
    instructor.say(INSTRUCTOR_LINES.raiseHands);
    instructor.say(INSTRUCTOR_LINES.unsafe);
    expect(onCaption.mock.calls.map(([line]) => line)).toEqual([INSTRUCTOR_LINES.raiseHands, INSTRUCTOR_LINES.unsafe]);
  });

  it('uses optional local speech with English captions and stops it on disposal', () => {
    const speech = { cancel: vi.fn(), speak: vi.fn() };
    vi.stubGlobal('speechSynthesis', speech);
    vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; rate = 1; constructor(readonly text: string) {} });
    const onCaption = vi.fn();
    const instructor = new ScriptedInstructor(onCaption, true);
    instructor.say('Raise your hands.');
    expect(speech.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Raise your hands.', lang: 'en', rate: 0.95 }));
    instructor.dispose();
    instructor.say('Ignored after disposal.');
    expect(onCaption).toHaveBeenCalledOnce();
    expect(speech.cancel).toHaveBeenCalledTimes(2);
  });

  it('ignores unknown step IDs', () => {
    const onCaption = vi.fn();
    new ScriptedInstructor(onCaption).sayStep('unknown');
    expect(onCaption).not.toHaveBeenCalled();
  });

  it('keeps the voice-provider adapter a no-network caption stub', () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const onCaption = vi.fn();
    const instructor = new ElevenLabsAgentInstructor(onCaption);
    instructor.sayStep('identify-circuit');
    expect(instructor.implemented).toBe(false);
    expect(onCaption).toHaveBeenCalledWith(STEP_CAPTIONS['identify-circuit']);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

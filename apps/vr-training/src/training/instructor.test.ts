import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ElevenLabsAgentInstructor, INSTRUCTOR_LINE_BY_ID, INSTRUCTOR_SCRIPT,
  ScriptedInstructor, outcomeLine, procedureMessageId,
} from './instructor.js';
import { BrowserSpeechVoice, LocalInstructorVoice, parseAudioManifest, type InstructorVoice } from './instructor-voice.js';
import { createScenario, elecLotoModule } from './modules/elec-loto.js';
import { perform, PROCEDURE_MESSAGES, start } from './procedure.js';

function mockVoice(): InstructorVoice & { speak: ReturnType<typeof vi.fn> } {
  return { speak: vi.fn(), unlock: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
}

function audioElement(play = vi.fn().mockResolvedValue(undefined)): HTMLAudioElement {
  return {
    src: '', volume: 1, currentTime: 0, onended: null, onerror: null,
    play, pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(),
  } as unknown as HTMLAudioElement;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('instructor script coverage', () => {
  it('provides instruction, hint, explanation and success for every procedure step', () => {
    expect(Object.keys(INSTRUCTOR_SCRIPT.steps).sort()).toEqual(elecLotoModule.steps.map((step) => step.id).sort());
    for (const [id, step] of Object.entries(INSTRUCTOR_SCRIPT.steps)) {
      expect(Object.keys(step).sort()).toEqual(['hint', 'instruction', 'success', 'why']);
      for (const [kind, line] of Object.entries(step)) {
        expect(line.id).toBe(`${id}.${kind}`);
        expect(line.text.length).toBeGreaterThan(12);
      }
    }
  });

  it('covers every pure reducer safety/error cause and has unique stable voice-file IDs', () => {
    expect(Object.keys(INSTRUCTOR_SCRIPT.events).sort()).toEqual(Object.keys(PROCEDURE_MESSAGES).sort());
    const lines = [
      ...Object.values(INSTRUCTOR_SCRIPT.steps).flatMap((step) => Object.values(step)),
      ...Object.values(INSTRUCTOR_SCRIPT.events), ...Object.values(INSTRUCTOR_SCRIPT.general),
    ];
    expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length);
    expect(Object.keys(INSTRUCTOR_LINE_BY_ID)).toHaveLength(lines.length);
    for (const line of lines) {
      expect(line.id).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
      expect(line.text.split(/\s+/).length).toBeLessThanOrEqual(28);
      expect(line.text).not.toMatch(/[\u2018\u2019]/);
    }
  });

  it('maps all exact reducer messages and both generated messages to their script cause', () => {
    for (const [id, message] of Object.entries(PROCEDURE_MESSAGES)) expect(procedureMessageId(message)).toBe(id);
    expect(procedureMessageId('Complete notify control first.')).toBe('out-of-order');
    expect(procedureMessageId('Critical step skipped: switch-off.')).toBe('critical-skipped');
    expect(procedureMessageId('No action occurred.')).toBeUndefined();
  });

  it('covers schematic confirmation and both states of the hand and gaze settings', () => {
    const voice = mockVoice(); const caption = vi.fn();
    const instructor = new ScriptedInstructor(caption, { voice });
    const ids = [
      'schematic-checked', 'one-hand-enabled', 'one-hand-disabled',
      'gaze-pinch-enabled', 'gaze-pinch-disabled', 'backfeed-unavailable',
    ] as const;
    for (const id of ids) instructor.sayLine(id);
    expect(voice.speak.mock.calls.map(([line]) => line.id)).toEqual(ids);
    expect(caption).toHaveBeenCalledWith('Schematic checked. Bay 3 feeds SL-3.');
    expect(caption).toHaveBeenCalledWith('Either hand works. Your tools are back in their usual seats.');
    expect(caption).toHaveBeenCalledWith('Direct hand interaction is ready. Poke a target or pinch a tool.');
    expect(INSTRUCTOR_SCRIPT.general['backfeed-unavailable'].text).not.toMatch(/prototype|placeholder|debug/i);
  });

  it('explains the actual unsafe event instead of the automatically skipped final row', () => {
    const before = start(createScenario());
    const after = perform(before, { type: 'touch-terminals' });
    expect(after.steps[after.steps.length - 1]?.outcome).toBe('skipped');
    expect(outcomeLine(before, after)).toBe(INSTRUCTOR_SCRIPT.events['touch-terminals']);
    expect(outcomeLine(after, after)).toBeUndefined();
    const safeTooSoon = perform(before, 'safe-to-work');
    expect(outcomeLine(before, safeTooSoon)).toBe(INSTRUCTOR_SCRIPT.events['safe-too-soon']);
  });

  it('routes wrong-breaker, mislabelled-breaker, and backfeed outcomes to specific explanations', () => {
    const initial = start(createScenario(1));
    expect(outcomeLine(initial, perform(initial, { type: 'identify-circuit', breakerId: 'sl-2' }))?.id)
      .toBe('event.wrong-circuit-identify');
    expect(outcomeLine(initial, perform(initial, 'identify-circuit'))?.id).toBe('event.mislabelled-breaker');
    let before = start(createScenario(2));
    for (const step of ['identify-circuit', 'notify-control', 'switch-off', 'apply-lock', 'apply-tag', 'try-start', 'prove-tester'] as const) {
      before = perform(before, step);
    }
    expect(outcomeLine(before, perform(before, 'test-dead'))?.id).toBe('event.backfeed-live');
  });
});

describe('instructor delivery', () => {
  it('queues the next instruction after success, while unsafe explanations remain uninterrupted', () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const instructor = new ScriptedInstructor(caption, { voice });
    const before = start(createScenario());
    instructor.sayOutcome(before, perform(before, 'identify-circuit'));
    expect(voice.speak.mock.calls).toEqual([
      [INSTRUCTOR_SCRIPT.steps['identify-circuit'].success],
      [INSTRUCTOR_SCRIPT.steps['notify-control'].instruction, true],
    ]);
    expect(caption).toHaveBeenCalledWith('SL-3 identified. Now let control know. Notify control before switching off.');
    voice.speak.mockClear();
    instructor.sayOutcome(before, perform(before, { type: 'touch-terminals' }));
    expect(voice.speak).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.events['touch-terminals']);
  });

  it('can omit the full-lesson instruction for an onboarding or First lock milestone', () => {
    const voice = mockVoice(); const caption = vi.fn();
    const instructor = new ScriptedInstructor(caption, { voice });
    const before = start(createScenario());
    expect(instructor.sayOutcome(before, perform(before, 'identify-circuit'), false)).toBe('identify-circuit.success');
    expect(voice.speak).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.steps['identify-circuit'].success);
    expect(caption).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.steps['identify-circuit'].success.text);
  });

  it('sends hint, why and onboarding IDs through the same caption and voice table', () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const instructor = new ScriptedInstructor(caption, { voice, volume: 0.4 });
    instructor.sayHint('apply-lock');
    instructor.sayWhy('apply-lock');
    instructor.sayLine('first-lock-stamp');
    expect(voice.setVolume).toHaveBeenCalledWith(0.4);
    expect(voice.speak.mock.calls.map(([line]) => line.id)).toEqual(['apply-lock.hint', 'apply-lock.why', 'first-lock-stamp']);
    expect(caption).toHaveBeenCalledTimes(3);
    instructor.unlock();
    expect(voice.unlock).toHaveBeenCalledOnce();
    instructor.dispose();
    instructor.sayLine('raise-hands');
    expect(caption).toHaveBeenCalledTimes(3);
  });

  it('keeps all four future conversation tools local and callable', () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const highlight = vi.fn(); const repeat = vi.fn(); const why = vi.fn();
    const instructor = new ElevenLabsAgentInstructor(vi.fn(), {
      get_step_state: () => ({ stepId: 'apply-lock', completed: false, failed: false }),
      highlight_object: highlight, repeat_demo: repeat, explain_why: why,
    });
    expect(instructor.clientTools.get_step_state().stepId).toBe('apply-lock');
    instructor.clientTools.highlight_object('personal-lock');
    instructor.clientTools.repeat_demo(); instructor.clientTools.explain_why(); instructor.unlock();
    expect(highlight).toHaveBeenCalledWith('personal-lock');
    expect(repeat).toHaveBeenCalledOnce(); expect(why).toHaveBeenCalledOnce();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('local voice providers', () => {
  it('uses speech by default and honours English, master volume, queueing and mute', () => {
    const speech = { cancel: vi.fn(), speak: vi.fn() };
    vi.stubGlobal('speechSynthesis', speech);
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(readonly text: string) {} });
    const instructor = new ScriptedInstructor(vi.fn());
    instructor.setVolume(0.35);
    instructor.sayLine('raise-hands');
    const utterance = speech.speak.mock.calls[0][0];
    expect(utterance).toMatchObject({ text: 'Raise your hands. Either hand works.', lang: 'en', rate: 0.95, volume: 0.35 });
    const voice = new BrowserSpeechVoice();
    voice.speak({ id: 'one', text: 'One.' });
    const cancelled = speech.cancel.mock.calls.length;
    voice.speak({ id: 'two', text: 'Two.' }, true);
    expect(speech.cancel).toHaveBeenCalledTimes(cancelled);
    voice.setVolume(0); voice.speak({ id: 'muted', text: 'Muted.' });
    expect(speech.speak).toHaveBeenCalledTimes(3);
  });

  it('loads only the local manifest once after unlock and plays listed files with the shared volume', async () => {
    const fallback = mockVoice(); const audio = audioElement();
    const loader = vi.fn().mockResolvedValue({ schema: 'civicops.instructor-audio.v1', language: 'en', lines: { 'apply-lock.why': 'apply-lock.why.mp3' } });
    const voice = new LocalInstructorVoice({ baseUrl: '/training/', fallback, loadManifest: loader, createAudio: () => audio });
    expect(loader).not.toHaveBeenCalled();
    voice.unlock(); voice.unlock();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledExactlyOnceWith('/training/audio/instructor/en/manifest.json');
    voice.setVolume(0.2); voice.speak(INSTRUCTOR_SCRIPT.steps['apply-lock'].why);
    expect(audio.src).toBe('/training/audio/instructor/en/apply-lock.why.mp3');
    expect(audio.volume).toBe(0.2);
    expect(fallback.speak).not.toHaveBeenCalled();
    voice.speak(INSTRUCTOR_SCRIPT.general.greeting);
    expect(fallback.speak).toHaveBeenCalledWith(INSTRUCTOR_SCRIPT.general.greeting, false, expect.any(Function));
    voice.dispose(); expect(audio.pause).toHaveBeenCalled(); expect(audio.load).toHaveBeenCalledOnce();
  });

  it('preserves line order across rendered success and browser instruction fallback', async () => {
    const fallback = mockVoice(); const audio = audioElement();
    const voice = new LocalInstructorVoice({ fallback, createAudio: () => audio, loadManifest: async () => ({
      schema: 'civicops.instructor-audio.v1', language: 'en', lines: { 'identify-circuit.success': 'identify-circuit.success.mp3' },
    }) });
    voice.unlock(); await Promise.resolve();
    voice.speak(INSTRUCTOR_SCRIPT.steps['identify-circuit'].success);
    voice.speak(INSTRUCTOR_SCRIPT.steps['notify-control'].instruction, true);
    expect(fallback.speak).not.toHaveBeenCalled();
    audio.onended?.(new Event('ended'));
    expect(fallback.speak).toHaveBeenCalledWith(INSTRUCTOR_SCRIPT.steps['notify-control'].instruction, false, expect.any(Function));
  });

  it('falls back once when rendered playback errors, and ignores a stale rejected playback', async () => {
    const fallback = mockVoice(); const audio = audioElement(vi.fn().mockRejectedValue(new Error('unavailable')));
    const voice = new LocalInstructorVoice({ fallback, createAudio: () => audio, loadManifest: async () => ({
      schema: 'civicops.instructor-audio.v1', language: 'en', lines: { 'raise-hands': 'raise-hands.mp3' },
    }) });
    voice.unlock(); await Promise.resolve();
    voice.speak(INSTRUCTOR_SCRIPT.general['raise-hands']);
    audio.onerror?.(new Event('error'));
    await Promise.resolve();
    expect(fallback.speak).toHaveBeenCalledOnce();
    fallback.speak.mockClear();
    voice.speak(INSTRUCTOR_SCRIPT.general['raise-hands']);
    voice.speak(INSTRUCTOR_SCRIPT.general.greeting);
    await Promise.resolve();
    expect(fallback.speak).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.general.greeting, false, expect.any(Function));
  });

  it('uses captions/speech when a missing manifest fails, with no audio element allocation', async () => {
    const fallback = mockVoice(); const createAudio = vi.fn();
    const voice = new LocalInstructorVoice({ fallback, createAudio, loadManifest: async () => { throw new Error('missing'); } });
    voice.unlock(); await Promise.resolve();
    voice.speak(INSTRUCTOR_SCRIPT.general['raise-hands']);
    expect(fallback.speak).toHaveBeenCalledOnce(); expect(createAudio).not.toHaveBeenCalled();
  });

  it('rejects external URLs, path traversal, mismatched filenames and malformed manifests', () => {
    expect(parseAudioManifest({ schema: 'civicops.instructor-audio.v1', language: 'en', lines: {} })).toBeDefined();
    for (const file of ['https://voice.invalid/key.mp3', '../secret.mp3', 'different.mp3', 'raise-hands.mp3?token=x']) {
      expect(parseAudioManifest({ schema: 'civicops.instructor-audio.v1', language: 'en', lines: { 'raise-hands': file } })).toBeUndefined();
    }
    expect(parseAudioManifest({ schema: 'unknown', language: 'en', lines: {} })).toBeUndefined();
    expect(parseAudioManifest({ schema: 'civicops.instructor-audio.v1', language: 'en', lines: [] })).toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { INSTRUCTOR_SCRIPT, ScriptedInstructor } from './instructor.js';
import { createInstructor, LiveMetaInstructor } from './meta-instructor.js';
import { perform, start } from './procedure.js';
import { createScenario } from './modules/elec-loto.js';
import {
  DEFAULT_GUIDANCE, GUIDANCE_KEY, UNGUIDED_BRIEF,
  loadGuidance, parseGuidance, saveGuidance, volunteersInstruction,
} from './guidance.js';

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key: string) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key: string, value: string) { data[key] = value; },
  };
}

function mockVoice() {
  return { speak: vi.fn(), unlock: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
}

describe('parseGuidance', () => {
  it('accepts guided and unguided, and falls back to guided for anything else', () => {
    expect(DEFAULT_GUIDANCE).toBe('guided');
    expect(parseGuidance('guided')).toBe('guided');
    expect(parseGuidance('unguided')).toBe('unguided');
    expect(parseGuidance({ mode: 'unguided' })).toBe('unguided');
    expect(parseGuidance({ mode: 'guided' })).toBe('guided');
    expect(parseGuidance({ mode: 'assessment' })).toBe('guided');
    expect(parseGuidance('')).toBe('guided');
    expect(parseGuidance(null)).toBe('guided');
    expect(parseGuidance(undefined)).toBe('guided');
    expect(parseGuidance(1)).toBe('guided');
    expect(parseGuidance(['unguided'])).toBe('guided');
  });
});

describe('loadGuidance and saveGuidance', () => {
  it('defaults to guided when there is no store and no URL', () => {
    expect(loadGuidance()).toBe('guided');
    expect(loadGuidance(undefined, '')).toBe('guided');
  });

  it('reads a saved JSON record or a plain stored string', () => {
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: JSON.stringify({ version: 1, mode: 'unguided' }) }))).toBe('unguided');
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: 'unguided' }))).toBe('unguided');
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: 'guided' }))).toBe('guided');
  });

  it('ignores a corrupt or throwing store and stays on guided', () => {
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: '{not-json' }))).toBe('guided');
    const throwing = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
    };
    expect(loadGuidance(throwing)).toBe('guided');
    expect(() => saveGuidance(throwing, 'unguided')).not.toThrow();
    expect(() => saveGuidance(undefined, 'unguided')).not.toThrow();
  });

  it('lets a valid ?guidance= URL override storage, and ignores unknown values', () => {
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: 'unguided' }), '?guidance=guided')).toBe('guided');
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: 'guided' }), '?guidance=unguided')).toBe('unguided');
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: 'guided' }), 'guidance=unguided')).toBe('unguided');
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: 'guided' }), '?guidance=assessment')).toBe('guided');
    expect(loadGuidance(memoryStore({ [GUIDANCE_KEY]: 'unguided' }), '?other=unguided')).toBe('unguided');
  });

  it('persists a valid URL override so a later load without the query keeps the mode', () => {
    const store = memoryStore({ [GUIDANCE_KEY]: 'guided' });
    expect(loadGuidance(store, '?guidance=unguided')).toBe('unguided');
    expect(loadGuidance(store)).toBe('unguided');
  });

  it('round-trips through saveGuidance without throwing on a missing store', () => {
    const store = memoryStore();
    saveGuidance(store, 'unguided');
    expect(loadGuidance(store)).toBe('unguided');
    saveGuidance(store, 'guided');
    expect(loadGuidance(store)).toBe('guided');
    expect(JSON.parse(store.data[GUIDANCE_KEY])).toEqual({ version: 1, mode: 'guided' });
  });
});

describe('volunteersInstruction', () => {
  it('is true only in guided practice', () => {
    expect(volunteersInstruction('guided')).toBe(true);
    expect(volunteersInstruction('unguided')).toBe(false);
  });
});

describe('unguided ScriptedInstructor', () => {
  it('defaults to guided behaviour: queues the next instruction after success', () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const instructor = new ScriptedInstructor(caption, { voice });
    expect(instructor.guidance).toBe('guided');
    const before = start(createScenario());
    instructor.sayOutcome(before, perform(before, 'identify-circuit'));
    expect(voice.speak.mock.calls).toEqual([
      [INSTRUCTOR_SCRIPT.steps['identify-circuit'].success],
      [INSTRUCTOR_SCRIPT.steps['notify-control'].instruction, true],
    ]);
    expect(caption).toHaveBeenCalledWith('SL-3 identified. Now let control know. Notify control before switching off.');
  });

  it('stays silent on volunteered step instructions, but still speaks unsafe events', () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const instructor = new ScriptedInstructor(caption, { voice, guidance: 'unguided' });
    expect(instructor.guidance).toBe('unguided');
    instructor.sayStep('identify-circuit');
    expect(caption).not.toHaveBeenCalled();
    expect(voice.speak).not.toHaveBeenCalled();

    const before = start(createScenario());
    instructor.sayOutcome(before, perform(before, 'identify-circuit'));
    expect(voice.speak).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.steps['identify-circuit'].success);
    expect(caption).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.steps['identify-circuit'].success.text);

    voice.speak.mockClear();
    caption.mockClear();
    instructor.sayOutcome(before, perform(before, { type: 'touch-terminals' }));
    expect(voice.speak).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.events['touch-terminals']);
    expect(caption).toHaveBeenCalledExactlyOnceWith(INSTRUCTOR_SCRIPT.events['touch-terminals'].text);
  });

  it('still delivers a requested hint or why, and still speaks the unguided brief', () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const instructor = new ScriptedInstructor(caption, { voice, guidance: 'unguided' });
    instructor.sayHint('apply-lock');
    instructor.sayWhy('apply-lock');
    instructor.say(UNGUIDED_BRIEF);
    expect(voice.speak.mock.calls.map(([line]) => line.id)).toEqual([
      'apply-lock.hint',
      'apply-lock.why',
      'local-caption',
    ]);
    expect(caption).toHaveBeenCalledWith(INSTRUCTOR_SCRIPT.steps['apply-lock'].hint.text);
    expect(caption).toHaveBeenCalledWith(INSTRUCTOR_SCRIPT.steps['apply-lock'].why.text);
    expect(caption).toHaveBeenCalledWith(UNGUIDED_BRIEF);
  });

  it('passes guidance through createInstructor to both scripted and live instructors', async () => {
    const scripted = createInstructor(vi.fn(), { voice: mockVoice(), guidance: 'unguided' });
    expect(scripted.guidance).toBe('unguided');
    expect(scripted).not.toBeInstanceOf(LiveMetaInstructor);

    const complete = vi.fn().mockResolvedValue('Because the circuit may still be live.');
    const live = createInstructor(vi.fn(), {
      voice: mockVoice(),
      guidance: 'unguided',
      llm: { enabled: true, complete },
    });
    expect(live).toBeInstanceOf(LiveMetaInstructor);
    expect(live.guidance).toBe('unguided');
    const answer = await (live as LiveMetaInstructor).ask('Why is apply lock required?', { stepId: 'apply-lock', programme: 'elec-loto' });
    expect(complete).toHaveBeenCalledOnce();
    expect(answer).toContain('circuit');
  });

  it('sayInstruction is silent only in unguided practice', () => {
    const guidedVoice = mockVoice();
    const guidedCaption = vi.fn();
    new ScriptedInstructor(guidedCaption, { voice: guidedVoice }).sayInstruction('Make the area safe first.');
    expect(guidedCaption).toHaveBeenCalledExactlyOnceWith('Make the area safe first.');
    expect(guidedVoice.speak).toHaveBeenCalledOnce();

    const unguidedVoice = mockVoice();
    const unguidedCaption = vi.fn();
    new ScriptedInstructor(unguidedCaption, { voice: unguidedVoice, guidance: 'unguided' }).sayInstruction('Make the area safe first.');
    expect(unguidedCaption).not.toHaveBeenCalled();
    expect(unguidedVoice.speak).not.toHaveBeenCalled();
  });
});

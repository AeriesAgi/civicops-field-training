import { describe, expect, it, vi } from 'vitest';
import { INSTRUCTOR_SCRIPT, ScriptedInstructor } from './instructor.js';
import { perform as performStep, start as startProcedure } from './procedure.js';
import {
  INSTRUCTOR_SYSTEM_PROMPT, LLAMA_DEFAULT_BASE_URL, LiveMetaInstructor, OpenAiCompatibleClient,
  createInstructor, extractAssistantText, gatewayComplete, normalizeLlamaBaseUrl, readLlmConfig,
  resolveApiKey, sanitizeErrorText, usesMuseReasoning,
} from './meta-instructor.js';
import { createScenario as scenario } from './modules/elec-loto.js';

function mockVoice() {
  return { speak: vi.fn(), unlock: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
}

describe('readLlmConfig', () => {
  it('is disabled by default, with Llama API defaults and no key material', () => {
    const config = readLlmConfig({});
    expect(config).toEqual({
      enabled: false,
      provider: 'none',
      baseUrl: 'https://api.llama.com/compat/v1',
      model: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
      hasApiKey: false,
    });
    expect(config).not.toHaveProperty('apiKey');
    expect(JSON.stringify(config)).not.toMatch(/apiKey|Bearer|sk-|CIVICOPS_LLM_API_KEY/);
  });

  it('enables llama only when explicitly on and a key is present, without exposing the key', () => {
    const config = readLlmConfig({
      CIVICOPS_LLM_ENABLED: '1',
      CIVICOPS_LLM_PROVIDER: 'llama',
      CIVICOPS_LLM_API_KEY: 'secret-test-key',
    });
    expect(config).toMatchObject({ enabled: true, provider: 'llama', hasApiKey: true });
    expect(config).not.toHaveProperty('apiKey');
    expect(JSON.stringify(config)).not.toContain('secret-test-key');
    expect(resolveApiKey({ CIVICOPS_LLM_API_KEY: 'secret-test-key' })).toBe('secret-test-key');
  });

  it('stays disabled without a key, and refuses Baseten even when a key is present', () => {
    expect(readLlmConfig({
      CIVICOPS_LLM_ENABLED: '1',
      CIVICOPS_LLM_PROVIDER: 'llama',
    })).toMatchObject({ enabled: false, provider: 'llama', hasApiKey: false });
    expect(readLlmConfig({
      CIVICOPS_LLM_ENABLED: '1',
      CIVICOPS_LLM_PROVIDER: 'baseten',
      CIVICOPS_LLM_API_KEY: 'secret-test-key',
      CIVICOPS_LLM_BASE_URL: 'https://inference.baseten.co/v1',
    })).toMatchObject({ enabled: false, provider: 'none', hasApiKey: true });
    expect(readLlmConfig({
      CIVICOPS_LLM_ENABLED: '1',
      CIVICOPS_LLM_PROVIDER: 'llama',
      CIVICOPS_LLM_API_KEY: '   ',
    }).enabled).toBe(false);
  });
});

describe('sanitizeErrorText', () => {
  it('strips API keys and bearer tokens from error text', () => {
    const cleaned = sanitizeErrorText('401 Bearer secret-test-key is invalid', 'secret-test-key');
    expect(cleaned).not.toContain('secret-test-key');
    expect(cleaned).toMatch(/Bearer \[redacted\]/);
    expect(cleaned).not.toMatch(/Bearer\s+secret-test-key/i);
  });
});

describe('OpenAiCompatibleClient', () => {
  it('posts chat completions with the bearer token and returns trimmed assistant text', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: ' Keep your hands clear of the terminals. ' } }] }),
    });
    const client = new OpenAiCompatibleClient({
      baseUrl: 'https://api.llama.com/compat/v1',
      model: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
      apiKey: 'secret-test-key',
      fetch: fetchFn,
    });
    await expect(client.complete([{ role: 'user', content: 'Why prove the tester?' }]))
      .resolves.toBe('Keep your hands clear of the terminals.');
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.llama.com/compat/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('Llama-4-Maverick-17B-128E-Instruct-FP8');
    expect(body.messages[0]).toEqual({ role: 'system', content: INSTRUCTOR_SYSTEM_PROMPT });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Why prove the tester?' });
    expect(INSTRUCTOR_SYSTEM_PROMPT).toMatch(/practice/i);
    expect(INSTRUCTOR_SYSTEM_PROMPT).toMatch(/not a work authorisation/i);
    expect(body.max_tokens).toBeLessThanOrEqual(120);
  });

  it('rejects empty replies and strips the API key from failed-request errors', async () => {
    const fail = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized Bearer secret-test-key',
    });
    const client = new OpenAiCompatibleClient({
      baseUrl: 'https://api.llama.com/compat/v1',
      model: 'x',
      apiKey: 'secret-test-key',
      fetch: fail,
    });
    await expect(client.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(/instructor/i);
    try {
      await client.complete([{ role: 'user', content: 'hi' }]);
      expect.unreachable();
    } catch (error) {
      const text = String(error);
      expect(text).not.toContain('secret-test-key');
      expect(text).not.toMatch(/Bearer\s+\S+/i);
    }

    const empty = new OpenAiCompatibleClient({
      baseUrl: 'https://api.llama.com/compat/v1',
      model: 'x',
      apiKey: 'secret-test-key',
      fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }),
    });
    await expect(empty.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(/empty/i);
  });
});

describe('LiveMetaInstructor', () => {
  it('keeps procedure captions on the scripted path', () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const instructor = new LiveMetaInstructor(caption, {
      voice,
      complete: vi.fn(),
    });
    const before = startProcedure(scenario());
    instructor.sayOutcome(before, performStep(before, 'identify-circuit'));
    expect(caption).toHaveBeenCalledWith('SL-3 identified. Now let control know. Notify control before switching off.');
    expect(instructor.mode).toBe('scripted');
  });

  it('asks Meta and captions a live answer when the client resolves', async () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const complete = vi.fn().mockResolvedValue('Prove the tester on a known live source before the dead test.');
    const instructor = new LiveMetaInstructor(caption, { voice, complete });
    const answer = await instructor.ask('Why prove the tester first?', { stepId: 'prove-tester', programme: 'elec-loto' });
    expect(answer).toBe('Prove the tester on a known live source before the dead test.');
    expect(caption).toHaveBeenCalledWith(answer);
    expect(complete).toHaveBeenCalledOnce();
    const messages = complete.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages.some((message) => message.content.includes('Why prove the tester first?'))).toBe(true);
    expect(messages.some((message) => message.content.includes('prove-tester'))).toBe(true);
    expect(instructor.mode).toBe('llama');
  });

  it('falls back to the scripted why line when the client fails, without throwing or leaking a key', async () => {
    const voice = mockVoice();
    const caption = vi.fn();
    const complete = vi.fn().mockRejectedValue(new Error('401 Bearer secret-test-key'));
    const instructor = new LiveMetaInstructor(caption, { voice, complete });
    const answer = await instructor.ask('Why this lock?', { stepId: 'apply-lock' });
    expect(answer).toBe(INSTRUCTOR_SCRIPT.steps['apply-lock'].why.text);
    expect(caption).toHaveBeenCalledWith(answer);
    expect(instructor.mode).toBe('scripted');
    expect(JSON.stringify(caption.mock.calls)).not.toContain('secret-test-key');
  });
});

describe('createInstructor', () => {
  it('returns a scripted instructor when live Meta is off, and a live one when a complete function is supplied', () => {
    const scripted = createInstructor(vi.fn(), { voice: mockVoice() });
    expect(scripted).toBeInstanceOf(ScriptedInstructor);
    expect(scripted).not.toBeInstanceOf(LiveMetaInstructor);
    const live = createInstructor(vi.fn(), {
      voice: mockVoice(),
      llm: { enabled: true, complete: vi.fn() },
    });
    expect(live).toBeInstanceOf(LiveMetaInstructor);
    const disabled = createInstructor(vi.fn(), {
      voice: mockVoice(),
      llm: { enabled: false, complete: vi.fn() },
    });
    expect(disabled).not.toBeInstanceOf(LiveMetaInstructor);
  });
});

describe('normalizeLlamaBaseUrl', () => {
  it('expands the Llama host URL to the compatible v1 path', () => {
    expect(normalizeLlamaBaseUrl('https://api.llama.com')).toBe(LLAMA_DEFAULT_BASE_URL);
    expect(normalizeLlamaBaseUrl('https://api.llama.com/')).toBe(LLAMA_DEFAULT_BASE_URL);
    expect(normalizeLlamaBaseUrl('https://api.llama.com/compat/v1/')).toBe(LLAMA_DEFAULT_BASE_URL);
    expect(normalizeLlamaBaseUrl('https://example.test/v1')).toBe('https://example.test/v1');
  });
});

describe('gatewayComplete', () => {
  it('posts messages to the gateway and returns the text, without a key in the browser request', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: ' Stay in the refuge until traffic is held. ' }),
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchFn as unknown as typeof fetch;
    try {
      const text = await gatewayComplete('/api/instructor/ask')([
        { role: 'user', content: 'Why wait in the refuge?' },
      ]);
      expect(text).toBe('Stay in the refuge until traffic is held.');
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/instructor/ask');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('omit');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(JSON.stringify(init)).not.toMatch(/Bearer|CIVICOPS_LLM_API_KEY|secret-test-key/);
      expect(JSON.parse(String(init.body))).toEqual({
        messages: [{ role: 'user', content: 'Why wait in the refuge?' }],
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('throws a key-free instructor error when the gateway is down', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    try {
      await expect(gatewayComplete()([{ role: 'user', content: 'hi' }])).rejects.toThrow(/instructor/i);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('usesMuseReasoning and extractAssistantText', () => {
  it('detects the Meta Muse host and extracts string or structured content', () => {
    expect(usesMuseReasoning('https://api.meta.ai/v1', 'muse-spark-1.3')).toBe(true);
    expect(usesMuseReasoning('https://api.llama.com/compat/v1', 'Llama-4-Maverick-17B-128E-Instruct-FP8')).toBe(false);
    expect(extractAssistantText({
      choices: [{ message: { content: ' Stay in the refuge. ' } }],
    })).toBe('Stay in the refuge.');
    expect(extractAssistantText({
      choices: [{ message: { content: [{ type: 'text', text: 'Stay in the refuge.' }] } }],
    })).toBe('Stay in the refuge.');
    expect(extractAssistantText({
      choices: [{ message: { content: null, refusal: null } }],
    })).toBe('');
  });
});

describe('OpenAiCompatibleClient Muse defaults', () => {
  it('sends minimal reasoning and a 512-token budget on api.meta.ai, and treats null content as empty', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: ' Prove the tester on a known live source first. ' } }] }),
    });
    const client = new OpenAiCompatibleClient({
      baseUrl: 'https://api.meta.ai/v1',
      model: 'muse-spark-1.3',
      apiKey: 'secret-test-key',
      fetch: fetchFn,
    });
    await expect(client.complete([{ role: 'user', content: 'Why prove the tester?' }]))
      .resolves.toBe('Prove the tester on a known live source first.');
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.reasoning_effort).toBe('minimal');
    expect(body.max_tokens).toBe(512);
    expect(body.max_tokens).toBeGreaterThan(120);

    const empty = new OpenAiCompatibleClient({
      baseUrl: 'https://api.meta.ai/v1',
      model: 'muse-spark-1.3',
      apiKey: 'secret-test-key',
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ finish_reason: 'length', message: { content: null } }] }),
      }),
    });
    await expect(empty.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(/empty/i);
  });
});
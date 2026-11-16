import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { INSTRUCTOR_SYSTEM_PROMPT } from '../src/training/meta-instructor.ts';

const require = createRequire(import.meta.url);
const fn = require('../api/instructor-ask/handler.js');
const KEY = 'test-key-not-real-0000';
const req = (body, ip = '203.0.113.1') => ({ method: 'POST', headers: { 'x-forwarded-for': ip }, body });
const ok = (content) => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });

describe('api/instructor/ask function', () => {
  beforeEach(() => fn._hits.clear());

  it('uses the same system prompt as the app', () => {
    expect(fn.SYSTEM_PROMPT).toBe(INSTRUCTOR_SYSTEM_PROMPT);
  });

  it('returns { text } in the shape gatewayComplete expects, with the key only in the auth header', async () => {
    let sent;
    const res = await fn.handle(req({ messages: [{ role: 'user', content: 'Why test before touch?' }] }), { META_API_KEY: KEY }, async (url, init) => {
      sent = { url, init };
      return ok('Because stored energy can remain.')();
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ text: 'Because stored energy can remain.' });
    expect(sent.url).toBe('https://api.meta.ai/v1/chat/completions');
    const payload = JSON.parse(sent.init.body);
    expect(payload.messages[0]).toEqual({ role: 'system', content: INSTRUCTOR_SYSTEM_PROMPT });
    expect(payload.max_tokens).toBeLessThanOrEqual(512);
    expect(sent.init.body).not.toContain(KEY);
  });

  it('uses a small token budget on the Llama API', async () => {
    let payload;
    await fn.handle(req({ messages: [{ role: 'user', content: 'hi' }] }), { META_API_KEY: KEY, LLAMA_BASE_URL: 'https://api.llama.com/compat/v1', LLAMA_MODEL: 'Llama-4-Maverick-17B-128E-Instruct-FP8' }, async (_u, init) => {
      payload = JSON.parse(init.body);
      return ok('ok')();
    });
    expect(payload.max_tokens).toBe(200);
    expect(payload.reasoning_effort).toBeUndefined();
  });

  it('is disabled without a key and rejects bad or oversized input', async () => {
    expect((await fn.handle(req({ messages: [{ role: 'user', content: 'hi' }] }), {})).status).toBe(503);
    expect((await fn.handle(req({}), { META_API_KEY: KEY }, ok('x'))).status).toBe(400);
    expect((await fn.handle(req({ messages: [{ role: 'user', content: 'x'.repeat(601) }] }), { META_API_KEY: KEY }, ok('x'))).status).toBe(400);
    expect((await fn.handle(req('not json'), { META_API_KEY: KEY }, ok('x'))).status).toBe(400);
    expect((await fn.handle({ method: 'GET', headers: {} }, { META_API_KEY: KEY }, ok('x'))).status).toBe(405);
  });

  it('never echoes upstream errors or the key', async () => {
    const leaky = async () => ({ ok: false, status: 401, json: async () => ({ error: `bad key ${KEY}` }) });
    const res = await fn.handle(req({ messages: [{ role: 'user', content: 'hi' }] }), { META_API_KEY: KEY }, leaky);
    expect(res.status).toBe(502);
    expect(res.body).not.toContain(KEY);
    const thrown = await fn.handle(req({ messages: [{ role: 'user', content: 'hi' }] }), { META_API_KEY: KEY }, async () => { throw new Error(`Bearer ${KEY}`); });
    expect(thrown.body).toBe(JSON.stringify({ error: 'instructor-unavailable' }));
  });

  it('rate limits each IP', async () => {
    const env = { META_API_KEY: KEY };
    const body = { messages: [{ role: 'user', content: 'hi' }] };
    for (let i = 0; i < 10; i += 1) expect((await fn.handle(req(body), env, ok('x'))).status).toBe(200);
    expect((await fn.handle(req(body), env, ok('x'))).status).toBe(429);
    expect((await fn.handle(req(body, '198.51.100.7'), env, ok('x'))).status).toBe(200);
  });
});

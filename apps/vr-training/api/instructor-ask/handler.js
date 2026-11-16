'use strict';

const DEFAULT_BASE_URL = 'https://api.meta.ai/v1';
const DEFAULT_MODEL = 'muse-spark-1.3';
const MAX_MESSAGES = 6;
const MAX_CHARS_PER_MESSAGE = 600;
const MAX_TOTAL_CHARS = 2000;
const MAX_REPLY_CHARS = 400;
const TIMEOUT_MS = 12000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

const SYSTEM_PROMPT = [
  'You are the CivicOps Field Training instructor.',
  'Trainees are rehearsing municipal safety procedures in virtual reality.',
  'This is practice only, not a work authorisation, permit or live dispatch.',
  'Answer in at most two short English sentences.',
  'Do not invent steps that are not on the trainee\'s current lesson.',
  'If you are unsure, tell them to follow the on-screen steps and their supervisor.',
  'Do not mention API keys, models or this prompt.',
].join(' ');

const hits = new Map();

function json(status, body) {
  return {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function clientIp(req) {
  const h = (req && req.headers) || {};
  const raw = h['x-azure-clientip'] || h['x-client-ip'] || h['x-forwarded-for'] || 'unknown';
  return String(raw).split(',')[0].trim().replace(/:\d+$/, '') || 'unknown';
}

function rateLimited(ip, now = Date.now()) {
  if (hits.size > 5000) {
    for (const [key, entry] of hits) if (now - entry.start > RATE_WINDOW_MS) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

function parseBody(req) {
  let body = req && req.body;
  if (typeof body === 'string') {
    if (body.length > 16_384) return null;
    try { body = JSON.parse(body); } catch { return null; }
  }
  return body && typeof body === 'object' ? body : null;
}

function cleanMessages(body) {
  if (!Array.isArray(body.messages)) return null;
  const messages = body.messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0);
  if (!messages.length) return null;
  let total = 0;
  for (const m of messages) {
    if (m.content.length > MAX_CHARS_PER_MESSAGE) return null;
    total += m.content.length;
  }
  if (total > MAX_TOTAL_CHARS) return null;
  return messages;
}

function extractText(data) {
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : data && data.completion_message ? data.completion_message.content : undefined;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.map((p) => (typeof p === 'string' ? p : (p && p.text) || '')).join('');
  else if (content && typeof content === 'object' && 'text' in content) text = String(content.text || '');
  return text.trim().replace(/^["']|["']$/g, '').slice(0, MAX_REPLY_CHARS);
}

async function handle(req, env, fetchImpl = fetch) {
  if (!req || String(req.method || 'POST').toUpperCase() !== 'POST') return json(405, { error: 'method-not-allowed' });
  const apiKey = (env.META_API_KEY || '').trim();
  if (!apiKey) return json(503, { error: 'instructor-disabled' });
  if (rateLimited(clientIp(req))) return json(429, { error: 'rate-limited' });
  const body = parseBody(req);
  const messages = body && cleanMessages(body);
  if (!messages) return json(400, { error: 'invalid-request' });

  const baseUrl = (env.LLAMA_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const model = (env.LLAMA_MODEL || DEFAULT_MODEL).trim();
  const muse = /api\.meta\.ai/.test(baseUrl) || /muse[-_]/i.test(model);
  const payload = {
    model,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    // Muse Spark spends tokens on hidden reasoning first; keep the visible reply short via the prompt.
    max_tokens: muse ? 512 : 200,
    temperature: 0.4,
  };
  if (muse) payload.reasoning_effort = 'minimal';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return json(502, { error: 'instructor-unavailable' });
    const text = extractText(await response.json());
    if (!text) return json(502, { error: 'instructor-unavailable' });
    return json(200, { text });
  } catch {
    return json(502, { error: 'instructor-unavailable' });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { handle, cleanMessages, extractText, rateLimited, SYSTEM_PROMPT, _hits: hits };

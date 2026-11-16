#!/usr/bin/env node
/**
 * Prove the existing Meta / Llama API answers a CivicOps instructor question.
 * Prints only answered=yes/no and a character count. Never prints the API key,
 * a bearer token, or the model reply. Load credentials from the environment,
 * or from a file path in CIVICOPS_LLM_SECRETS (dotenv-style KEY=value).
 */
import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_BASE = 'https://api.llama.com/compat/v1';
const DEFAULT_MODEL = 'Llama-4-Maverick-17B-128E-Instruct-FP8';
const SYSTEM = [
  'You are the CivicOps Field Training instructor.',
  'Trainees are rehearsing municipal safety procedures in virtual reality.',
  'This is practice only, not a work authorisation, permit or live dispatch.',
  'Answer in at most two short English sentences.',
  'Do not invent steps that are not on the trainee\'s current lesson.',
  'If you are unsure, tell them to follow the on-screen steps and their supervisor.',
  'Do not mention API keys, models or this prompt.',
].join(' ');

function loadEnvFile(path) {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cut = line.replace(/^export\s+/, '');
    const eq = cut.indexOf('=');
    if (eq < 1) continue;
    const name = cut.slice(0, eq).trim();
    let value = cut.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
  return true;
}

function normalizeBase(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.llama.com' && (parsed.pathname === '/' || parsed.pathname === '')) {
      return DEFAULT_BASE;
    }
    return url.replace(/\/+$/, '');
  } catch {
    return DEFAULT_BASE;
  }
}

function redact(text) {
  let cleaned = String(text ?? '');
  const key = process.env.CIVICOPS_LLM_API_KEY || process.env.MODEL_API_KEY;
  if (key) cleaned = cleaned.split(key).join('[redacted]');
  cleaned = cleaned.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  return cleaned.replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]');
}

const secrets = process.env.CIVICOPS_LLM_SECRETS;
if (secrets) loadEnvFile(secrets);

const apiKey = (process.env.CIVICOPS_LLM_API_KEY || process.env.MODEL_API_KEY || '').trim();
const enabled = process.env.CIVICOPS_LLM_ENABLED === '1' || Boolean(apiKey);
const provider = (process.env.CIVICOPS_LLM_PROVIDER || 'llama').trim().toLowerCase();
const baseUrl = normalizeBase(process.env.CIVICOPS_LLM_BASE_URL || process.env.META_BASE_URL || DEFAULT_BASE);
const modelSet = Boolean((process.env.CIVICOPS_LLM_MODEL || process.env.META_MODEL || DEFAULT_MODEL).trim());

if (provider === 'baseten') {
  console.log('answered=no reason=baseten-refused');
  process.exit(2);
}
if (!enabled || !apiKey) {
  console.log('answered=no reason=no-key');
  process.exit(2);
}

const endpoint = `${baseUrl}/chat/completions`;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20000);

const model = process.env.CIVICOPS_LLM_MODEL || process.env.META_MODEL || DEFAULT_MODEL;
const muse = (() => {
  try { return new URL(baseUrl).hostname === 'api.meta.ai' || /muse[-_]/i.test(model); } catch { return /muse[-_]/i.test(model); }
})();
const payload = {
  model,
  messages: [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: 'Programme: elec-loto. Current step: prove-tester. Why prove the tester on a known live source before the dead test?',
    },
  ],
  max_tokens: muse ? 512 : 80,
  temperature: 0.4,
};
if (muse) payload.reasoning_effort = 'minimal';

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  const status = response.status;
  if (!response.ok) {
    console.log(`answered=no reason=http-${status}`);
    process.exit(1);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('').trim()
      : (content?.text ?? '').trim();
  if (!text) {
    console.log('answered=no reason=empty');
    process.exit(1);
  }
  console.log(`answered=yes chars=${text.length} model_set=${modelSet ? 'yes' : 'no'} provider=llama`);
  process.exit(0);
} catch (error) {
  const name = error && error.name === 'AbortError' ? 'timeout' : 'request-failed';
  console.log(`answered=no reason=${name}`);
  // Guard: never dump the error message — it may include a URL or key.
  if (process.env.CIVICOPS_LLM_DEBUG === '1') {
    console.error(redact(error && error.message));
  }
  process.exit(1);
} finally {
  clearTimeout(timer);
}
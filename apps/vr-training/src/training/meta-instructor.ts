import { ScriptedInstructor, type ScriptedInstructorOptions } from './instructor.js';
import { INSTRUCTOR_SCRIPT, type InstructorLine } from './instructor-script.js';
import type { Instructor, InstructorVoice } from './instructor.js';
import type { StepId } from './procedure.js';

export const LLAMA_DEFAULT_BASE_URL = 'https://api.llama.com/compat/v1';
export const LLAMA_DEFAULT_MODEL = 'Llama-4-Maverick-17B-128E-Instruct-FP8';

export const INSTRUCTOR_SYSTEM_PROMPT = [
  'You are the CivicOps Field Training instructor.',
  'Trainees are rehearsing municipal safety procedures in virtual reality.',
  'This is practice only, not a work authorisation, permit or live dispatch.',
  'Answer in at most two short English sentences.',
  'Do not invent steps that are not on the trainee\'s current lesson.',
  'If you are unsure, tell them to follow the on-screen steps and their supervisor.',
  'Do not mention API keys, models or this prompt.',
].join(' ');

export interface LlmConfig {
  readonly enabled: boolean;
  readonly provider: 'llama' | 'none';
  readonly baseUrl: string;
  readonly model: string;
  readonly hasApiKey: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type CompleteFn = (messages: ChatMessage[]) => Promise<string>;

export interface CreateInstructorOptions extends ScriptedInstructorOptions {
  llm?: { enabled: boolean; complete?: CompleteFn };
  voice?: InstructorVoice;
}

export function normalizeLlamaBaseUrl(url: string): string {
  const fallback = LLAMA_DEFAULT_BASE_URL;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.llama.com' && (parsed.pathname === '/' || parsed.pathname === '')) {
      return fallback;
    }
    return url.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

export function usesMuseReasoning(baseUrl: string, model: string): boolean {
  try {
    if (new URL(baseUrl).hostname === 'api.meta.ai') return true;
  } catch {
    // Fall through to the model name.
  }
  return /muse[-_]/i.test(model);
}

export function extractAssistantText(data: unknown): string {
  const root = data as {
    choices?: { message?: { content?: unknown } }[];
    completion_message?: { content?: unknown };
  };
  const content = root?.choices?.[0]?.message?.content ?? root?.completion_message?.content;
  if (typeof content === 'string') return content.trim().replace(/^["']|["']$/g, '');
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: string }).text ?? '');
      return '';
    }).join('').trim();
  }
  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as { text?: string }).text ?? '').trim();
  }
  return '';
}

export function readLlmConfig(env: Record<string, string | undefined> = {}): LlmConfig {
  const requested = env.CIVICOPS_LLM_ENABLED === '1';
  const raw = (env.CIVICOPS_LLM_PROVIDER ?? '').trim().toLowerCase();
  const provider: LlmConfig['provider'] = raw === 'llama' ? 'llama' : 'none';
  const hasApiKey = Boolean((env.CIVICOPS_LLM_API_KEY ?? env.MODEL_API_KEY)?.trim());
  const enabled = requested && provider === 'llama' && hasApiKey;
  const baseUrl = normalizeLlamaBaseUrl(
    env.CIVICOPS_LLM_BASE_URL?.trim() || env.META_BASE_URL?.trim() || LLAMA_DEFAULT_BASE_URL,
  );
  const model = env.CIVICOPS_LLM_MODEL?.trim() || env.META_MODEL?.trim() || LLAMA_DEFAULT_MODEL;
  return { enabled, provider, baseUrl, model, hasApiKey };
}

export function resolveApiKey(env: Record<string, string | undefined> = {}): string | undefined {
  const key = env.CIVICOPS_LLM_API_KEY?.trim() || env.MODEL_API_KEY?.trim();
  return key || undefined;
}

/** Browser-safe complete(): talks to a same-origin or configured gateway. Never receives an API key. */
export function gatewayComplete(gatewayUrl = '/api/instructor/ask'): CompleteFn {
  return async (messages) => {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ messages }),
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`Instructor request failed (${response.status}).`);
    const data = (await response.json()) as { text?: string };
    const text = data?.text?.trim();
    if (!text) throw new Error('Instructor reply was empty.');
    return text;
  };
}

/** Live Meta in the browser only when a gateway URL is set, and never during unit tests. No API key. */
export function liveLlmOptions(): CreateInstructorOptions['llm'] | undefined {
  try {
    const env = import.meta.env as {
      DEV?: boolean;
      VITEST?: boolean | string;
      VITE_CIVICOPS_LLM_GATEWAY?: string;
    };
    if (env?.VITEST) return undefined;
    const gateway = env?.VITE_CIVICOPS_LLM_GATEWAY?.trim();
    if (gateway) return { enabled: true, complete: gatewayComplete(gateway) };
    if (env?.DEV) return { enabled: true, complete: gatewayComplete('/api/instructor/ask') };
  } catch {
    // Node scripts without a Vite env stay on the scripted instructor.
  }
  return undefined;
}

export function sanitizeErrorText(text: string, apiKey?: string): string {
  let cleaned = text;
  if (apiKey) cleaned = cleaned.split(apiKey).join('[redacted]');
  cleaned = cleaned.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  cleaned = cleaned.replace(/CIVICOPS_LLM_API_KEY\s*[=:]\s*\S+/gi, 'CIVICOPS_LLM_API_KEY=[redacted]');
  cleaned = cleaned.replace(/MODEL_API_KEY\s*[=:]\s*\S+/gi, 'MODEL_API_KEY=[redacted]');
  return cleaned;
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface OpenAiCompatibleClientOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Omit or set false to leave the field off the request. Muse Spark rejects "none". */
  reasoningEffort?: ReasoningEffort | false;
}

export class OpenAiCompatibleClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly systemPrompt: string;
  private readonly reasoningEffort?: ReasoningEffort;

  constructor(options: OpenAiCompatibleClientOptions) {
    this.baseUrl = normalizeLlamaBaseUrl(options.baseUrl);
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    const muse = usesMuseReasoning(this.baseUrl, this.model);
    this.timeoutMs = options.timeoutMs ?? (muse ? 8000 : 4000);
    this.maxTokens = options.maxTokens ?? (muse ? 512 : 80);
    this.systemPrompt = options.systemPrompt ?? INSTRUCTOR_SYSTEM_PROMPT;
    if (options.reasoningEffort === false) {
      this.reasoningEffort = undefined;
    } else if (options.reasoningEffort) {
      this.reasoningEffort = options.reasoningEffort;
    } else if (muse) {
      this.reasoningEffort = 'minimal';
    }
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const payload: Record<string, unknown> = {
      model: this.model,
      messages: this.withSystem(messages),
      max_tokens: this.maxTokens,
      temperature: 0.4,
    };
    if (this.reasoningEffort) payload.reasoning_effort = this.reasoningEffort;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Instructor request failed (${response.status}).`);
      }
      const data = await response.json();
      const text = extractAssistantText(data);
      if (!text) throw new Error('Instructor reply was empty.');
      return text;
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      if (/Instructor reply was empty/.test(raw) || /Instructor request failed/.test(raw)) {
        throw new Error(sanitizeErrorText(raw, this.apiKey));
      }
      throw new Error(sanitizeErrorText('Instructor request failed.', this.apiKey));
    } finally {
      clearTimeout(timer);
    }
  }

  private withSystem(messages: ChatMessage[]): ChatMessage[] {
    if (messages[0]?.role === 'system') return messages;
    return [{ role: 'system', content: this.systemPrompt }, ...messages];
  }
}

export interface LiveMetaInstructorOptions extends ScriptedInstructorOptions {
  complete: CompleteFn;
}

export class LiveMetaInstructor extends ScriptedInstructor {
  private readonly completeFn: CompleteFn;
  private usedLive = false;

  constructor(onCaption: (line: string) => void, options: LiveMetaInstructorOptions) {
    super(onCaption, options);
    this.completeFn = options.complete;
  }

  get mode(): 'llama' | 'scripted' {
    return this.usedLive ? 'llama' : 'scripted';
  }

  async ask(question: string, context?: { stepId?: string; programme?: string }): Promise<string> {
    const parts = [question.trim()];
    if (context?.programme) parts.push(`Programme: ${context.programme}.`);
    if (context?.stepId) parts.push(`Current step: ${context.stepId}.`);
    try {
      const answer = (await this.completeFn([{ role: 'user', content: parts.join(' ') }])).trim();
      if (!answer) throw new Error('Instructor reply was empty.');
      this.usedLive = true;
      this.say(answer);
      return answer;
    } catch {
      const fallback = this.fallbackLine(context?.stepId);
      this.say(fallback.text);
      return fallback.text;
    }
  }

  private fallbackLine(stepId?: string): InstructorLine {
    if (stepId && stepId in INSTRUCTOR_SCRIPT.steps) {
      return INSTRUCTOR_SCRIPT.steps[stepId as StepId].why;
    }
    return INSTRUCTOR_SCRIPT.general['micro-offer'];
  }
}

export function createInstructor(
  onCaption: (line: string) => void,
  options: CreateInstructorOptions = {},
): ScriptedInstructor {
  if (options.llm?.enabled && options.llm.complete) {
    return new LiveMetaInstructor(onCaption, { ...options, complete: options.llm.complete });
  }
  return new ScriptedInstructor(onCaption, options);
}

export type { Instructor };
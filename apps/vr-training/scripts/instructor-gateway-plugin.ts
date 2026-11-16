import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  OpenAiCompatibleClient,
  readLlmConfig,
  resolveApiKey,
  sanitizeErrorText,
  type ChatMessage,
} from '../src/training/meta-instructor.js';

const ASK = '/api/instructor/ask';
const HEALTH = '/api/instructor/health';
const LIMIT = 16_384;

function pathname(url?: string): string {
  return (url ?? '').split('?')[0] ?? '';
}

function readBody(req: IncomingMessage, limit = LIMIT): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Dev-only gateway. The API key stays in the Node process that runs Vite.
 * It is never written into the browser bundle.
 */
export function instructorGateway(): Plugin {
  return {
    name: 'civicops-instructor-gateway',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = pathname(req.url);
        if (path === HEALTH && req.method === 'GET') {
          const config = readLlmConfig(process.env);
          send(res, 200, { live: config.enabled, provider: config.enabled ? config.provider : 'none' });
          return;
        }
        if (path !== ASK || req.method !== 'POST') {
          next();
          return;
        }
        const apiKey = resolveApiKey(process.env);
        const config = readLlmConfig(process.env);
        if (!config.enabled || !apiKey) {
          send(res, 503, { error: 'instructor-disabled' });
          return;
        }
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as { messages?: ChatMessage[] };
          const messages = Array.isArray(body.messages)
            ? body.messages.filter((message) => message && typeof message.content === 'string')
            : [];
          if (!messages.length) {
            send(res, 400, { error: 'messages-required' });
            return;
          }
          const client = new OpenAiCompatibleClient({
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey,
            timeoutMs: 12000,
            maxTokens: 512,
          });
          const text = await client.complete(messages);
          send(res, 200, { text });
        } catch (error) {
          const raw = error instanceof Error ? error.message : 'Instructor request failed.';
          send(res, 502, { error: sanitizeErrorText(raw, apiKey) });
        }
      });
    },
  };
}
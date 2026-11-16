import type { TrainingAttempt } from './contracts.js';

export interface SyncResult {
  status: 'local' | 'synced' | 'failed';
  message?: string;
}

function browserSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

/** No pairing or secret is embedded. Sync is explicitly enabled only by ?api=. */
export class CivicOpsClient {
  readonly apiUrl: string | undefined;
  readonly demoMode: boolean;
  private readonly invalidApi: boolean;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly synced = new Set<string>();
  private readonly pending = new Map<string, Promise<SyncResult>>();

  constructor(search = browserSearch(), fetchFn?: typeof fetch) {
    const api = new URLSearchParams(search).get('api');
    let apiUrl: string | undefined;
    if (api) {
      try {
        const url = new URL(api);
        if ((url.protocol === 'https:' || url.protocol === 'http:')
          && !url.username && !url.password && !url.search && !url.hash) {
          apiUrl = url.href.replace(/\/+$/, '');
        }
      } catch {
        // A malformed URL never enables network traffic.
      }
    }
    this.apiUrl = apiUrl;
    this.invalidApi = api !== null && !apiUrl;
    this.demoMode = api === null;
    this.fetchFn = fetchFn ?? (typeof fetch === 'undefined' ? undefined : fetch.bind(globalThis));
  }

  syncAttempt(attempt: TrainingAttempt): Promise<SyncResult> {
    if (this.invalidApi) return Promise.resolve({ status: 'failed', message: 'The CivicOps API URL must be an absolute HTTP or HTTPS URL without credentials.' });
    if (!this.apiUrl) return Promise.resolve({ status: 'local', message: 'Demo mode: results saved on this device.' });
    if (this.synced.has(attempt.attemptId)) return Promise.resolve({ status: 'synced' });
    const active = this.pending.get(attempt.attemptId);
    if (active) return active;

    const request = this.postAttempt(attempt).then((result) => {
      this.pending.delete(attempt.attemptId);
      if (result.status === 'synced') this.synced.add(attempt.attemptId);
      return result;
    });
    this.pending.set(attempt.attemptId, request);
    return request;
  }

  private async postAttempt(attempt: TrainingAttempt): Promise<SyncResult> {
    if (!this.fetchFn) return { status: 'failed', message: 'Sync unavailable. Results remain on this device.' };
    try {
      const response = await this.fetchFn(`${this.apiUrl}/api/training/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.attemptId },
        body: JSON.stringify(attempt),
        credentials: 'omit',
      });
      if (!response.ok) return { status: 'failed', message: `CivicOps returned HTTP ${response.status}. Results remain on this device; retry is available.` };
      return { status: 'synced' };
    } catch {
      return { status: 'failed', message: 'Could not reach CivicOps. Results remain on this device; retry is available.' };
    }
  }
}

/** Download only; this does not contact CivicOps or any other service. */
export function exportResults(attempts: readonly TrainingAttempt[]): void {
  const blob = new Blob([JSON.stringify(attempts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'civicops-training-attempts.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Retain the object URL long enough for the browser to begin its download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

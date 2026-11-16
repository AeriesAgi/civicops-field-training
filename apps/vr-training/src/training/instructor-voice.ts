export interface VoiceLine { readonly id: string; readonly text: string; }

/** Voice providers receive an ID and its already-captioned text. They never own captions. */
export interface InstructorVoice {
  speak(line: VoiceLine, append?: boolean, onEnd?: () => void): void;
  setVolume(volume: number): void;
  unlock(): void;
  stop(): void;
  dispose(): void;
}

export function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.7;
}

/** Device/browser speech needs no credentials, microphone or application network service. */
export class BrowserSpeechVoice implements InstructorVoice {
  private disposed = false;
  private volume = 0.7;

  constructor(private readonly enabled = true) {}

  speak(line: VoiceLine, append = false, onEnd?: () => void): void {
    if (this.disposed || !this.enabled || typeof speechSynthesis === 'undefined'
      || typeof SpeechSynthesisUtterance === 'undefined') { onEnd?.(); return; }
    if (!append) speechSynthesis.cancel();
    if (this.volume === 0) { onEnd?.(); return; }
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.lang = 'en';
    utterance.rate = 0.95;
    utterance.volume = this.volume;
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    speechSynthesis.speak(utterance);
  }

  setVolume(volume: number): void {
    const next = clampVolume(volume);
    if (next === 0 && this.volume !== 0) this.stop();
    this.volume = next;
  }
  unlock(): void {}
  stop(): void { if (this.enabled && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); }
  dispose(): void { if (this.disposed) return; this.stop(); this.disposed = true; }
}

export interface InstructorAudioManifest {
  readonly schema: 'civicops.instructor-audio.v1';
  readonly language: 'en';
  /** A populated entry uses its own ID as the basename, for example apply-lock.why.mp3. */
  readonly lines: Readonly<Record<string, string>>;
}

export interface LocalVoiceOptions {
  baseUrl?: string;
  fallback?: InstructorVoice;
  loadManifest?: (url: string) => Promise<unknown>;
  createAudio?: () => HTMLAudioElement;
}

export function parseAudioManifest(input: unknown): InstructorAudioManifest | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const candidate = input as Record<string, unknown>;
  if (candidate.schema !== 'civicops.instructor-audio.v1' || candidate.language !== 'en'
    || !candidate.lines || typeof candidate.lines !== 'object' || Array.isArray(candidate.lines)) return undefined;
  const lines: Record<string, string> = {};
  for (const [id, file] of Object.entries(candidate.lines)) {
    // Voice files can only come from this local language directory, never a remote URL/token.
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)
      || typeof file !== 'string' || (file !== `${id}.mp3` && file !== `${id}.ogg`)) return undefined;
    lines[id] = file;
  }
  return { schema: 'civicops.instructor-audio.v1', language: 'en', lines };
}

/** Rendered voice is opt-in per manifest line. Missing/unplayable files use browser speech. */
export class LocalInstructorVoice implements InstructorVoice {
  private readonly fallback: InstructorVoice;
  private readonly directory: string;
  private readonly loadManifest: (url: string) => Promise<unknown>;
  private readonly createAudio: () => HTMLAudioElement;
  private manifest?: InstructorAudioManifest;
  private audio?: HTMLAudioElement;
  private volume = 0.7;
  private disposed = false;
  private unlocked = false;
  private generation = 0;
  private busy = false;
  private readonly queue: { line: VoiceLine; onEnd?: () => void }[] = [];

  constructor(options: LocalVoiceOptions = {}) {
    this.fallback = options.fallback ?? new BrowserSpeechVoice();
    const base = options.baseUrl ?? import.meta.env.BASE_URL;
    this.directory = `${base.endsWith('/') ? base : `${base}/`}audio/instructor/en/`;
    this.loadManifest = options.loadManifest ?? (async (url) => {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error('Local voice manifest is unavailable.');
      return response.json();
    });
    this.createAudio = options.createAudio ?? (() => new Audio());
  }

  unlock(): void {
    if (this.disposed || this.unlocked) return;
    this.unlocked = true;
    this.fallback.unlock();
    // The empty shipped manifest adds no voice payload. This fetch is local and XR/gesture-triggered.
    void this.loadManifest(`${this.directory}manifest.json`).then((data) => {
      if (!this.disposed) this.manifest = parseAudioManifest(data);
    }).catch(() => {});
  }

  speak(line: VoiceLine, append = false, onEnd?: () => void): void {
    if (this.disposed) return;
    if (!append) {
      this.generation++;
      this.queue.length = 0;
      this.pauseAudio();
      if (this.busy) this.fallback.stop();
      this.busy = false;
    }
    this.queue.push({ line, onEnd });
    this.playNext();
  }

  private playNext(): void {
    if (this.disposed || this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    const { line, onEnd } = next;
    const generation = this.generation;
    this.busy = true;
    let finished = false;
    const finish = () => {
      if (finished || this.disposed || generation !== this.generation) return;
      finished = true;
      this.busy = false;
      onEnd?.();
      this.playNext();
    };
    const file = this.manifest?.lines[line.id];
    if (!file || !this.unlocked) { this.fallback.speak(line, false, finish); return; }
    this.fallback.stop();
    if (this.volume === 0) { finish(); return; }
    let fallbackStarted = false;
    const useFallback = () => {
      if (fallbackStarted || this.disposed || generation !== this.generation) return;
      fallbackStarted = true;
      this.fallback.speak(line, false, finish);
    };
    try {
      this.audio ??= this.createAudio();
      const audio = this.audio;
      audio.src = `${this.directory}${file}`;
      audio.volume = this.volume;
      audio.onended = finish;
      audio.onerror = useFallback;
      void audio.play().catch(useFallback);
    } catch {
      useFallback();
    }
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    this.fallback.setVolume(this.volume);
    if (this.audio) this.audio.volume = this.volume;
  }

  private pauseAudio(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  stop(): void {
    this.generation++;
    this.busy = false;
    this.queue.length = 0;
    this.pauseAudio();
    this.fallback.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.busy = false;
    this.queue.length = 0;
    this.pauseAudio();
    if (this.audio) { this.audio.removeAttribute('src'); this.audio.load(); }
    this.fallback.dispose();
  }
}

import type { LessonView, ResultView } from './lesson-view.js';

/**
 * Small window-event bridge between ECS systems and the DOM title screen / desktop HUD.
 * Systems never import DOM code; the HUD never reaches into ECS state.
 */
export type ToastTone = 'good' | 'warn' | 'bad' | 'info';

interface Host {
  civicOpsDesktop?: boolean;
  civicOpsLessonView?: LessonView;
  civicOpsResultView?: ResultView | null;
  civicOpsToasts?: { message: string; tone: ToastTone }[];
  dispatchEvent?: (event: Event) => boolean;
}

const host = (): Host => (typeof window === 'undefined' ? {} : window as unknown as Host);

/** True when the trainee chose "Try on desktop" on the title screen (or ?desktop=1). */
export function isDesktopSession(): boolean {
  const h = host();
  if (h.civicOpsDesktop !== undefined) return h.civicOpsDesktop;
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('desktop') === '1';
}

export function setDesktopSession(on: boolean): void { host().civicOpsDesktop = on; }

function emit(type: string, detail: unknown): void {
  const h = host();
  if (typeof CustomEvent === 'undefined' || !h.dispatchEvent) return;
  h.dispatchEvent(new CustomEvent(type, { detail }));
}

export function publishLesson(view: LessonView): void { host().civicOpsLessonView = view; emit('civicops:lesson', view); }
export function publishResult(view: ResultView | undefined): void { host().civicOpsResultView = view ?? null; emit('civicops:result', view ?? null); }
export function publishToast(message: string, tone: ToastTone): void {
  if (!message) return;
  const h = host();
  (h.civicOpsToasts ??= []).push({ message, tone });
  if (h.civicOpsToasts.length > 20) h.civicOpsToasts.shift();
  emit('civicops:toast', { message, tone });
}

export function sendDesktopPick(name: string): void { emit('civicops:desktop-pick', { name }); }
export function sendDesktopCommand(cmd: 'retry' | 'hint' | 'put-down' | 'notify' | 'safe-begin' | 'safe-end'): void { emit('civicops:desktop-command', { cmd }); }
export function requestModule(moduleId: string): void { emit('civicops:open-module', { moduleId }); }

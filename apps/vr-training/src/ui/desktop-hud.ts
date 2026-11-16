import { browserStorage } from '../training/browser-storage.js';
import { loadSettings } from '../training/accessibility-settings.js';
import { button, el } from './dom.js';
import { isDesktopSession, requestModule, sendDesktopCommand, setDesktopSession, type ToastTone } from './desktop-bridge.js';
import type { LessonView, ResultView } from './lesson-view.js';
import type { TitleScreen } from './title-screen.js';

const host = () => window as unknown as { civicOpsModule?: string; civicOpsTitleOpen?: boolean; civicOpsHudBlocking?: boolean; civicOpsLessonView?: LessonView };

/**
 * Desktop lesson HUD: mission brief, live checklist, captions, tool-in-hand chip,
 * contextual radio / hold-to-confirm actions, feedback toasts and the result screen.
 */
export class DesktopHud {
  readonly root: HTMLDivElement;
  private readonly order: HTMLDivElement;
  private readonly current: HTMLDivElement;
  private readonly instruction: HTMLDivElement;
  private readonly list: HTMLUListElement;
  private readonly scoreValue: HTMLElement;
  private readonly hintValue: HTMLElement;
  private readonly errorValue: HTMLElement;
  private readonly caption: HTMLDivElement;
  private readonly held: HTMLDivElement;
  private readonly reading: HTMLDivElement;
  private readonly action: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly hover: HTMLDivElement;
  private modal?: HTMLElement;
  private briefPending = false;
  private lastAction = '';
  private lastSteps = '';

  constructor(private readonly title: TitleScreen, parent: HTMLElement = document.body) {
    this.root = el('div', { className: 'co-hud co-hidden', attrs: { 'data-testid': 'desktop-hud' } });
    this.current = el('div', { className: 'co-current', attrs: { 'data-testid': 'hud-current' } });
    this.instruction = el('div', { className: 'co-instr' });
    this.list = el('ul', { className: 'co-list', attrs: { 'data-testid': 'hud-steps' } });
    this.order = el('div', { className: 'co-box co-order' }, [el('div', { className: 'co-eyebrow', text: 'Work order DEMO0001 · Streetlight fault' }), this.current, this.instruction, this.list]);
    const stat = (label: string) => { const value = el('b', { text: '0' }); return { value, node: el('div', { className: 'co-stat' }, [value, el('span', { text: label })]) }; };
    const score = stat('SCORE'), hints = stat('HINTS'), errors = stat('ERRORS');
    this.scoreValue = score.value; this.hintValue = hints.value; this.errorValue = errors.value;
    this.scoreValue.setAttribute('data-testid', 'hud-score');
    const stats = el('div', { className: 'co-box co-stats' }, [score.node, hints.node, errors.node,
      button('Hint (H)', () => sendDesktopCommand('hint'), 'co-small', undefined, { 'data-testid': 'hud-hint' }),
      button('Menu', () => this.toMenu(), 'co-small', undefined, { 'data-testid': 'hud-menu' })]);
    this.caption = el('div', { className: 'co-box co-caption', attrs: { 'data-testid': 'hud-caption', 'aria-live': 'polite' } });
    this.held = el('div', { className: 'co-box co-held co-hidden', attrs: { 'data-testid': 'hud-held' } });
    this.reading = el('div', { className: 'co-box co-reading co-hidden', attrs: { 'data-testid': 'hud-reading' } });
    this.action = el('div', { className: 'co-action' });
    this.toasts = el('div', { className: 'co-toasts', attrs: { 'data-testid': 'hud-toasts', 'aria-live': 'assertive' } });
    this.hover = el('div', { className: 'co-hover co-hidden' });
    this.root.append(this.order, stats, this.reading, this.caption, this.held, this.action, this.toasts, this.hover);
    parent.append(this.root);
    window.addEventListener('civicops:lesson', (event) => this.render((event as CustomEvent<LessonView>).detail));
    window.addEventListener('civicops:result', (event) => { const view = (event as CustomEvent<ResultView | null>).detail; if (view) this.showResult(view); else this.closeModal(); });
    window.addEventListener('civicops:toast', (event) => { const detail = (event as CustomEvent<{ message: string; tone: ToastTone }>).detail; if (this.visible()) this.toast(detail.message, detail.tone); });
    window.addEventListener('civicops:hover', (event) => {
      const detail = (event as CustomEvent<{ label: string; x: number; y: number }>).detail;
      this.hover.classList.toggle('co-hidden', !detail.label || !this.visible());
      this.hover.textContent = detail.label; this.hover.style.left = `${detail.x}px`; this.hover.style.top = `${detail.y}px`;
    });
    window.addEventListener('civicops:module', (event) => this.onModule((event as CustomEvent<{ module: string; switching: boolean }>).detail));
    window.addEventListener('civicops:desktop-start', () => { this.briefPending = true; });
    window.addEventListener('keydown', (event) => {
      if (event.key === ' ' && this.lastAction === 'safe-to-work') this.action.querySelector('.co-act')?.classList.add('co-holding');
      if (event.key === 'Enter' && this.modal?.dataset.kind === 'brief') { event.preventDefault(); this.closeModal(); }
    });
    window.addEventListener('keyup', (event) => { if (event.key === ' ') this.action.querySelector('.co-act')?.classList.remove('co-holding'); });
  }

  private visible(): boolean { return !this.root.classList.contains('co-hidden'); }

  private onModule(detail: { module: string; switching: boolean }): void {
    if (detail.switching) return;
    const lesson = detail.module === 'elec-loto' && isDesktopSession() && !host().civicOpsTitleOpen;
    this.root.classList.toggle('co-hidden', !lesson);
    if (!lesson) { this.closeModal(); return; }
    const settings = loadSettings(browserStorage(), '');
    this.root.classList.toggle('co-caption-L', settings.captionSize === 'L');
    this.root.classList.toggle('co-caption-XL', settings.captionSize === 'XL');
    this.caption.classList.toggle('co-hidden', !settings.captions);
    window.setTimeout(() => this.title.curtainOff(), 250);
    if (this.briefPending) { this.briefPending = false; this.showBrief(); }
    const view = host().civicOpsLessonView; if (view) this.render(view);
  }

  render(view: LessonView): void {
    if (!view) return;
    this.current.textContent = view.current ? (view.current.label.startsWith('Step') ? view.current.label : `Step ${view.current.order} of ${view.steps.length} · ${view.current.label}`) : 'Attempt complete';
    this.instruction.textContent = view.current?.instruction ?? '';
    const key = view.steps.map(step => step.status + step.label).join('|');
    if (key !== this.lastSteps) {
      this.lastSteps = key;
      this.list.replaceChildren(...view.steps.map(step => el('li', { className: step.status === 'done' ? 'co-done' : step.status === 'current' ? 'co-current-row' : step.status === 'missed' ? 'co-missed' : '', attrs: { 'data-step': step.id, 'data-status': step.status } },
        [el('i', { text: step.status === 'done' ? '✓' : step.status === 'missed' ? '!' : String(step.order) }), step.label])));
    }
    this.scoreValue.textContent = String(view.score);
    this.hintValue.textContent = String(view.hints);
    this.errorValue.textContent = String(view.errors);
    this.caption.textContent = view.caption || 'Follow the work order.';
    this.held.classList.toggle('co-hidden', !view.held);
    if (view.held) this.held.replaceChildren(el('span', { text: `In hand: ${view.held}` }), button('Put back (Esc)', () => sendDesktopCommand('put-down'), 'co-small'));
    this.reading.classList.toggle('co-hidden', !view.reading);
    this.reading.textContent = view.reading ? `Tester · ${view.reading}` : '';
    const action = view.action ?? '';
    if (action !== this.lastAction) {
      this.lastAction = action;
      this.action.replaceChildren();
      if (action === 'notify-control') this.action.append(button('📻 Radio control (R)', () => sendDesktopCommand('notify'), 'co-act', undefined, { 'data-testid': 'hud-notify' }));
      if (action === 'safe-to-work') {
        const hold = el('button', { className: 'co-act', attrs: { type: 'button', 'data-testid': 'hud-safe' } }, [el('i', { className: 'co-fill' }), el('span', { text: 'Hold: safe to work (Space)' })]);
        const begin = (event: PointerEvent) => { event.preventDefault(); hold.classList.add('co-holding'); sendDesktopCommand('safe-begin'); };
        const end = () => { if (!hold.classList.contains('co-holding')) return; hold.classList.remove('co-holding'); sendDesktopCommand('safe-end'); };
        hold.addEventListener('pointerdown', begin); hold.addEventListener('pointerup', end); hold.addEventListener('pointerleave', end);
        this.action.append(hold);
      }
    }
  }

  toast(message: string, tone: ToastTone): void {
    const node = el('div', { className: `co-toast co-${tone}`, text: message });
    this.toasts.prepend(node);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove();
    window.setTimeout(() => node.remove(), 3700);
  }

  private setModal(node: HTMLElement, kind: string): void {
    this.closeModal();
    node.dataset.kind = kind;
    this.modal = node;
    this.root.append(node);
    host().civicOpsHudBlocking = true;
  }

  private closeModal(): void {
    this.modal?.remove(); this.modal = undefined;
    host().civicOpsHudBlocking = false;
  }

  showBrief(): void {
    const begin = button('Begin (Enter)', () => this.closeModal(), 'co-act', undefined, { 'data-testid': 'brief-begin' });
    const box = el('div', { className: 'co-box' }, [
      el('div', { className: 'co-eyebrow', text: 'Work order DEMO0001 · Electrical' }),
      el('h2', { text: 'Streetlight SL-3 is flickering. Make it safe to work on.' }),
      el('p', { className: 'co-instr', text: 'You are at the mini-sub. Isolate the supply, fit your lock and tag, try to switch it back on, then prove the circuit dead with the tester.' }),
      el('div', { className: 'co-brief-steps' }, [['1', 'Isolate'], ['2', 'Lock'], ['3', 'Tag'], ['4', 'Try'], ['5', 'Test']].map(([n, label]) => el('div', {}, [el('b', { text: n }), label]))),
      el('p', { className: 'co-note', text: 'Click a switch to operate it. Click a tool to pick it up, then click where it goes. Drag to look around. Out-of-order steps cost points; unsafe actions stop the attempt.' }),
      el('div', { className: 'co-row' }, [begin]),
    ]);
    this.setModal(el('div', { className: 'co-modal', attrs: { 'data-testid': 'mission-brief' } }, [box]), 'brief');
    begin.focus({ preventScroll: true });
  }

  showResult(view: ResultView): void {
    const ring = el('div', { className: 'co-ring', attrs: { style: `--p:${view.score}` } }, [el('span', { text: String(view.score) })]);
    const box = el('div', { className: `co-box ${view.passed ? '' : 'co-fail'}` }, [
      el('div', { className: 'co-eyebrow', text: view.passed ? 'Practice pass · Electrical isolation' : 'Not passed · Electrical isolation' }),
      el('div', { className: 'co-score' }, [ring, el('div', {}, [
        el('h2', { text: view.headline }),
        el('p', { className: 'co-instr', text: `Time ${view.time} · Errors ${view.errors} · Critical checks ${view.critical}` }),
      ])]),
      el('div', { className: 'co-result-steps', attrs: { 'data-testid': 'result-steps' } }, view.steps.map(step => el('span', { className: step.ok ? 'co-ok' : 'co-no', text: `${step.order}. ${step.label}` }))),
      el('p', { className: 'co-note', text: 'Practice evidence saved on this device. Not a qualification or an authorisation to work.' }),
      el('div', { className: 'co-row' }, [
        button('Try again', () => { this.closeModal(); sendDesktopCommand('retry'); }, 'co-act', undefined, { 'data-testid': 'result-retry' }),
        button('Main menu', () => this.toMenu(), 'co-small', undefined, { 'data-testid': 'result-menu' }),
      ]),
    ]);
    this.setModal(el('div', { className: 'co-modal', attrs: { 'data-testid': 'result-screen', 'data-passed': String(view.passed), 'data-score': String(view.score) } }, [box]), 'result');
  }

  private toMenu(): void {
    this.closeModal();
    this.root.classList.add('co-hidden');
    setDesktopSession(false);
    this.title.show();
    if ((host().civicOpsModule ?? 'board') !== 'board') window.dispatchEvent(new Event('civicops:jobs'));
  }
}

export { requestModule };

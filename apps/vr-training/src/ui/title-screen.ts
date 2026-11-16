import './title.css';
import { browserStorage } from '../training/browser-storage.js';
import { button, culltronMark, el } from './dom.js';
import { DESKTOP_KEYS } from './desktop-intents.js';
import { requestModule, setDesktopSession } from './desktop-bridge.js';
import { TITLE_MODULES } from './modules-catalog.js';
import { loadTitleOptions, saveTitleOptions, type TitleOptions } from './title-options.js';

export interface TitleWorld {
  launchXR(): void;
  renderer: { xr: { isPresenting: boolean; addEventListener(type: 'sessionend' | 'sessionstart', listener: () => void): void } };
}

interface Device { emulated: boolean; immersive: boolean; quest: boolean }
type Panel = 'modules' | 'options' | 'help' | 'credits';

const host = () => window as unknown as { civicOpsTitleOpen?: boolean; civicOpsModule?: string; civicOpsReducedMotion?: boolean; IWER_DEVICE?: unknown };

/**
 * Culltron title screen: a calm intro over the loading depot, then Start training,
 * module select, options, controls/help, Enter VR or Try on desktop, and credits.
 */
export class TitleScreen {
  readonly root: HTMLDivElement;
  private readonly curtain: HTMLDivElement;
  private readonly main: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly device: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
  private readonly vrButton: HTMLButtonElement;
  private readonly desktopButton: HTMLButtonElement;
  private readonly menuButtons: HTMLButtonElement[] = [];
  private world?: TitleWorld;
  private info: Device = { emulated: false, immersive: false, quest: /OculusBrowser|Quest/i.test(navigator.userAgent) };
  private options: TitleOptions;
  private panel?: HTMLElement;

  constructor(parent: HTMLElement = document.body) {
    this.options = loadTitleOptions(browserStorage(), location.search);
    this.root = el('div', { className: 'co-title co-solid', attrs: { role: 'dialog', 'aria-label': 'CivicOps Field Training title screen', 'data-testid': 'title-screen' } });
    this.curtain = el('div', { className: 'co-curtain', attrs: { 'data-testid': 'curtain' } }, [el('div', { text: 'Heading to the work site…' })]);
    const side = el('div', { className: 'co-side' });
    side.append(
      el('div', { className: 'co-brand' }, [culltronMark(), el('div', {}, [el('div', { className: 'co-brand-word', text: 'CULLTRON' }), el('div', { className: 'co-brand-sub', text: 'CIVICOPS FIELD TRAINING' })])]),
      el('h1', { className: 'co-headline' }, ['Make it safe ', el('em', { text: 'before' }), ' you work on it.']),
      el('p', { className: 'co-tag', text: 'Hands-on municipal safety practice in VR or right here in your browser.' }),
    );
    this.status = el('div', { className: 'co-loading', attrs: { 'data-testid': 'title-status' } }, [el('span', { text: 'Loading the depot and work sites…' }), el('div', { className: 'co-bar' }, [el('i')])]);
    side.append(this.status);
    const menu = el('div', { className: 'co-menu' });
    this.startButton = button('Start training', () => this.startDefault(), 'co-btn co-primary', 'Electrical isolation · hands-on', { 'data-testid': 'start-training' });
    this.vrButton = button('Enter VR', () => this.enterVR('elec-loto'), 'co-btn', 'Quest headset', { 'data-testid': 'enter-vr' });
    this.desktopButton = button('Try on desktop', () => this.startDesktop('elec-loto'), 'co-btn', 'Mouse and keyboard', { 'data-testid': 'try-desktop' });
    this.device = el('div', { className: 'co-device' });
    menu.append(
      this.startButton,
      el('div', { className: 'co-modes' }, [this.vrButton, this.desktopButton]),
      this.device,
      this.menuButton('Choose module', 'modules', 'Four field lessons'),
      this.menuButton('Options', 'options', 'Audio, hints, comfort'),
      this.menuButton('Controls & help', 'help', 'Desktop and headset'),
      this.menuButton('Credits', 'credits', 'Team and licences'),
    );
    side.append(menu);
    side.append(el('div', { className: 'co-foot' }, [el('span', { text: '© 2026 Culltron' }), el('span', { text: 'Built with Meta Immersive Web SDK' })]));
    this.main = el('div', { className: 'co-main' });
    this.main.append(
      el('div', { className: 'co-steps' }, ['Isolate', 'Lock', 'Tag', 'Try', 'Test'].map((label, index) => el('div', { className: 'co-chip' }, [el('b', { text: String(index + 1) }), label]))),
      el('p', { className: 'co-note', text: 'Illustrative training based on generic municipal practice. Follow your employer’s procedures. Practice results stay on this device.' }),
    );
    this.root.append(side, this.main);
    for (const node of [this.startButton, this.vrButton, this.desktopButton, ...this.menuButtons]) node.disabled = true;
    parent.append(this.root, this.curtain);
    document.documentElement.classList.add('co-overlay');
    this.applyMotion();
    host().civicOpsTitleOpen = true;
    const params = new URLSearchParams(location.search);
    if (params.get('title') === '0') {
      this.hide(true);
      if (params.get('desktop') !== '1') document.documentElement.classList.remove('co-overlay');
    }
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.panel) { event.preventDefault(); this.closePanel(); }
    });
  }

  private menuButton(label: string, panel: Panel, sub: string): HTMLButtonElement {
    const node = button(label, () => this.openPanel(panel), 'co-btn', sub, { 'data-testid': `menu-${panel}` });
    this.menuButtons.push(node);
    return node;
  }

  /** The world finished loading: enable the menu and describe the detected device. */
  async attach(world: TitleWorld): Promise<void> {
    this.world = world;
    world.renderer.xr.addEventListener('sessionend', () => { if (!this.isOpen()) this.show(); });
    this.info.emulated = Boolean(host().IWER_DEVICE);
    try { this.info.immersive = Boolean(await navigator.xr?.isSessionSupported('immersive-vr')); } catch { this.info.immersive = false; }
    const headset = this.info.immersive && !this.info.emulated;
    this.startButton.querySelector('small')!.textContent = headset ? 'Electrical isolation · in VR' : 'Electrical isolation · on desktop';
    this.vrButton.querySelector('span')!.textContent = headset ? 'Enter VR' : 'Enter VR (emulator)';
    this.vrButton.querySelector('small')!.textContent = headset ? 'Hands or controllers' : 'Meta Quest emulator';
    this.device.textContent = headset ? 'Headset detected. Start training opens the lesson in VR.'
      : 'No headset detected. Start training plays on desktop with mouse and keyboard.';
    this.status.classList.add('co-loaded');
    this.status.querySelector('span')!.textContent = 'Ready.';
    for (const node of [this.startButton, this.desktopButton, ...this.menuButtons]) node.disabled = false;
    this.vrButton.disabled = !this.info.immersive;
    this.root.classList.remove('co-solid');
    this.root.classList.add('co-ready');
    (headset ? this.vrButton : this.startButton).focus({ preventScroll: true });
  }

  failed(): void {
    this.status.querySelector('span')!.textContent = 'Training could not load. Reload the page to try again.';
    this.status.append(button('Reload', () => location.reload(), 'co-btn'));
  }

  isOpen(): boolean { return !this.root.classList.contains('co-hidden'); }

  show(): void {
    document.documentElement.classList.add('co-overlay');
    this.root.classList.remove('co-hidden', 'co-fading');
    host().civicOpsTitleOpen = true;
    this.curtain.classList.remove('co-on');
  }

  hide(immediate = false): void {
    host().civicOpsTitleOpen = false;
    this.closePanel();
    if (immediate) { this.root.classList.add('co-hidden'); return; }
    this.root.classList.add('co-fading');
    window.setTimeout(() => { if (!host().civicOpsTitleOpen) this.root.classList.add('co-hidden'); }, 600);
  }

  /** Fade to the site while the lesson loads; the HUD lifts the curtain when it is ready. */
  curtainOn(text = 'Heading to the work site…'): void { this.curtain.firstElementChild!.textContent = text; this.curtain.classList.add('co-on'); }
  curtainOff(): void { this.curtain.classList.remove('co-on'); }

  private save(): void {
    saveTitleOptions(browserStorage(), this.options);
    this.applyMotion();
  }

  private applyMotion(): void {
    document.documentElement.classList.toggle('co-reduced', this.options.reducedMotion);
    host().civicOpsReducedMotion = this.options.reducedMotion;
  }

  private startDefault(): void {
    if (this.info.immersive && !this.info.emulated) this.enterVR('elec-loto');
    else this.startDesktop('elec-loto');
  }

  private goTo(moduleId: string): void {
    const current = host().civicOpsModule ?? 'board';
    if (current === moduleId) {
      // Re-enter cleanly so the lesson starts in the chosen mode.
      const reopen = (event: Event) => {
        const detail = (event as CustomEvent<{ module: string; switching: boolean }>).detail;
        if (detail.module === 'board' && !detail.switching) { window.removeEventListener('civicops:module', reopen); requestModule(moduleId); }
      };
      window.addEventListener('civicops:module', reopen);
      window.dispatchEvent(new Event('civicops:jobs'));
    } else requestModule(moduleId);
  }

  startDesktop(moduleId: string): void {
    this.save();
    setDesktopSession(true);
    window.dispatchEvent(new CustomEvent('civicops:desktop-start', { detail: { moduleId } }));
    this.curtainOn();
    this.hide();
    this.goTo(moduleId);
  }

  enterVR(moduleId: string): void {
    if (!this.world) return;
    this.save();
    setDesktopSession(false);
    document.documentElement.classList.remove('co-overlay');
    this.hide(true);
    if (moduleId) this.goTo(moduleId);
    this.world.launchXR();
  }

  private closePanel(): void { this.panel?.remove(); this.panel = undefined; }

  private openPanel(kind: Panel): void {
    this.closePanel();
    const panel = el('div', { className: 'co-panel', attrs: { 'data-testid': `panel-${kind}` } });
    const close = button('← Back', () => this.closePanel(), 'co-small co-close', undefined, { 'data-testid': 'panel-back' });
    panel.append(close);
    if (kind === 'modules') this.renderModules(panel);
    if (kind === 'options') this.renderOptions(panel);
    if (kind === 'help') this.renderHelp(panel);
    if (kind === 'credits') this.renderCredits(panel);
    this.main.append(panel);
    this.panel = panel;
  }

  private renderModules(panel: HTMLElement): void {
    panel.append(el('h2', { text: 'Choose a field lesson' }), el('p', { className: 'co-note', text: 'Electrical runs on desktop and in VR. The other three lessons are built for hand tracking: open them in a Quest headset, or in the Quest emulator on desktop.' }));
    const cards = el('div', { className: 'co-cards' });
    for (const entry of TITLE_MODULES) {
      const actions = el('div', { className: 'co-row' });
      if (entry.desktop) actions.append(button('Play on desktop', () => this.startDesktop(entry.id), 'co-small', undefined, { 'data-testid': `play-desktop-${entry.id}` }));
      const vr = button(this.info.immersive && !this.info.emulated ? 'Enter VR' : 'Open in emulator', () => this.enterVR(entry.id), 'co-small', undefined, { 'data-testid': `play-vr-${entry.id}` });
      vr.disabled = !this.info.immersive;
      actions.append(vr);
      cards.append(el('div', { className: 'co-card' }, [
        el('div', { className: 'co-badges' }, [entry.desktop ? el('span', { className: 'co-badge', text: 'Desktop' }) : null, el('span', { className: 'co-badge co-vr', text: 'VR' })]),
        el('h4', { text: entry.title }), el('p', { text: entry.blurb }), actions,
      ]));
    }
    panel.append(cards);
  }

  private segment<T extends string>(values: readonly [T, string][], current: T, onPick: (value: T) => void, id: string): HTMLDivElement {
    const group = el('div', { className: 'co-seg', attrs: { role: 'group', 'data-testid': `opt-${id}` } });
    for (const [value, label] of values) {
      const node = el('button', { text: label, attrs: { type: 'button', 'aria-pressed': String(value === current) } });
      node.addEventListener('click', () => { onPick(value); for (const child of group.children) child.setAttribute('aria-pressed', 'false'); node.setAttribute('aria-pressed', 'true'); this.save(); });
      group.append(node);
    }
    return group;
  }

  private renderOptions(panel: HTMLElement): void {
    const o = this.options;
    const volume = el('input', { attrs: { type: 'range', min: '0', max: '1', step: '0.1', value: String(o.volume), 'aria-label': 'Volume', 'data-testid': 'opt-volume' } });
    const volumeLabel = el('span', { text: `${Math.round(o.volume * 100)}% · instructor voice and site sound` });
    volume.addEventListener('input', () => { o.volume = Number(volume.value); volumeLabel.textContent = `${Math.round(o.volume * 100)}% · instructor voice and site sound`; this.save(); });
    const onOff = (value: boolean, set: (next: boolean) => void, id: string) => this.segment([['on', 'On'], ['off', 'Off']] as const, value ? 'on' : 'off', (next) => set(next === 'on'), id);
    const opt = (label: string, help: string, control: HTMLElement) => el('div', { className: 'co-opt' }, [el('label', { text: label }), control, el('span', { text: help })]);
    panel.append(
      el('h2', { text: 'Options' }),
      el('div', { className: 'co-opts' }, [
        opt('Audio volume', '', el('div', {}, [volume, volumeLabel])),
        opt('Hints', 'Guided practice highlights the next target and coaches you. Assessment names nothing and only stops unsafe actions.',
          this.segment([['guided', 'Guided practice'], ['unguided', 'Assessment']] as const, o.guidance, (value) => { o.guidance = value; }, 'guidance')),
        opt('Comfort: reduced motion', 'Stops pulsing highlights, camera drift and animated effects.', onOff(o.reducedMotion, (value) => { o.reducedMotion = value; }, 'motion')),
        opt('Posture', 'Seated lowers the work 16 cm so switches and tools stay in reach.',
          this.segment([['standing', 'Standing'], ['seated', 'Seated']] as const, o.posture, (value) => { o.posture = value; }, 'posture')),
        opt('Captions', 'Instructor captions on screen and in the headset.', onOff(o.captions, (value) => { o.captions = value; }, 'captions')),
        opt('Caption size', '', this.segment([['M', 'Medium'], ['L', 'Large'], ['XL', 'Extra large']] as const, o.captionSize, (value) => { o.captionSize = value; }, 'caption-size')),
        opt('High contrast', 'Stronger panel contrast in the headset.', onOff(o.highContrast, (value) => { o.highContrast = value; }, 'contrast')),
        opt('Pre-shift briefing', 'Six optional briefing, hazard and PPE checks before each field lesson.', onOff(o.preShift, (value) => { o.preShift = value; }, 'preshift')),
      ]),
      el('p', { className: 'co-note', text: 'Options are saved on this device only.' }),
    );
  }

  private renderHelp(panel: HTMLElement): void {
    const table = (rows: readonly { keys: string; action: string }[]) => el('table', { className: 'co-table' }, [el('tbody', {}, rows.map(row => el('tr', {}, [el('td', { text: row.keys }), el('td', { text: row.action })])))]);
    panel.append(
      el('h2', { text: 'Controls & help' }),
      el('h3', { text: 'Desktop: mouse and keyboard' }), table(DESKTOP_KEYS),
      el('h3', { text: 'Quest: hands' }), table([
        { keys: 'Poke', action: 'Press switches and panel buttons with a fingertip' },
        { keys: 'Pinch', action: 'Grab the padlock, tag or tester; release to place it' },
        { keys: 'Pinch and hold', action: 'Confirm safe to work: hold until the ring fills' },
        { keys: 'Thumb tap / swipe', action: 'Teleport and snap turn (right hand)' },
      ]),
      el('h3', { text: 'Quest: controllers' }), table([
        { keys: 'Trigger', action: 'Select and press' }, { keys: 'Grip', action: 'Grab and place tools' }, { keys: 'Thumbstick', action: 'Teleport and snap turn' },
      ]),
      el('h3', { text: 'The procedure' }),
      el('p', { className: 'co-note', text: 'Identify SL-3 on the work order, notify control, switch SL-3 off, fit your personal lock, add the danger tag, try to switch it back on (the lock must hold), prove the tester on the proving unit, test SL-3 dead, re-prove the tester, then hold to confirm safe to work. Out-of-order steps cost points; unsafe actions stop the attempt.' }),
    );
  }

  private renderCredits(panel: HTMLElement): void {
    const frame = el('iframe', { attrs: { src: './credits.html', title: 'Asset credits' } });
    panel.append(
      el('h2', { text: 'Credits' }),
      el('p', {}, ['Designed and built by ', el('b', { text: 'Ashveer Ramlukan' }), ', founder and lead developer, Culltron.']),
      el('p', { className: 'co-note', text: 'Built with the Meta Immersive Web SDK and IWER emulator (MIT) and three.js (MIT). Title screen, desktop controls, sounds and the Culltron mark are original to this project. Third-party models, textures and fonts are listed below with their licences.' }),
      el('div', { className: 'co-credits' }, [frame]),
    );
  }
}

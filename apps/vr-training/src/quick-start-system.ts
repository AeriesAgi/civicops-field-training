import { browserStorage } from './training/browser-storage.js';
import { createSystem, Entity, Group, PokeInteractable, Pressed, RayInteractable } from '@iwsdk/core';
import { AssistCard, type CardSpec } from './assist-card.js';
import { FieldAssistTarget } from './field-assist-components.js';
import { loadSettings, nextCaptionSize, saveSettings, type AccessibilitySettings } from './training/accessibility-settings.js';

/**
 * First-run accessibility quick-start on the depot board. Shown once (or with ?quickstart=1),
 * world-anchored left of the bench so it never hides the board. Every choice persists.
 */
export class QuickStartSystem extends createSystem({ pressed: { required: [FieldAssistTarget, Pressed] } }) {
  private settings!: AccessibilitySettings;
  private root?: Group;
  private rootEntity?: Entity;
  private card?: AssistCard;
  private readonly buttons: { card: AssistCard; entity: Entity }[] = [];

  init(): void {
    this.settings = loadSettings(browserStorage(), location.search);
    const param = new URLSearchParams(location.search).get('quickstart');
    // The title screen now owns first-run options; the in-world card remains available with ?quickstart=1.
    const show = param === '1';
    this.cleanupFuncs.push(this.queries.pressed.subscribe('qualify', (entity) => this.press(entity.getValue(FieldAssistTarget, 'action') ?? '')), () => this.close(false));
    const host = window as unknown as { civicOpsQuickStart?: boolean };
    host.civicOpsQuickStart = show;
    if (show) this.open();
  }

  private open(): void {
    this.root = new Group();
    this.root.position.set(-0.58, 1.36, 0.62);
    this.root.scale.setScalar(1.3);
    this.root.rotation.y = 0.62;
    this.rootEntity = this.world.createTransformEntity(this.root);
    this.card = new AssistCard(0.46, 0.26);
    this.card.mesh.position.set(0, 0.06, 0);
    this.root.add(this.card.mesh);
    this.render();
  }

  private render(): void {
    if (!this.card || !this.rootEntity) return;
    const st = this.settings; const on = (v: boolean) => (v ? 'ON' : 'OFF');
    this.card.draw({ eyebrow: 'Before you start · 20 seconds', title: 'Set up for how you work', icon: 'eye', highContrast: st.highContrast,
      lines: [`Captions ${st.captionSize} · High contrast ${on(st.highContrast)}`, `Reduced motion ${on(st.reducedMotion)} · Left-handed ${on(st.leftHanded)}`, `One-handed ${on(st.oneHanded)} · Look-and-hold ${on(st.dwellSelect)}`],
      small: 'Change any of these later from Settings or On-site assist › Accessibility.' });
    for (const b of this.buttons) { b.entity.dispose({ disposeResources: false }); b.card.dispose(); }
    this.buttons.length = 0;
    const specs: { a: string; l: string; x: number; y: number; tone?: CardSpec['tone'] }[] = [
      { a: 'qs-captionSize', l: 'Captions', x: -0.155, y: -0.12 }, { a: 'qs-highContrast', l: 'Contrast', x: 0, y: -0.12 }, { a: 'qs-reducedMotion', l: 'Motion', x: 0.155, y: -0.12 },
      { a: 'qs-leftHanded', l: 'Left hand', x: -0.155, y: -0.18 }, { a: 'qs-oneHanded', l: 'One hand', x: 0, y: -0.18 }, { a: 'qs-done', l: 'Start', x: 0.155, y: -0.18, tone: 'button-ok' },
    ];
    for (const spec of specs) {
      const card = new AssistCard(0.14, 0.048);
      card.draw({ title: spec.l, tone: spec.tone ?? 'button', highContrast: this.settings.highContrast });
      card.mesh.position.set(spec.x, spec.y, 0.004);
      const entity = this.world.createTransformEntity(card.mesh, this.rootEntity);
      entity.addComponent(FieldAssistTarget, { action: spec.a });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      this.buttons.push({ card, entity });
    }
  }

  private press(action: string): void {
    if (!action.startsWith('qs-') || !this.card) return;
    const key = action.slice(3);
    if (key === 'done') { this.close(true); return; }
    if (key === 'captionSize') this.settings = { ...this.settings, captionSize: nextCaptionSize(this.settings.captionSize) };
    else this.settings = { ...this.settings, [key]: !this.settings[key as 'highContrast'] };
    saveSettings(browserStorage(), this.settings);
    this.render();
  }

  private close(seen: boolean): void {
    if (seen) { this.settings = { ...this.settings, quickStartSeen: true }; saveSettings(browserStorage(), this.settings); }
    for (const b of this.buttons) { b.entity.dispose({ disposeResources: false }); b.card.dispose(); }
    this.buttons.length = 0;
    this.card?.dispose(); this.card = undefined;
    this.rootEntity?.dispose({ disposeResources: false }); this.rootEntity = undefined; this.root = undefined;
    (window as unknown as { civicOpsQuickStart?: boolean }).civicOpsQuickStart = false;
  }

  update(): void {
    // Leave the depot (open a lesson) and the quick-start closes; it reappears only if never completed.
    if (this.card && (window as unknown as { civicOpsModule?: string }).civicOpsModule !== 'board') this.close(false);
  }
}

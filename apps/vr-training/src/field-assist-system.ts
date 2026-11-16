import { browserStorage } from './training/browser-storage.js';
import {ChoiceReleaseQueue} from './training/choice-release.js';
import {ASSIST_TEXT_DENSITY,ASSIST_DECORATION_DENSITY} from './training/assist-texture-budget.js';
import {ROOM_CONTROLS,useEmulatorRoom} from './training/room-controls.js';
import {
  AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, createSystem, Euler, Raycaster, DoubleSide, Entity, Group, Mesh, MeshBasicMaterial, PokeInteractable, Pressed,
  Quaternion, RayInteractable, RingGeometry, Transform, Vector3, Visibility,
} from '@iwsdk/core';
import { AssistCard, drawAssistIcon, type CardSpec } from './assist-card.js';
import { FieldAssistTarget } from './field-assist-components.js';
import { CivicAudio } from './training/civic-audio.js';
import {
  answerStep, ASSIST_MODULES, backupLine, calibrateLane, CALLOUTS, currentFieldStep, EMERGENCY_LINE, holdGate, laneExposure,
  placeCallout, resumeAfterRecheck, sosMessage, sosTick, startCrewGuide, unitBearings, worstProximity,
  type AssistMode, type Callout, type CalloutKind, type CrewGuideState, type GateAnswer, type Lane, type OwnUnit, type SosState,
} from './training/field-assist.js';
import { exportFieldLog, FieldStepAppender, verifyFieldLog, type FieldStepLogEntry } from './training/field-step-log.js';
import { TRAINING_FIELD_CONTEXT } from './training/field-log-context.js';
import type { AssistHazardCode, AssistOption, AssistStepLog } from './training/assist-contract.js';
import { dwellTick, handedX, loadSettings, nextCaptionSize, pulse, saveSettings, type AccessibilitySettings, type DwellState } from './training/accessibility-settings.js';
import { FIRE_SCENE } from './training/scene-safety-geometry.js';
import { hazardLabelScale, staggerLabelHeights } from './training/label-stagger.js';

type Screen = 'picker' | AssistMode | 'log' | 'a11y';
const LOG_KEY = 'civicops.field.step-log.v1';
const OPTION_OF: Record<AssistMode, AssistOption> = { crew: 'utility-isolation', hazard: 'object-hazards', sa: 'scene-safety' };
const TYPE_TO_MODULE: Record<string, string> = { ELECTRICITY: 'elec-loto', WATER: 'water-burst', ROADS: 'roads-zone', FIRE: 'scene-safety' };
const MODULE_TYPE: Record<string, string> = { 'elec-loto': 'ELECTRICITY', 'water-burst': 'WATER', 'roads-zone': 'ROADS', 'scene-safety': 'FIRE' };
const CALLOUT_ICON: Record<CalloutKind, NonNullable<CardSpec['icon']>> = { 'live-line': 'bolt', 'gas-leak': 'gas', 'fuel-spill': 'drop', 'open-trench': 'trench', flooding: 'drop', fire: 'flame' };
const CALLOUT_COLOR: Record<CalloutKind, string> = { 'live-line': '#ffd23c', 'gas-leak': '#9cf06a', 'fuel-spill': '#ff9b3c', 'open-trench': '#5ad1ff', flooding: '#5ad1ff', fire: '#ff5a4a' };
/** Mocked dispatch feed: own units only, never people. */
const UNITS: OwnUnit[] = [
  { callsign: 'M-12', type: 'police', x: -30, z: 60, etaMin: 4 },
  { callsign: 'A-3', type: 'ems', x: 40, z: -40, etaMin: 7 },
  { callsign: 'F-1', type: 'fire', x: -1.9, z: 11.5 },
];
const UNIT_COLOR: Record<string, string> = { police: '#6aa8ff', traffic: '#ffd23c', ems: '#ffffff', fire: '#ff5a4a', crew: '#8fe3d6' };
const UNIT_SHAPE: Record<string, 'square' | 'circle' | 'triangle' | 'diamond'> = { police: 'square', traffic: 'diamond', ems: 'circle', fire: 'triangle', crew: 'circle' };

interface Button { card: AssistCard; entity: Entity; action: string }
interface ButtonSpec {action:string;label:string;tone?:CardSpec['tone'];icon?:CardSpec['icon'];w?:number;h?:number;x:number;y:number;}

/** On-site assist (AR) for glasses and passthrough: crew STOP gates, hazard callouts, police/EMS awareness. */
export class FieldAssistSystem extends createSystem({
  targets: { required: [FieldAssistTarget] },
  pressed: { required: [FieldAssistTarget, Pressed] },
}) {
  private screen: Screen = 'picker';
  private root!: Group;
  private rootEntity!: Entity;
  private main!: AssistCard;
  private side!: AssistCard;
  private banner!: AssistCard;
  private chip!: AssistCard;
  private frame!: AssistCard;
  private readonly buttons: Button[] = [];
  private readonly generated: Entity[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly markers = new Map<string, { group: Group; label: AssistCard; lastText: string; callout: Callout }>();
  private crew!: CrewGuideState;
  private crewModule = 'elec-loto';
  private callouts: Callout[] = [];
  private lanes: Lane[] = [];
  private lanePoint?: { x: number; z: number };
  private sos: SosState = { phase: 'idle', heldMs: 0 };
  private log: FieldStepLogEntry[] = [];
  private logOk = true;
  private logReady: Promise<void> = Promise.resolve();
  private readonly logAppender = new FieldStepAppender(() => this.log, entries => {
    this.log = entries;
    // Preserve genesis and sequence numbers. Slicing the last 500 entries breaks
    // verification on the next launch. Storage failure retains session evidence.
    try { localStorage.setItem(LOG_KEY, JSON.stringify(entries)); } catch { this.logOk = false; }
  });
  private pressStart = new Map<string, number>();
  private held = new Set<string>();
  private snap = true;
  private settings!: AccessibilitySettings;
  private get highContrast(): boolean { return this.settings.highContrast; }
  private gazeAction = '';
  private dwell: DwellState = { target: '', sinceMs: 0, fired: false };
  private readonly ray = new Raycaster();
  private lastProximity = 'clear';
  private lastExposure = 'safe';
  private compassKey = '';
  private elapsed = 0;
  private readonly audio = new CivicAudio();
  private readonly head = new Vector3();
  private readonly fwd = new Vector3();
  private readonly target = new Vector3();
  private readonly q = new Quaternion();
  private readonly look = new Vector3();
  private readonly euler = new Euler();
  private readonly yawQ = new Quaternion();

  init(): void {
    for (const name of ['steps', 'controls', 'casualty', 'handover', 'results']) this.world.getSceneEntity(`fire-${name}-panel`)?.setValue(Visibility, 'isVisible', false);
    const params = new URLSearchParams(location.search);
    this.crewModule = TYPE_TO_MODULE[params.get('workOrderType') ?? ''] ?? 'elec-loto';
    this.crew = startCrewGuide(ASSIST_MODULES.find((m) => m.id === this.crewModule)!);
    this.settings = loadSettings(browserStorage(), location.search);
    this.lanes = [];
    try { const raw = localStorage.getItem(LOG_KEY); const saved: unknown = raw ? JSON.parse(raw) : []; this.log = Array.isArray(saved) ? saved : []; } catch { this.log = []; }
    this.logReady = verifyFieldLog(this.log).then((bad) => { if (bad >= 0) { this.log = this.log.slice(0, bad); this.logOk = false; } });

    this.root = new Group();this.root.name='RoomGuide';
    this.root.scale.setScalar(1.1);
    this.rootEntity = this.world.createTransformEntity(this.root);
    this.generated.push(this.rootEntity);
    this.main = this.card(0.44, 0.27, 0, 0.02, -0.002);
    this.side = this.card(0.2, 0.27, 0.335, 0.02, 0.02);
    this.side.mesh.position.x = handedX(0.335, this.settings);
    this.banner = this.card(0.5, 0.07, 0, 0.2, 0.01);
    this.chip = this.card(0.2, 0.032, -0.12, -0.155, 0);
    this.frame = this.card(1.3, 0.85, 0, 0.02, -0.25,ASSIST_DECORATION_DENSITY);
    this.frame.mesh.renderOrder = 880;

    const option = params.get('option');
    const mode = params.get('mode');
    this.screen = mode === 'assist' && (option === 'crew' || option === 'hazard' || option === 'sa') ? option : 'picker';
    const host = window as unknown as { civicOpsStageAssist?: (shot: string) => Promise<string>; civicOpsAssistLog?: () => string };
    host.civicOpsStageAssist = (shot) => this.stage(shot);
    host.civicOpsAssistLog = () => exportFieldLog(this.log);
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => this.press(entity)),
      this.queries.pressed.subscribe('disqualify', (entity) => this.release(entity)),
      () => { delete host.civicOpsStageAssist; delete host.civicOpsAssistLog; },
      () => this.teardown(),
    );
    this.render();
  }

  private card(w: number, h: number, x: number, y: number, z: number,density=ASSIST_TEXT_DENSITY): AssistCard {
    const card = new AssistCard(w, h,density);
    card.mesh.position.set(x, y, z);
    this.root.add(card.mesh);
    this.disposables.push(card);
    return card;
  }

  private readonly choiceChanges=new ChoiceReleaseQueue<ButtonSpec>();
  private setButtons(specs:ButtonSpec[]): void {
    const next=this.choiceChanges.request(specs,this.buttons.some(button=>button.entity.hasComponent(Pressed)));
    if(!next)return;specs=next;
    for (const button of this.buttons) { button.entity.dispose({ disposeResources: false }); button.card.dispose(); }
    this.buttons.length = 0;
    // Reserved below Jobs / Options; never stack independent hand targets.
    specs.push(...ROOM_CONTROLS);
    for (const spec of specs) {
      const card = new AssistCard(spec.w ?? 0.135, spec.h ?? 0.05);
      card.mesh.name = `assist-${spec.action}`;
      card.draw({ title: spec.label, tone: spec.tone ?? 'button', icon: spec.icon, highContrast: this.highContrast });
      card.mesh.position.set(handedX(spec.x, this.settings), spec.y, 0.004);
      card.mesh.renderOrder = 920;
      const entity = this.world.createTransformEntity(card.mesh, this.rootEntity);
      entity.addComponent(FieldAssistTarget, { action: spec.action });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      this.buttons.push({ card, entity, action: spec.action });
    }
  }

  private press(entity: Entity): void {
    const action = entity.getValue(FieldAssistTarget, 'action') ?? '';
    this.audio.unlock();
    this.audio.play('ui-tick');
    this.pressStart.set(action, performance.now());
    this.held.add(action);
    if (action !== 'gate-hold' && action !== 'sos') this.act(action);
  }

  private release(entity: Entity): void {
    const action = entity.getValue(FieldAssistTarget, 'action') ?? '';
    this.held.delete(action);
    if (action === 'gate-hold') { this.crewHold(performance.now() - (this.pressStart.get(action) ?? performance.now())); }
    if (action === 'sos') { this.sos = sosTick(this.sos, false, 0); this.render(); }
    const pending=this.choiceChanges.release(this.buttons.some(button=>button.entity.hasComponent(Pressed)));
    if(pending)this.setButtons(pending);
  }

  private act(action: string): void {
    const now = Math.round(performance.now());
    if(action==='room-floor-up'||action==='room-floor-down'){window.dispatchEvent(new Event('civicops:'+action));return;}
    if(action==='room-pin'){window.dispatchEvent(new Event('civicops:room-place'));return;}
    if(action==='room-follow'){window.dispatchEvent(new Event('civicops:room-recenter'));this.snap=true;return;}
    if (action.startsWith('open-')) { this.screen = action.slice(5) as Screen; this.snap = true; }
    else if (action === 'picker') this.screen = 'picker';
    else if (action === 'jobs') { window.dispatchEvent(new Event('civicops:jobs')); return; }
    else if (action.startsWith('answer-')) this.crewAnswer(action.slice(7) as GateAnswer, now);
    else if (action === 'recheck') { this.crew = resumeAfterRecheck(this.crew, 'yes', now); void this.record('request-human-review', 'needs-review'); }
    else if (action === 'crew-next-module') { const i = ASSIST_MODULES.findIndex((m) => m.id === this.crewModule); this.crewModule = ASSIST_MODULES[(i + 1) % ASSIST_MODULES.length].id; this.crew = startCrewGuide(ASSIST_MODULES.find((m) => m.id === this.crewModule)!); }
    else if (action.startsWith('place-')) this.placeAhead(action.slice(6) as CalloutKind);
    else if (action === 'control-feed') this.mockFeed();
    else if (action === 'clear-hazards') { this.callouts = []; this.syncMarkers(); }
    else if (action === 'lane-point') this.calibratePoint();
    else if (action === 'export-log') this.download();
    else if (action.startsWith('set-')) {
      const key = action.slice(4);
      if (key === 'captionSize') this.settings = { ...this.settings, captionSize: nextCaptionSize(this.settings.captionSize) };
      else if (key in this.settings) this.settings = { ...this.settings, [key]: !this.settings[key as 'highContrast'] };
      saveSettings(browserStorage(), this.settings);
      this.side.mesh.position.x = handedX(0.335, this.settings);
    }
    this.render();
  }

  private crewAnswer(answer: GateAnswer, now: number): void {
    const before = currentFieldStep(this.crew);
    this.crew = answerStep(this.crew, answer, now);
    if (!before) return;
    if (this.crew.phase === 'stop-work') { this.audio.play('warning-buzz'); void this.record('request-human-review', 'stopped', before.hazards); }
    else if (!before.stopGate) void this.record('assess-hazards', 'confirmed', before.hazards);
    if (this.crew.phase === 'complete') { this.audio.play('success-chime'); void this.record('confirm-readiness', 'confirmed'); }
  }

  private crewHold(heldMs: number): void {
    const before = currentFieldStep(this.crew);
    const next = holdGate(this.crew, heldMs, Math.round(performance.now()));
    const advanced = next !== this.crew;
    if (advanced && before) { this.audio.play('lock-click'); void this.record('check-isolation', 'confirmed', before.hazards); }
    this.crew = next;
    if (advanced && this.crew.phase === 'complete') { this.audio.play('success-chime'); void this.record('confirm-readiness', 'confirmed'); }
    this.render();
  }

  private async record(step: AssistStepLog['step'], outcome: AssistStepLog['outcome'], hazards: AssistHazardCode[] = []): Promise<void> {
    const mode: AssistMode = this.screen === 'hazard' || this.screen === 'sa' ? this.screen : 'crew';
    const typeCode = mode === 'crew' ? MODULE_TYPE[this.crewModule] : mode === 'hazard' ? 'HAZARD' : 'FIRE';
    try {
      const input = {
        ...TRAINING_FIELD_CONTEXT, workOrderTypeCode: typeCode,
        step: { schema: 'civicops.assist.step.v1', option: OPTION_OF[mode], step, outcome, hazards: [...new Set(hazards)].slice(0, 8),
          decision: outcome === 'confirmed' ? 'human-confirmed' : 'human-review-required', atMs: Math.max(0, Math.round(performance.now())) },
      } as const;
      await this.logReady;
      await this.logAppender.append(input);
    } catch { this.logOk = false; }
    if (this.screen === 'log' || this.screen === 'crew' && this.crew.phase === 'complete') this.render();
  }

  private download(): void {
    const blob = new Blob([exportFieldLog(this.log)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'civicops-field-step-log.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private placeAhead(kind: CalloutKind): void {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.fwd).negate();
    this.fwd.y = 0; this.fwd.normalize();
    this.callouts = placeCallout(this.callouts, kind, this.head.x + this.fwd.x * 4, this.head.z + this.fwd.z * 4);
    void this.record('assess-hazards', 'needs-review', [CALLOUTS[kind].hazard]);
    this.syncMarkers();
  }

  private mockFeed(): void {
    this.callouts = [];
    this.callouts = placeCallout(this.callouts, 'live-line', FIRE_SCENE.cable.x, FIRE_SCENE.cable.z, 'control-feed', 4);
    this.callouts = placeCallout(this.callouts, 'fuel-spill', FIRE_SCENE.fuel.x, FIRE_SCENE.fuel.z, 'control-feed', 3);
    this.callouts = placeCallout(this.callouts, 'gas-leak', -6.5, -9, 'control-feed', 5);
    this.callouts = placeCallout(this.callouts, 'open-trench', -7.2, 15, 'control-feed', 1.5);
    this.syncMarkers();
  }

  private calibratePoint(): void {
    this.player.head.getWorldPosition(this.head);
    const p = { x: this.head.x, z: this.head.z };
    if (!this.lanePoint) { this.lanePoint = p; return; }
    try { this.lanes = [calibrateLane('calibrated', this.lanePoint, p)]; } catch { /* points too close; keep the previous lane */ }
    this.lanePoint = undefined;
  }

  private ringMesh?: Mesh<BufferGeometry, MeshBasicMaterial>;

  /** One merged, vertex-coloured mesh draws every exclusion ring (1 draw call however many hazards). */
  private syncMarkers(): void {
    const keyOf = (c: Callout) => `${c.id}:${c.kind}:${c.x}:${c.z}:${c.radiusM}`;
    const keys = new Set(this.callouts.map(keyOf));
    for (const [key, marker] of this.markers) if (!keys.has(key)) { marker.group.removeFromParent(); marker.label.dispose(); this.markers.delete(key); }
    for (const callout of this.callouts) {
      const key = keyOf(callout);
      if (this.markers.has(key)) continue;
      const group = new Group();
      const label = new AssistCard(1.5, 0.34);
      label.mesh.position.y = 2.6;
      label.mesh.renderOrder = 850;
      group.add(label.mesh);
      this.generated.push(this.world.createTransformEntity(group));
      group.position.set(callout.x, 0, callout.z);
      this.markers.set(key, { group, label, lastText: '', callout });
    }
    const positions: number[] = []; const colors: number[] = []; const color = new Color();
    for (const callout of this.callouts) {
      const ring = new RingGeometry(Math.max(0.05, callout.radiusM - 0.3), callout.radiusM, 64).toNonIndexed();
      ring.rotateX(-Math.PI / 2);
      ring.translate(callout.x, 0.06, callout.z);
      color.set(CALLOUT_COLOR[callout.kind]);
      const attr = ring.getAttribute('position');
      for (let i = 0; i < attr.count; i += 1) { positions.push(attr.getX(i), attr.getY(i), attr.getZ(i)); colors.push(color.r, color.g, color.b); }
      ring.dispose();
    }
    if (!this.ringMesh) {
      this.ringMesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false, toneMapped: false, blending: AdditiveBlending }));
      this.ringMesh.frustumCulled = false;
      this.generated.push(this.world.createTransformEntity(this.ringMesh));
      this.disposables.push({ dispose: () => { this.ringMesh?.geometry.dispose(); this.ringMesh?.material.dispose(); } });
    }
    this.ringMesh.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.ringMesh.geometry = geometry;
    this.ringMesh.visible = positions.length > 0;
  }

  private async stage(shot: string): Promise<string> {
    const now = 1000;
    this.snap = true;
    const reset = () => { this.crew = startCrewGuide(ASSIST_MODULES.find((m) => m.id === this.crewModule)!); };
    if (shot === 'picker') this.screen = 'picker';
    if (shot === 'a11y') this.screen = 'a11y';
    this.settings = { ...this.settings, highContrast: shot.endsWith('-hc') };
    if (shot.endsWith('-hc')) shot = shot.slice(0, -3);
    if (shot.startsWith('crew')) {
      this.screen = 'crew'; reset();
      this.crew = answerStep(answerStep(this.crew, 'yes', now), 'yes', now + 1);
      if (shot === 'crew-step') this.crew = { ...this.crew, index: 1, phase: 'step' };
      if (shot === 'crew-gate') { /* switch-off gate waiting for an answer */ }
      if (shot === 'crew-stop') this.crew = answerStep(this.crew, 'not-sure', now + 2);
    }
    if (shot.startsWith('hazard')) {
      this.screen = 'hazard';
      this.callouts = [];
      if (shot === 'hazard-live') this.callouts = placeCallout([], 'live-line', FIRE_SCENE.cable.x, FIRE_SCENE.cable.z, 'control-feed', 4);
      else this.mockFeed();
      this.syncMarkers();
    }
    if (shot.startsWith('sa')) { this.screen = 'sa'; this.sos = shot === 'sa-sos' ? { phase: 'sent', heldMs: 2000 } : { phase: 'idle', heldMs: 0 }; }
    if (shot === 'log') {
      this.screen = 'log';
      if (this.log.length < 3) { await this.record('assess-hazards', 'confirmed', ['lane-exposure']); await this.record('request-human-review', 'stopped', ['live-asset']); await this.record('check-isolation', 'confirmed', ['live-asset']); }
      this.logOk = (await verifyFieldLog(this.log)) === -1;
    }
    this.render();
    return this.screen;
  }

  private render(): void {
    const hc = this.highContrast;
    this.chip.draw({ title: 'Not recording · On-device', tone: 'chip', icon: 'eye', highContrast: hc });
    this.banner.mesh.visible = false;
    this.side.mesh.visible = true;
    this.frame.mesh.visible = false;
    for (const marker of this.markers.values()) marker.group.visible = this.screen === 'hazard';
    if (this.ringMesh) this.ringMesh.visible = this.screen === 'hazard' && this.callouts.length > 0;
    const row = -0.165;
    if (this.screen === 'picker') {
      this.main.draw({ eyebrow: 'CivicOps · On-site assist (AR)', title: 'Choose an assist option', icon: 'shield', highContrast: hc,
        lines: ['1  Crew job-step guide with "check before you touch" STOP gates', '2  Hazard callouts with exclusion zones and calm proximity warnings', '3  Police / EMS awareness: live-lane warning, own units, backup ETA, SOS'],
        small: 'Decision support only. You and your supervisor decide. No camera frames, no faces, no identification.' });
      this.side.draw({ eyebrow: 'Glasses ready', title: 'Gaze + pinch or poke', lines: ['Choose Pin beside job.', 'Then pinch a real surface.'], small: useEmulatorRoom(location.search,'IWER_DEVICE' in window)?'Emulator capture · passthrough simulated':'Native room passthrough', highContrast: hc });
      this.setButtons([
        { action: 'open-crew', label: 'Crew guide', icon: 'list', x: -0.15, y: row - 0.01, w: 0.14 },
        { action: 'open-hazard', label: 'Hazards', icon: 'bolt', x: 0, y: row - 0.01, w: 0.14 },
        { action: 'open-sa', label: 'Police / EMS', icon: 'compass', x: 0.15, y: row - 0.01, w: 0.14 },
        { action: 'open-log', label: 'Step log', icon: 'list', x: 0.335, y: row - 0.01, w: 0.12 },
        { action: 'jobs', label: 'Jobs', x: 0.335, y: -0.22, w: 0.12, h: 0.04 },
        { action: 'open-a11y', label: 'Accessibility', icon: 'eye', x: -0.15, y: -0.22, w: 0.14, h: 0.04 },
      ]);
      return;
    }
    if (this.screen === 'a11y') {
      const st = this.settings; const on = (v: boolean) => (v ? 'ON' : 'OFF');
      this.main.draw({ eyebrow: 'Accessibility · saved on this device', title: 'Make it work for you', icon: 'eye', highContrast: hc,
        lines: [`High contrast ${on(st.highContrast)} · Reduced motion ${on(st.reducedMotion)}`, `Left-handed layout ${on(st.leftHanded)} · Dwell select ${on(st.dwellSelect)}`, `One-handed ${on(st.oneHanded)} · Captions ${st.captionSize}`],
        small: 'Dwell: look at a button for 1.2 s to press it. Every action also works with poke or gaze + pinch.' });
      this.side.draw({ eyebrow: 'Seated first', title: 'Reach ≤ 0.55 m', lines: ['Cards sit low and close.', 'No two-hand actions here.'], highContrast: hc });
      this.setButtons([
        { action: 'set-highContrast', label: 'Contrast', x: -0.15, y: row }, { action: 'set-reducedMotion', label: 'Motion', x: 0, y: row },
        { action: 'set-leftHanded', label: 'Left hand', x: 0.15, y: row }, { action: 'set-dwellSelect', label: 'Dwell', x: -0.15, y: -0.22, h: 0.04 },
        { action: 'set-oneHanded', label: 'One hand', x: 0, y: -0.22, h: 0.04 }, { action: 'set-captionSize', label: 'Captions', x: 0.15, y: -0.22, h: 0.04 },
        { action: 'picker', label: 'Options', x: 0.335, y: -0.165, w: 0.12 },
      ]);
      return;
    }
    if (this.screen === 'crew') return this.renderCrew(hc, row);
    if (this.screen === 'hazard') return this.renderHazard(hc, row);
    if (this.screen === 'sa') return this.renderSa(hc, row);
    this.main.draw({ eyebrow: `Practice record · ${this.log.length} checks`, title: this.logOk ? 'Checks saved' : 'Record needs review', icon: 'list', tone: this.logOk ? 'ok' : 'warn', highContrast: hc,
      lines: this.log.slice(-4).reverse().map((e) => `#${e.seq} ${e.workOrderTypeCode} · ${e.step.step} · ${e.step.outcome}`),
      small: 'Saved on this device. Export the structured checks for your supervisor to review.' });
    this.side.draw({ eyebrow: 'Supervisor review', title: 'Review before work', lines: ['Check decisions and STOP gates.', "Use your employer's incident process."], small: 'Nothing is sent automatically. You and your supervisor decide.', highContrast: hc });
    this.setButtons([
      { action: 'export-log', label: 'Export JSON', tone: 'button-ok', x: -0.08, y: row },
      { action: 'picker', label: 'Options', x: 0.08, y: row },
    ]);
  }

  private renderCrew(hc: boolean, row: number): void {
    const step = currentFieldStep(this.crew);
    const total = this.crew.steps.length;
    const next = this.crew.steps[this.crew.index + 1];
    const hazardChips = (step?.hazards ?? []).map((h) => ({ text: h.replace('-', ' '), shape: 'triangle' as const, color: '#ffc93c' }));
    const moduleTitle = ASSIST_MODULES.find((m) => m.id === this.crewModule)?.department ?? '';
    if (this.crew.phase === 'complete') {
      this.main.draw({ eyebrow: `${moduleTitle} · job steps`, title: this.logOk ? 'All checks confirmed' : 'Record needs review', tone: this.logOk ? 'ok' : 'warn', icon: 'shield', lines: this.logOk ? ['Every STOP gate was answered and held.', 'Logged to the field step log.'] : ['Every STOP gate was answered and held.', 'Could not save every check.', 'Tell your supervisor. Export the record.'], dots: { total, done: total }, highContrast: hc });
      this.side.draw({ eyebrow: 'Next', title: 'Work as authorised', lines: ['Your supervisor still signs off.'], highContrast: hc });
      this.setButtons([{ action: 'open-log', label: 'Step log', x: -0.08, y: row }, { action: 'picker', label: 'Options', x: 0.08, y: row }]);
      return;
    }
    if (this.crew.phase === 'stop-work') {
      this.frame.mesh.visible = true;
      this.frame.custom(`frame-stop-${hc}`, (ctx, w, h) => { ctx.strokeStyle = hc ? '#ffff00' : 'rgba(255,60,60,0.85)'; ctx.lineWidth = w * 0.025; ctx.strokeRect(0, 0, w, h); });
      this.main.draw({ eyebrow: 'STOP WORK', title: 'Make safe. Call control.', tone: 'stop', icon: 'shield', highContrast: hc,
        lines: [`Not confirmed: ${this.crew.stopReason ?? ''}`, '1  Step back and keep everyone clear', '2  Call control and your supervisor', '3  Re-check, then resume'],
        small: 'Logged as "stopped". Nothing resumes until you re-check.', dots: { total, done: this.crew.index } });
      this.side.draw({ eyebrow: 'Why', title: 'Check before you touch', lines: ['If a step is not confirmed, keep the job stopped until it is checked.'], highContrast: hc });
      this.setButtons([{ action: 'recheck', label: 'Re-checked: safe', tone: 'button-ok', x: -0.075, y: row, w: 0.16 }, { action: 'picker', label: 'Options', x: 0.1, y: row }]);
      return;
    }
    if (this.crew.phase === 'gate-confirmed' || step?.stopGate) {
      const armed = this.crew.phase === 'gate-confirmed';
      this.main.draw({ eyebrow: `STOP GATE · step ${this.crew.index + 1} of ${total}`, title: 'Check before you touch', tone: 'stop', icon: 'shield', highContrast: hc,
        lines: [step?.check ?? step?.prompt ?? '', armed ? 'Confirmed. Now pinch and HOLD for 1 second.' : 'Look at "Confirmed" and pinch. Then hold.'],
        chips: hazardChips, dots: { total, done: this.crew.index } });
      this.side.draw({ eyebrow: 'Next', title: next?.prompt ?? 'Finish', lines: [`Step: ${step?.prompt ?? ''}`], highContrast: hc });
      this.setButtons(armed
        ? [{ action: 'gate-hold', label: 'Hold 1 s', tone: 'button-ok', icon: 'shield', x: -0.08, y: row, w: 0.16 }, { action: 'answer-not-sure', label: 'Not sure', tone: 'button-stop', x: 0.1, y: row }]
        : [{ action: 'answer-yes', label: 'Confirmed', tone: 'button-ok', x: -0.15, y: row }, { action: 'answer-no', label: 'No', tone: 'button-stop', x: 0, y: row }, { action: 'answer-not-sure', label: 'Not sure', tone: 'button-stop', x: 0.15, y: row }]);
      return;
    }
    this.main.draw({ eyebrow: `${moduleTitle} · step ${this.crew.index + 1} of ${total}`, title: step?.prompt ?? '', icon: 'list', highContrast: hc,
      lines: ['Do this step on the real job, then confirm.'], chips: hazardChips, dots: { total, done: this.crew.index },
      small: "Illustrative guide; follow your employer's SOPs." });
    this.side.draw({ eyebrow: 'Next', title: next?.prompt ?? 'Finish', lines: next?.stopGate ? ['STOP gate ahead'] : [], highContrast: hc });
    this.setButtons([{ action: 'answer-yes', label: 'Done', tone: 'button-ok', x: -0.15, y: row }, { action: 'crew-next-module', label: 'Other job', x: 0, y: row }, { action: 'picker', label: 'Options', x: 0.15, y: row }]);
  }

  private renderHazard(hc: boolean, row: number): void {
    this.main.draw({ eyebrow: 'Hazard callouts', title: this.callouts.length ? `${this.callouts.length} hazard${this.callouts.length > 1 ? 's' : ''} marked` : 'No hazards marked', icon: 'bolt', highContrast: hc,
      lines: ['Placed by you, or pushed by control (mocked feed).', 'Rings show the exclusion radius. No detection, no camera analysis.'],
      chips: this.callouts.map((c) => ({ text: `${CALLOUTS[c.kind].label} · ${c.radiusM} m`, shape: c.kind === 'live-line' ? 'triangle' as const : c.kind === 'open-trench' ? 'square' as const : 'diamond' as const, color: CALLOUT_COLOR[c.kind] })) });
    this.side.draw({ eyebrow: 'Place ahead (4 m)', title: 'Pinch a hazard', lines: ['Live line · Gas', 'Fuel · Trench'], highContrast: hc });
    this.setButtons([
      { action: 'place-live-line', label: 'Live line', icon: 'bolt', x: -0.15, y: row },
      { action: 'place-gas-leak', label: 'Gas', icon: 'gas', x: 0, y: row },
      { action: 'place-open-trench', label: 'Trench', icon: 'trench', x: 0.15, y: row },
      { action: 'control-feed', label: 'Control feed', x: 0.335, y: -0.165, w: 0.16 },
      { action: 'picker', label: 'Options', x: 0.335, y: -0.22, w: 0.12, h: 0.04 },
    ]);
  }

  private renderSa(hc: boolean, row: number): void {
    this.player.head.getWorldPosition(this.head);
    const units = unitBearings(UNITS, { x: this.head.x, z: this.head.z }, 0);
    this.main.draw({ eyebrow: 'Police / EMS awareness', title: backupLine(UNITS), icon: 'compass', highContrast: hc,
      lines: units.map((u) => `${u.type.toUpperCase()} ${u.callsign} · ${u.distanceM} m${u.etaMin !== undefined ? ` · ETA ${u.etaMin} min` : ' · on scene'}`).concat([this.lanePoint ? 'Lane calibration: walk to point B, pinch again' : 'Lanes: mocked scene layout (pinch two points to recalibrate)']),
      chips: [{ text: 'Own units only', shape: 'circle', color: '#8fe3d6' }, { text: 'No people tracked', shape: 'square', color: '#8fe3d6' }] });
    this.compassKey = '';
    this.setButtons([
      { action: 'sos', label: sosMessage(this.sos).replace(' (simulated)', ''), tone: 'button-stop', icon: 'sos', x: -0.11, y: row, w: 0.22 },
      { action: 'lane-point', label: 'Lane point', x: 0.08, y: row, w: 0.12 },
      { action: 'picker', label: 'Options', x: 0.335, y: -0.165, w: 0.12 },
    ]);
    if (this.sos.phase === 'sent') {
      this.banner.mesh.visible = true;
      this.banner.draw({ compact: true, title: 'SOS sent to control (simulated)', lines: [EMERGENCY_LINE], tone: 'stop', icon: 'sos', highContrast: hc });
    }
  }

  private drawCompass(heading: number): void {
    const key = `${Math.round(heading / 5)}|${Math.round(this.head.x)}|${Math.round(this.head.z)}|${this.highContrast}`;
    if (key === this.compassKey) return;
    this.compassKey = key;
    const units = unitBearings(UNITS, { x: this.head.x, z: this.head.z }, heading);
    this.side.custom(key, (ctx, w, h) => {
      ctx.fillStyle = this.highContrast ? '#000' : 'rgba(10,22,28,0.86)';
      ctx.beginPath(); ctx.roundRect(3, 3, w - 6, h - 6, w * 0.1); ctx.fill();
      const cx = w / 2; const cy = h * 0.52; const r = w * 0.36;
      ctx.strokeStyle = 'rgba(143,227,214,0.7)'; ctx.lineWidth = w * 0.015; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `800 ${w * 0.07}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('OWN UNITS', cx, h * 0.04);
      drawAssistIcon(ctx, 'compass', cx - w * 0.06, cy - w * 0.06, w * 0.12, '#8fe3d6');
      ctx.font = `700 ${w * 0.06}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
      for (const unit of units) {
        const a = (unit.bearingDeg * Math.PI) / 180;
        const x = cx + Math.sin(a) * r; const y = cy - Math.cos(a) * r;
        ctx.fillStyle = UNIT_COLOR[unit.type];
        ctx.beginPath();
        const s = w * 0.035;
        if (UNIT_SHAPE[unit.type] === 'square') ctx.rect(x - s, y - s, 2 * s, 2 * s);
        else if (UNIT_SHAPE[unit.type] === 'triangle') { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath(); }
        else ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillText(`${unit.callsign} ${unit.distanceM}m`, x, y + s * 2.4);
      }
    });
  }

  /** Keep the ECS pose used by input aligned with the rendered follow/anchor pose. */
  syncGuideTransform():void {
    const p=this.rootEntity.getVectorView(Transform,'position'),q=this.rootEntity.getVectorView(Transform,'orientation'),s=this.rootEntity.getVectorView(Transform,'scale');
    p[0]=this.root.position.x;p[1]=this.root.position.y;p[2]=this.root.position.z;
    q[0]=this.root.quaternion.x;q[1]=this.root.quaternion.y;q[2]=this.root.quaternion.z;q[3]=this.root.quaternion.w;
    s[0]=this.root.scale.x;s[1]=this.root.scale.y;s[2]=this.root.scale.z;
  }

  update(delta: number): void {
    this.elapsed += delta;
    const head = this.player.head;
    head.getWorldPosition(this.head);
    head.getWorldDirection(this.fwd).negate();
    const heading = (Math.atan2(this.fwd.x, -this.fwd.z) * 180) / Math.PI;
    // Lazy follow: 0.72 m ahead, slightly below eye height, facing the user.
    this.look.set(this.fwd.x, 0, this.fwd.z).normalize();
    this.target.set(this.head.x + this.look.x * 0.72, this.head.y - (this.screen === 'hazard' ? 0.36 : 0.1), this.head.z + this.look.z * 0.72);
    const k = this.snap || this.settings.reducedMotion ? 1 : Math.min(1, delta * 3);
    if (this.root.userData.roomPinned!==true && (this.snap || this.root.position.distanceTo(this.target) > (this.settings.reducedMotion ? 0.25 : 0.08))) this.root.position.lerp(this.target, k);
    this.q.setFromEuler(this.euler.set(this.screen === 'hazard' ? 0.45 : 0, Math.atan2(-this.look.x, -this.look.z), 0, 'YXZ'));
    if(this.root.userData.roomPinned!==true)this.root.quaternion.slerp(this.q, k);
    this.snap = false;this.syncGuideTransform();

    if (this.settings.dwellSelect && this.buttons.length) {
      this.ray.set(this.head, this.fwd);
      const hit = this.ray.intersectObjects(this.buttons.map((b) => b.card.mesh), false)[0];
      const action = hit ? this.buttons.find((b) => b.card.mesh === hit.object)?.action ?? '' : '';
      this.gazeAction = action;
      const result = dwellTick(this.dwell, action, performance.now());
      this.dwell = result.state;
      for (const b of this.buttons) b.card.mesh.scale.setScalar(b.action === action ? 1 + 0.08 * result.progress : 1);
      if (result.select === 'gate-hold') this.crewHold(1000);
      // SOS is never a dwell click: gazing at it counts as holding, so the 2 s hold still applies.
      else if (result.select && result.select !== 'sos') { this.audio.play('ui-tick'); this.act(result.select); }
    }
    if (this.held.has('gate-hold') && performance.now() - (this.pressStart.get('gate-hold') ?? 0) >= 1000) { this.held.delete('gate-hold'); this.crewHold(1000); }
    if (this.screen === 'sa') {
      const before = this.sos.phase;
      this.sos = sosTick(this.sos, this.held.has('sos') || (this.settings.dwellSelect && this.gazeAction === 'sos'), delta * 1000);
      if (before !== this.sos.phase || this.sos.phase === 'holding') { if (this.sos.phase === 'sent' && before !== 'sent') { this.audio.play('radio-squelch'); void this.record('request-human-review', 'needs-review', ['lane-exposure']); } this.render(); }
      this.drawCompass(heading);
      const exposure = laneExposure(this.lanes, { x: this.head.x, z: this.head.z });
      if (exposure !== this.lastExposure) { this.lastExposure = exposure; if (exposure === 'in-live-lane') this.audio.play('warning-buzz'); }
      if (exposure !== 'safe' && this.sos.phase !== 'sent') {
        this.banner.mesh.visible = true;
        this.banner.draw({ compact: true, title: exposure === 'in-live-lane' ? 'You are in a live lane' : 'Live lane close by', lines: [exposure === 'in-live-lane' ? 'Step to the shoulder or behind the blocker.' : 'Keep the vehicle between you and traffic.'], tone: exposure === 'in-live-lane' ? 'stop' : 'warn', icon: 'shield', highContrast: this.highContrast });
      } else if (this.sos.phase !== 'sent') this.banner.mesh.visible = false;
      this.frame.mesh.visible = exposure === 'in-live-lane';
      if (this.frame.mesh.visible) this.frame.custom(`frame-lane-${this.highContrast}`, (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, w * 0.12, 0); g.addColorStop(0, 'rgba(255,40,40,0.75)'); g.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w * 0.12, h); const g2 = ctx.createLinearGradient(w, 0, w * 0.88, 0); g2.addColorStop(0, 'rgba(255,40,40,0.75)'); g2.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = g2; ctx.fillRect(w * 0.88, 0, w * 0.12, h); });
    }
    if (this.screen === 'hazard') {
      const ringAlpha = pulse(this.elapsed, this.settings);
      if (this.ringMesh) this.ringMesh.material.opacity = ringAlpha;
      const labels = [...this.markers.values()];
      const labelAnchors = labels.map(marker => marker.callout);
      // Hazards that line up from where the worker stands would print over each other; lift the farther label.
      const heights = staggerLabelHeights(this.head, labelAnchors);
      for (let index = 0; index < labels.length; index += 1) {
        const marker = labels[index]; const callout = marker.callout;
        marker.label.mesh.quaternion.setFromEuler(this.euler.set(0, Math.atan2(this.head.x - callout.x, this.head.z - callout.z), 0));
        const d = Math.round(Math.hypot(this.head.x - callout.x, this.head.z - callout.z));
        // Budget: labels beyond 14 m hide (ring and main-card list still show them); near labels scale with distance.
        marker.label.mesh.visible = d <= 14;
        marker.label.mesh.scale.setScalar(hazardLabelScale(d));
        marker.label.mesh.position.y = heights[index];
        const text = `${callout.id}|${d}|${this.highContrast}`;
        if (text !== marker.lastText) { marker.lastText = text; marker.label.draw({ compact: true, title: CALLOUTS[callout.kind].label, lines: [`${d} m away · keep ${callout.radiusM} m · ${callout.source === 'control-feed' ? 'from control' : 'placed by crew'}`], icon: CALLOUT_ICON[callout.kind], tone: d <= callout.radiusM ? 'stop' : 'dark', highContrast: this.highContrast }); }
      }
      const worst = worstProximity(this.callouts, this.head.x, this.head.z);
      if (worst.level !== this.lastProximity) { this.lastProximity = worst.level; if (worst.level === 'inside') this.audio.play('warning-buzz'); }
      if (worst.callout && worst.level !== 'clear') {
        const spec = CALLOUTS[worst.callout.kind];
        this.banner.mesh.visible = true;
        this.banner.draw({ compact: true, title: worst.level === 'inside' ? `Inside ${spec.label.toLowerCase()} zone` : `Approaching ${spec.label.toLowerCase()}`, lines: [spec.todo.join(' · ')], tone: worst.level === 'inside' ? 'stop' : 'warn', icon: CALLOUT_ICON[worst.callout.kind], highContrast: this.highContrast });
        this.side.draw({ eyebrow: 'What to do', title: spec.label, lines: spec.todo, small: 'Wait for the authorised person.', tone: worst.level === 'inside' ? 'stop' : 'warn', highContrast: this.highContrast });
      } else this.banner.mesh.visible = false;
    }
  }

  private teardown(): void {
    this.choiceChanges.clear();
    for (const button of this.buttons) { button.entity.dispose({ disposeResources: false }); button.card.dispose(); }
    this.buttons.length = 0;
    for (const marker of this.markers.values()) marker.label.dispose();
    for (const entity of this.generated) entity.dispose({ disposeResources: false });
    for (const item of this.disposables) item.dispose();
    this.audio.dispose();
  }
}

import { attemptAccessibility, attemptDevice } from './training/attempt-context.js';
import { browserStorage } from './training/browser-storage.js';
import { prepareProcedure } from './training/programme-state.js';
import {
  createSystem, Entity, Grabbed, GrabSystem, Mesh, Object3D, OneHandGrabbable,
  Pressed, Quaternion, RayInteractable, UIKit, UIKitMLAsset, Vector3,
  Visibility, VisibilityState,
} from '@iwsdk/core';
import { applyModuleAccessibility } from './module-accessibility.js';
import { SeatedPanelRig } from './seated-panel-rig.js';
import { ModuleDwell } from './module-dwell.js';
import { handedX, loadSettings, saveSettings, type AccessibilitySettings } from './training/accessibility-settings.js';
import { registerPokeableVisualTarget } from './hand-visual-system.js';
import { WaterSession, WaterTarget } from './water-components.js';
import { TrainingSession } from './training-components.js';
import { CivicAudio } from './training/civic-audio.js';
import { ScriptedInstructor } from './training/instructor.js';
import { createInstructor, LiveMetaInstructor, liveLlmOptions } from './training/meta-instructor.js';
import { loadGuidance, UNGUIDED_BRIEF } from './training/guidance.js';
import { guidanceCaption, waterStepTitle } from './training/caption-guidance.js';
import { assessmentFeedback, assessmentStepTitle, waterNetworkStatus, waterTurnGuide, WATER_SEIZED_UNGUIDED_SHORT } from './training/assessment-cues.js';
import { TrainingProgress } from './training/progress.js';
import { buildAttempt, score } from './training/scoring.js';
import { comeBackSummary } from './training/daily-drill.js';
import { DailyDrillProgress } from './training/daily-drill.js';
import { presentModuleResults } from './training/module-results.js';
import { placeReviewPanel } from './training/review-panel.js';
import { PointerPressLatch } from './training/pointer-press.js';
import { createPokeDepression } from './training/gesture-feedback.js';
import { HoldConfirm } from './training/hold-confirm.js';
import { createWaterFlowEffect } from './scene-assets/water-flow.scene-asset.js';
import { WaterAudio } from './training/water-audio.js';
import { KeySocketExitGuard, ValveRollTracker, WATER_COVER_LIFT_HEIGHT, WATER_KEY_SNAP_RADIUS } from './training/water-interaction.js';
import { createWaterDailyDrill, createWaterScenario, waterBurstModule, waterStepLines, WATER_VALVE_TURNS } from './training/modules/water-burst.js';
import { currentWaterStep, getWaterFlow, getWaterPressure, performWater, startWater, type WaterEvent, type WaterState, type WaterValveId } from './training/water-procedure.js';

const VALVES = ['A', 'B', 'C', 'D'] as const;
const TITLES: Readonly<Record<string, string>> = {
  'make-area-safe': 'Protect the area', 'identify-valves': 'Plan A then B',
  'notify-control': 'Notify control', 'close-valves': 'Close slowly',
  'confirm-isolation': 'Verify isolation', 'trench-safety': 'Trench checks',
  'ready-for-repair': 'Ready for repair',
};
const GROUPS = ['safety', 'plan', 'notify', 'valve', 'isolation', 'trench', 'repair'] as const;
const ACTION_TITLES = ['AREA SAFETY', 'PLAN', 'NOTIFY', 'VALVES', 'ISOLATION', 'TRENCH', 'APPROVAL'] as const;
const WATER_INSTRUCTIONS = Object.values(waterStepLines).map((line) => line.instruction);
const SHORT_CAPTIONS: Readonly<Record<string, string>> = {
  'make-area-safe': 'Place the barrier and sign. Check the spoil setback.',
  'identify-valves': 'Poke the network plan. C supplies the hospital: keep open.',
  'notify-control': 'Notify control and affected customers before closure.',
  'close-valves': 'Lift cover. Seat key. Roll slowly; regrip to continue.',
  'confirm-isolation': 'Open the washout. Verify zero flow and low pressure.',
  'trench-safety': 'Check support, access, spoil, atmosphere and flooding.',
  'ready-for-repair': "A human approves the work. Follow your employer's SOPs.",
};
interface WaterHome { position: Vector3; quaternion: Quaternion; worldY: number; }

/** Hands bind authored Water props to the common pure procedure and results services. */
export class WaterTrainingSystem extends createSystem({
  targets: { required: [WaterTarget] },
  held: { required: [WaterTarget, Grabbed] },
  pressed: { required: [WaterTarget, Pressed] },
  session: { required: [WaterSession] },
}) {
  private state!: WaterState;
  private sessionEntity!: Entity;
  private readonly panels = new Map<string, UIKitMLAsset>();
  private readonly homes = new Map<number, WaterHome>();
  private readonly seats = new Map<WaterValveId, Object3D>();
  private readonly coverEntities = new Map<WaterValveId, Entity>();
  private readonly createdEntities: Entity[] = [];
  private readonly audio = new CivicAudio();
  private readonly waterAudio = new WaterAudio();
  private readonly progress = new TrainingProgress();
  private readonly dailyProgress = new DailyDrillProgress();
  private readonly rollTracker = new ValveRollTracker();
  private readonly keyExit = new KeySocketExitGuard<WaterValveId>();
  private readonly point = new Vector3();
  private readonly targetPoint = new Vector3();
  private readonly grabOrigin = new Vector3();
  private readonly handQuaternion = new Quaternion();
  private readonly forward = new Vector3();
  private readonly panelForward = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly panelRight = new Vector3();
  private readonly panelAnchor = new Vector3();
  private readonly panelPoint = new Vector3();
  private readonly hold = new HoldConfirm();
  private readonly readyPress = new PointerPressLatch();
  private readonly turnEvent: Extract<WaterEvent, { type: 'turn-valve' }> = { type: 'turn-valve', valve: 'A', deltaTurns: 0, elapsedMs: 1 };
  private readonly liftEvent: { type: 'lift-cover'; valve: WaterValveId } = { type: 'lift-cover', valve: 'A' };
  private readonly seatEvent: { type: 'seat-key'; valve: WaterValveId } = { type: 'seat-key', valve: 'A' };
  private instructor!: ScriptedInstructor;
  private waterEffect!: ReturnType<typeof createWaterFlowEffect>;
  private effectEntity!: Entity;
  private keyEntity!: Entity;
  private waterRoad!: Object3D;
  private needle?: Object3D;
  private keyValve: WaterValveId | '' = '';
  private holder: 'left' | 'right' | null = null;
  private targetFlow = 1;
  private visualFlow = 1;
  private pressure = 4;
  private stepId = 'make-area-safe';
  private startedAt = '';
  private startedMs = 0;
  private saved = false;
  private resetting = false;
  private dailyMode = false;
  private networkRecovery = false;
  private disposed = false;
  private panelAnchorReady = false;

  private seatedRig!: SeatedPanelRig;
  private readonly dwell = new ModuleDwell();
  private a11y: AccessibilitySettings = loadSettings(browserStorage(), globalThis.location?.search ?? '');
  init(): void {
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get('seed') ?? 0);
    this.state = prepareProcedure(startWater(createWaterScenario(Number.isFinite(seed) ? seed : 0)));
    this.sessionEntity = this.world.requireSceneEntity('water-session');
    this.waterRoad = this.world.requireSceneObject('water-road');
    this.needle = this.waterRoad.getObjectByName('PressureNeedle');
    this.keyEntity = this.world.requireSceneEntity('water-key');
    for (const name of ['steps', 'controls', 'network', 'results']) this.panels.set(name, this.world.requireSceneObject<UIKitMLAsset>(`water-${name}-panel`));
    this.seatedRig = new SeatedPanelRig({ steps: [this.panels.get('steps')!], controls: [this.panels.get('controls')!, this.panels.get('network')!] });
    applyModuleAccessibility(this.a11y, { panels: this.panels, captionPanel: 'steps', captionFontSize: 2.7, captionHeight: 12.8, panelHeight: 49, steps: this.world.getSceneEntity('water-steps-panel')?.object3D, controls: this.world.getSceneEntity('water-controls-panel')?.object3D });
    this.instructor = createInstructor(() => {}, { volume: .7, llm: liveLlmOptions(), guidance: loadGuidance(browserStorage(), globalThis.location?.search ?? '') });
    for (const valve of VALVES) {
      const seat = this.waterRoad.getObjectByName(`ValveSeat${valve}`);
      if (!seat) throw new Error(`Water model is missing ValveSeat${valve}.`);
      this.seats.set(valve, seat);
      const cover = this.waterRoad.getObjectByName(`ValveCover${valve}`);
      if (!cover) throw new Error(`Water model is missing ValveCover${valve}.`);
      this.sessionEntity.object3D!.attach(cover);
      cover.name = `water-cover-${valve}`;
      const entity = this.world.createTransformEntity(cover, this.sessionEntity);
      entity.addComponent(WaterTarget, { kind: 'cover', valve });
      entity.addComponent(OneHandGrabbable); entity.addComponent(RayInteractable);
      this.coverEntities.set(valve, entity); this.createdEntities.push(entity);
    }
    for (const [name, action] of [['TrenchEntryTarget', 'enter-trench'], ['WashoutHandle', 'open-washout']] as const) {
      const object = this.waterRoad.getObjectByName(name); if (!object) continue;
      let hasMesh = false; object.traverse(child => { if (child instanceof Mesh) hasMesh = true; });
      if (!hasMesh) continue;
      this.sessionEntity.object3D!.attach(object);
      const entity = this.world.createTransformEntity(object, this.sessionEntity);
      entity.addComponent(WaterTarget, { kind: 'button', action }); entity.addComponent(RayInteractable);
      this.createdEntities.push(entity);
    }
    for (const entity of this.queries.targets.entities) this.cacheHome(entity);
    this.waterEffect = createWaterFlowEffect();
    this.effectEntity = this.world.createTransformEntity(this.waterEffect.root, this.sessionEntity);
    this.waterRoad.getObjectByName('BurstOutlet')!.getWorldPosition(this.point);
    this.waterEffect.root.position.copy(this.point); this.sessionEntity.object3D!.worldToLocal(this.waterEffect.root.position);
    this.bindControls();
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', entity => this.grab(entity)),
      this.queries.held.subscribe('disqualify', entity => this.release(entity)),
      this.queries.pressed.subscribe('qualify', entity => {
        const action = entity.getValue(WaterTarget, 'action');
        if (action === 'enter-trench' || action === 'open-washout') this.act(action);
      }),
      this.world.visibilityState.subscribe(visibility => {
        if (visibility === VisibilityState.Visible) this.unlockAudio();
        else { this.waterAudio.setFlow(0); this.audio.setRoadAmbience(false, false); }
      }),
      () => this.teardown(),
    );
    this.startedAt = new Date().toISOString(); this.startedMs = performance.now();
    this.setVisible('results', false); this.unlockAudio(); this.refresh();
    this.instructor.sayInstruction(waterStepLines['make-area-safe'].instruction);
    if (this.instructor.guidance === 'unguided') this.instructor.say(UNGUIDED_BRIEF);
  }

  private cacheHome(entity: Entity): void {
    const object = entity.object3D; if (!object) return;
    object.getWorldPosition(this.point);
    this.homes.set(entity.index, { position: object.position.clone(), quaternion: object.quaternion.clone(), worldY: this.point.y });
  }

  private unlockAudio(): void {
    if (this.world.visibilityState.peek() !== VisibilityState.Visible) return;
    this.audio.unlock(); this.audio.startRoadAmbience(); this.audio.setRoadAmbience(true, false); this.waterAudio.unlock(); this.waterAudio.setFlow(this.targetFlow); this.instructor.unlock();
  }

  private text(panel: string, id: string, text: string): void { this.panels.get(panel)?.getElementById<UIKit.Text>(id)?.setProperties({ text }); }
  private show(panel: string, id: string, visible: boolean): void { this.panels.get(panel)?.getElementById(id)?.setProperties({ display: visible ? 'flex' : 'none' }); }
  private setVisible(panel: string, visible: boolean): void { this.world.getSceneEntity(`water-${panel}-panel`)?.setValue(Visibility, 'isVisible', visible); }

  private bind(panel: string, id: string, callback: () => void): void {
    const element = this.panels.get(panel)?.getElementById(id); if (!element) return;
    element.name = id;
    this.cleanupFuncs.push(this.dwell.register(id, element, this.panels.get(panel)!, () => { this.unlockAudio(); this.audio.play('ui-tick'); callback(); }));
    this.cleanupFuncs.push(registerPokeableVisualTarget(element));
    const latch = new PointerPressLatch();
    const down = { transformTranslateZ: -.4 }, up = { transformTranslateZ: 0 };
    const depress = createPokeDepression(pressed => element.setProperties(pressed ? down : up));
    const cancel = (event: { pointerId: number }) => { latch.cancel(event.pointerId); depress(0); };
    element.setProperties({
      onPointerDown: (event: { pointerId: number }) => { latch.press(event.pointerId, element); depress(1); this.unlockAudio(); this.audio.play('ui-tick'); },
      onPointerUp: (event: { pointerId: number }) => { if (!latch.release(event.pointerId)) return; depress(0); if (this.world.visibilityState.peek() === VisibilityState.Visible) callback(); },
      onPointerCancel: cancel, onPointerLeave: cancel,
    });
    this.cleanupFuncs.push(() => { latch.reset(); element.setProperties({ onPointerDown: undefined, onPointerUp: undefined, onPointerCancel: undefined, onPointerLeave: undefined }); });
  }

  private bindControls(): void {
    this.bind('steps', 'back-to-jobs', () => window.dispatchEvent(new Event('civicops:jobs')));
    this.bind('steps', 'explain-why', () => {
      if (this.instructor instanceof LiveMetaInstructor) {
        const stepId = this.stepId;
        void this.instructor.ask(`Why is ${String(stepId).replace(/-/g, ' ')} required?`, { stepId, programme: 'water-burst' }).then((line) => {
          this.text('steps', 'caption', this.compactCaption(line));
        });
        return;
      }
      const why = waterStepLines[this.stepId]?.why; if (!why) return;
      this.instructor.say(why); this.text('steps', 'caption', this.compactCaption(why));
    });
    this.bind('network', 'plan-primary', () => this.selectPlan('B'));
    this.bind('network', 'plan-alternative', () => this.selectPlan('D'));
    for (const event of ['set-spoil-back', 'notify-control', 'open-washout', 'confirm-isolation', 'check-shoring', 'check-ladder', 'check-atmosphere', 'check-flooding', 'trench-safety'] as const) this.bind('controls', event, () => this.act(event));
    this.bind('results', 'try-again', () => this.reset(false));
    this.bind('results', 'daily-drill', () => this.reset(true));
    this.bind('results', 'back-to-jobs', () => window.dispatchEvent(new Event('civicops:jobs')));
    const ready = this.panels.get('controls')?.getElementById('ready-for-repair');
    if (!ready) return;
    ready.name = 'ready-for-repair'; this.cleanupFuncs.push(registerPokeableVisualTarget(ready));
    const cancel = (event: { pointerId: number }) => { this.readyPress.cancel(event.pointerId); this.hold.cancel(); this.text('controls', 'ready-for-repair', 'Ready for repair'); };
    ready.setProperties({
      onPointerDown: (event: { pointerId: number }) => { this.readyPress.press(event.pointerId, ready); this.hold.begin(this.stepId === 'ready-for-repair' && !this.state.completed, performance.now() / 1000); this.text('controls', 'ready-for-repair', 'Hold 0.8 seconds'); this.unlockAudio(); },
      onPointerUp: (event: { pointerId: number }) => { if (!this.readyPress.release(event.pointerId)) return; if (this.hold.release(this.stepId === 'ready-for-repair' && !this.state.completed)) this.act('ready-for-repair'); else this.text('controls', 'ready-for-repair', 'Ready for repair'); },
      onPointerCancel: cancel, onPointerLeave: cancel,
    });
    this.cleanupFuncs.push(() => { this.readyPress.reset(); this.hold.cancel(); ready.setProperties({ onPointerDown: undefined, onPointerUp: undefined, onPointerCancel: undefined, onPointerLeave: undefined }); });
  }

  private selectPlan(second: 'B' | 'D'): void {
    this.act({ type: 'plan-isolation', valves: ['A', second] });
    if (this.state.physical.schematicChecked && second === (this.state.scenario.variations.includes('seized-valve') ? 'D' : 'B')) {
      this.networkRecovery = false; this.refresh();
    }
  }

  private compactCaption(message: string): string {
    if (message.includes('Water hammer')) return 'Water hammer: too fast. Slow turns prevent a pressure surge.';
    if (message.includes('Critical customer')) return 'C supplies the hospital. Stop: human authorisation is required.';
    if (message.includes('Unsafe trench')) return 'Stop. Check shoring, access and all trench conditions before entry.';
    if (message.includes('seized')) return this.instructor.guidance === 'unguided' ? WATER_SEIZED_UNGUIDED_SHORT : 'B is seized. Do not force it. Ask control for the A-D route.';
    if (message.includes('Barriers') || message.includes('Protect the burst')) return 'Protect the trench and burst first. Place barriers and the sign.';
    if (message.length <= 65) return message;
    const sentence = message.split('. ')[0];
    return sentence.length <= 65 ? sentence + (sentence.endsWith('.') ? '' : '.') : sentence.slice(0, 62).replace(/\s+\S*$/, '') + '.';
  }

  private act(event: WaterEvent): void {
    if (this.disposed || this.resetting || this.state.completed || this.world.visibilityState.peek() !== VisibilityState.Visible) return;
    const previous = this.state;
    this.state = assessmentFeedback(performWater(previous, event, Math.round(performance.now() - this.startedMs)), this.instructor.guidance);
    if (this.state === previous) return;
    const action = typeof event === 'string' ? event : event.type;
    if (action === 'turn-valve' && this.state.feedback.includes('seized')) this.networkRecovery = true;
    this.sessionEntity.setValue(WaterSession, 'lastAction', action);
    this.sessionEntity.setValue(WaterSession, 'lastFeedback', this.state.feedback);
    this.targetFlow = getWaterFlow(this.state); this.pressure = getWaterPressure(this.state);
    this.waterAudio.setFlow(this.targetFlow);
    if (this.state.criticalErrors.length > previous.criticalErrors.length) {
      this.audio.play('warning-buzz'); if (this.state.feedback.includes('Water hammer')) this.waterAudio.hammer();
      this.instructor.say(this.state.feedback);
    } else if (action === 'turn-valve') {
      this.waterAudio.valve();
      if (this.state.feedback.includes('seized') || this.state.feedback.includes('continues flowing') || this.state.steps.length !== previous.steps.length) this.instructor.say(this.state.feedback);
    } else { this.audio.play(action === 'seat-key' ? 'lock-click' : 'ui-tick'); this.instructor.say(this.state.feedback); }
    if (action === 'open-washout') { const handle = this.waterRoad.getObjectByName('WashoutHandle'); if (handle) handle.rotation.y = Math.PI / 2; }
    this.refresh();
    if (currentWaterStep(previous)?.id === currentWaterStep(this.state)?.id) this.text('steps', 'caption', this.compactCaption(this.state.feedback));
    if (this.state.completed) this.finish();
  }

  private grab(entity: Entity): void {
    if (this.resetting || this.disposed || this.state.completed) return;
    this.unlockAudio(); this.audio.play('ui-tick');
    if (entity !== this.keyEntity) return;
    this.holder = this.world.getSystem(GrabSystem)?.getHolderHand(entity) ?? null;
    if (!this.holder) return;
    this.player.gripSpaces[this.holder].getWorldPosition(this.grabOrigin);
    this.rollTracker.begin(this.handRoll());
    if (this.keyValve) {
      entity.setValue(OneHandGrabbable, 'translate', false);
      entity.setValue(OneHandGrabbable, 'rotate', false);
    }
  }

  private handRoll(): number {
    if (!this.holder) return 0;
    this.player.gripSpaces[this.holder].getWorldQuaternion(this.handQuaternion);
    const q = this.handQuaternion;
    return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
  }

  private flushTurn(force: boolean): void {
    if (!this.keyValve || !this.rollTracker.take(force)) return;
    this.turnEvent.valve = this.keyValve;
    this.turnEvent.deltaTurns = this.rollTracker.turns;
    this.turnEvent.elapsedMs = this.rollTracker.durationMs;
    this.act(this.turnEvent);
  }

  private release(entity: Entity): void {
    if (this.resetting || this.disposed || this.state.completed || !entity.object3D) return;
    const kind = entity.getValue(WaterTarget, 'kind');
    if (entity === this.keyEntity) {
      this.flushTurn(true); this.holder = null;
      entity.setValue(OneHandGrabbable, 'translate', true);
      entity.setValue(OneHandGrabbable, 'rotate', true);
      return;
    }
    if (kind === 'cover') {
      const valve = entity.getValue(WaterTarget, 'valve') as WaterValveId;
      const home = this.homes.get(entity.index); if (!home) return;
      entity.object3D.getWorldPosition(this.point);
      if (this.point.y - home.worldY >= WATER_COVER_LIFT_HEIGHT && !this.state.physical.valves[valve].coverRemoved) this.act({ type: 'lift-cover', valve });
      entity.object3D.position.copy(home.position);
      if (this.state.physical.valves[valve].coverRemoved) entity.object3D.position.z += .55;
      entity.object3D.quaternion.copy(home.quaternion);
      return;
    }
    if (kind !== 'barrier' && kind !== 'sign') return;
    const seat = this.waterRoad.getObjectByName(kind === 'barrier' ? 'BarrierSeat' : 'SignSeat');
    if (!seat) return;
    entity.object3D.getWorldPosition(this.point); seat.getWorldPosition(this.targetPoint);
    if (this.point.distanceToSquared(this.targetPoint) > 1.1025) return;
    this.act(kind === 'barrier' ? 'place-barriers' : 'place-sign');
    const applied = kind === 'barrier' ? this.state.physical.barriersPlaced : this.state.physical.signPlaced;
    if (!applied) return;
    entity.object3D.position.copy(this.targetPoint); entity.object3D.parent!.worldToLocal(entity.object3D.position);
    entity.object3D.quaternion.identity(); entity.setValue(WaterTarget, 'snapped', true);
    entity.setValue(OneHandGrabbable, 'translate', false); entity.setValue(OneHandGrabbable, 'rotate', false);
    this.audio.play('lock-click');
  }

  private refresh(): void {
    const step = currentWaterStep(this.state); this.stepId = step?.id ?? this.stepId;
    const alternate = this.state.scenario.variations.includes('seized-valve');
    const order = waterBurstModule.steps.find((definition) => definition.id === this.stepId)?.order ?? waterBurstModule.steps.length;
    const title = assessmentStepTitle(this.instructor.guidance, waterStepTitle(this.stepId, alternate, this.instructor.guidance, TITLES[this.stepId]), order, waterBurstModule.steps.length);
    this.text('steps', 'current-step', title ?? 'Practice complete');
    this.text('steps', 'caption', guidanceCaption(this.instructor.guidance, SHORT_CAPTIONS[this.stepId], this.state.feedback, WATER_INSTRUCTIONS, (text) => this.compactCaption(text)));
    let complete = 0;
    for (const definition of waterBurstModule.steps) {
      const correct = this.state.steps.some(result => result.stepId === definition.id && result.outcome === 'correct');
      if (correct) complete++;
      this.text('steps', `step-${definition.order}`, correct ? '+' : `${definition.order}`);
      this.panels.get('steps')?.getElementById(`step-${definition.order}`)?.setProperties({ backgroundColor: correct ? '#103d50' : definition.id === this.stepId ? '#f5d78c' : '#e3ebe5', color: correct ? '#ffffff' : '#103d50' });
    }
    this.text('steps', 'step-progress', `${complete} / 7 complete`);
    const index = Math.max(0, waterBurstModule.steps.findIndex(definition => definition.id === this.stepId));
    for (let group = 0; group < GROUPS.length; group++) this.show('controls', `${GROUPS[group]}-actions`, group === index);
    this.panels.get('controls')?.getElementById('panel-root')?.setProperties({ height: this.stepId === 'trench-safety' || this.stepId === 'close-valves' ? 36 : this.stepId === 'confirm-isolation' ? 23 : 32 });
    this.text('controls', 'action-title', ACTION_TITLES[index]);
    this.text('controls', 'pressure', `${this.pressure.toFixed(1)} bar`);
    this.text('controls', 'flow-status', this.targetFlow < .005 ? 'ZERO FLOW' : 'FLOWING');
    this.text('network', 'network-status', waterNetworkStatus(this.instructor.guidance, this.state.physical.schematicChecked, alternate, this.networkRecovery));
    const networkVisible = !this.state.completed && (this.stepId === 'identify-valves' || this.networkRecovery);
    this.setVisible('network', networkVisible); this.setVisible('controls', !this.state.completed && !networkVisible);
    for (const [event, field, label] of [
      ['check-shoring', 'shoringChecked', 'Shoring'], ['check-ladder', 'ladderChecked', 'Ladder'],
      ['check-atmosphere', 'atmosphereChecked', 'Air'], ['check-flooding', 'floodingChecked', 'Flooding'],
    ] as const) {
      const checked = this.state.physical[field];
      this.text('controls', event, checked ? `${label}\nchecked` : `Check\n${label.toLowerCase()}`);
      this.panels.get('controls')?.getElementById(event)?.setProperties({ backgroundColor: checked ? '#174d2c' : '#103d50' });
    }
    this.updateTurnReadout();
    if (this.needle) this.needle.rotation.z = (4 - this.pressure) / 4 * 130 * Math.PI / 180;
    this.sessionEntity.setValue(WaterSession, 'step', this.stepId);
    this.sessionEntity.setValue(WaterSession, 'complete', this.state.completed);
    this.sessionEntity.setValue(WaterSession, 'failed', this.state.failed);
    this.sessionEntity.setValue(WaterSession, 'score', score(this.state));
    this.sessionEntity.setValue(WaterSession, 'pressureBar', this.pressure);
    this.sessionEntity.setValue(WaterSession, 'flow', this.targetFlow);
    this.sessionEntity.setValue(WaterSession, 'keyValve', this.keyValve);
    for (const valve of VALVES) this.sessionEntity.setValue(WaterSession, `turns${valve}`, this.state.physical.valves[valve].turns);
    if (this.sessionEntity.hasComponent(TrainingSession)) {
      this.sessionEntity.setValue(TrainingSession, 'step', this.stepId);
      this.sessionEntity.setValue(TrainingSession, 'complete', this.state.completed);
      this.sessionEntity.setValue(TrainingSession, 'failed', this.state.failed);
      this.sessionEntity.setValue(TrainingSession, 'score', score(this.state));
    }
  }

  private updateTurnReadout(): void {
    const turns = this.keyValve ? this.state.physical.valves[this.keyValve].turns : 0;
    this.text('controls', 'turn-count', this.keyValve ? `${this.keyValve} / ${turns.toFixed(2)} OF 3\nCONTROLLED TURNS` : 'KEY / NOT SEATED');
    this.text('controls', 'turn-dial', `${Math.floor(turns)}`);
    this.text('controls', 'turn-guide', waterTurnGuide(this.instructor.guidance, !!this.keyValve));
    for (let index = 1; index <= 3; index++) this.panels.get('controls')?.getElementById(`turn-mark-${index}`)?.setProperties({ backgroundColor: turns >= index ? '#103d50' : '#dce6df' });
  }

  private finish(): void {
    if (this.saved) return; this.saved = true;
    this.world.getSystem(GrabSystem)?.forceRelease(this.keyEntity);
    this.waterAudio.setFlow(0); this.hold.cancel(); this.readyPress.reset();
    const attempt = buildAttempt(this.state, {
      startedAt: this.startedAt, completedAt: new Date().toISOString(),
      crewId: 'water-01', accessibility: attemptAccessibility(this.a11y), device: attemptDevice(this.world.renderer.xr.isPresenting),
    }, waterBurstModule);
    const certification = this.progress.record(attempt, waterBurstModule);
    if (this.dailyMode) this.dailyProgress.recordDailyPass(attempt);
    const comeback = comeBackSummary(this.progress.getAttempts(), new Date(), { moduleId: waterBurstModule.id, crewId: 'water-01', passMark: waterBurstModule.passMark });
    presentModuleResults(this.panels.get('results')!, {
      attempt, module: waterBurstModule, certification, comeback,
      daily: this.dailyProgress.moduleDailyStatus(waterBurstModule),
      departmentLabel: 'WATER', completeEyebrow: 'CIVICOPS / WATER ISOLATION COMPLETE',
      feedback: this.compactCaption(this.state.feedback),
    });
    placeReviewPanel(this.panels.get('results')!, this.player.head, this.panels.get('results')?.getElementById('result-body'));
    for (const name of ['steps', 'controls', 'network']) this.setVisible(name, false);
    this.setVisible('results', true); this.world.renderer.toneMappingExposure = .72;
    if (attempt.passed) this.audio.play('success-chime');
  }

  private reset(daily: boolean): void {
    this.resetting = true; this.dailyMode = daily; this.networkRecovery = false;
    for (const entity of this.queries.targets.entities) {
      this.world.getSystem(GrabSystem)?.forceRelease(entity);
      const home = this.homes.get(entity.index);
      if (home && entity.object3D) { entity.object3D.position.copy(home.position); entity.object3D.quaternion.copy(home.quaternion); }
      entity.setValue(WaterTarget, 'snapped', false);
      if (entity.hasComponent(OneHandGrabbable)) { entity.setValue(OneHandGrabbable, 'translate', true); entity.setValue(OneHandGrabbable, 'rotate', true); }
    }
    this.state = prepareProcedure(startWater(daily ? createWaterDailyDrill().scenario : this.state.scenario));
    this.keyValve = ''; this.holder = null; this.rollTracker.begin(0); this.keyExit.reset();
    this.targetFlow = 1; this.visualFlow = 1; this.pressure = 4; this.saved = false;
    this.startedAt = new Date().toISOString(); this.startedMs = performance.now();
    this.hold.cancel(); this.readyPress.reset();
    this.text('controls', 'ready-for-repair', 'Ready for repair');
    const handle = this.waterRoad.getObjectByName('WashoutHandle'); if (handle) handle.rotation.y = 0;
    this.world.renderer.toneMappingExposure = 1;
    this.setVisible('results', false); for (const name of ['steps', 'controls', 'network']) this.setVisible(name, true);
    this.resetting = false; this.unlockAudio(); this.refresh();
    this.instructor.sayInstruction(waterStepLines['make-area-safe'].instruction);
    if (this.instructor.guidance === 'unguided') this.instructor.say(UNGUIDED_BRIEF);
  }

  update(delta: number, time: number): void {
    if (this.disposed || this.world.visibilityState.peek() !== VisibilityState.Visible) return;
    this.dwell.tick(this.a11y.dwellSelect, this.player.head, performance.now());
    this.visualFlow += (this.targetFlow - this.visualFlow) * Math.min(1, delta * 3.5);
    this.waterEffect.update(time, this.visualFlow, this.state.physical.washoutOpen);
    // Object3D.getWorldDirection is the head's +Z (behind the eyes); panels need the view direction.
    this.player.head.getWorldPosition(this.point); this.player.head.getWorldDirection(this.forward);
    this.panelForward.set(-this.forward.x, 0, -this.forward.z);
    if (this.panelForward.lengthSq() < 1e-6) this.panelForward.set(0, 0, -1); else this.panelForward.normalize();
    if (this.seatedRig.update(this.player, this.player.head, this.a11y)) this.panelAnchorReady = false;
    if (!this.seatedRig.seated) this.syncPanelAnchor();
    this.forward.negate();
    this.audio.setListenerPose(this.point, this.forward, this.up);
    if (this.hold.pressed) {
      const wasReady = this.hold.ready; this.hold.advanceAt(performance.now() / 1000);
      if (!wasReady && this.hold.ready) this.text('controls', 'ready-for-repair', 'Release to confirm');
    }
    if (this.state.completed) return;
    for (const entity of this.queries.held.entities) {
      if (!entity.object3D || entity.getValue(WaterTarget, 'kind') !== 'cover') continue;
      const valve = entity.getValue(WaterTarget, 'valve') as WaterValveId;
      if (this.state.physical.valves[valve].coverRemoved) continue;
      const home = this.homes.get(entity.index); if (!home) continue;
      entity.object3D.getWorldPosition(this.point);
      if (this.point.y - home.worldY >= WATER_COVER_LIFT_HEIGHT) { this.liftEvent.valve = valve; this.act(this.liftEvent); }
    }
    const held = this.queries.held.entities.has(this.keyEntity);
    if (held && !this.holder) {
      this.holder = this.world.getSystem(GrabSystem)?.getHolderHand(this.keyEntity) ?? null;
      if (this.holder) { this.player.gripSpaces[this.holder].getWorldPosition(this.grabOrigin); this.rollTracker.begin(this.handRoll()); }
    }
    if (held && this.keyValve && this.holder) {
      this.player.gripSpaces[this.holder].getWorldPosition(this.point);
      if (this.point.y - this.grabOrigin.y > .65 && this.point.distanceToSquared(this.grabOrigin) > .64) {
        this.flushTurn(true); this.keyExit.beginExit(this.keyValve); this.keyValve = '';
        this.keyEntity.setValue(WaterTarget, 'snapped', false);
        this.keyEntity.setValue(OneHandGrabbable, 'translate', true); this.keyEntity.setValue(OneHandGrabbable, 'rotate', true);
        this.refresh();
      } else { this.rollTracker.sample(this.handRoll(), delta); this.flushTurn(false); }
    }
    if (held && !this.keyValve) {
      this.keyEntity.object3D!.getWorldPosition(this.point);
      if (this.keyExit.blockedValve) {
        this.seats.get(this.keyExit.blockedValve)!.getWorldPosition(this.targetPoint);
        this.keyExit.observeExit(this.point.distanceToSquared(this.targetPoint));
      }
      for (const valve of VALVES) {
        if (!this.keyExit.canSeat(valve)) continue;
        if (!this.state.physical.valves[valve].coverRemoved) continue;
        this.seats.get(valve)!.getWorldPosition(this.targetPoint);
        if (this.point.distanceToSquared(this.targetPoint) > WATER_KEY_SNAP_RADIUS * WATER_KEY_SNAP_RADIUS) continue;
        this.keyValve = valve; this.seatEvent.valve = valve; this.act(this.seatEvent);
        this.keyEntity.setValue(WaterTarget, 'snapped', true);
        this.keyEntity.setValue(OneHandGrabbable, 'translate', false); this.keyEntity.setValue(OneHandGrabbable, 'rotate', false);
        if (this.holder) { this.rollTracker.begin(this.handRoll()); this.player.gripSpaces[this.holder].getWorldPosition(this.grabOrigin); }
        this.refresh(); break;
      }
    }
    if (this.keyValve) {
      const key = this.keyEntity.object3D!;
      this.seats.get(this.keyValve)!.getWorldPosition(this.point); key.position.copy(this.point); key.parent!.worldToLocal(key.position);
      key.quaternion.identity(); key.rotation.y = this.state.physical.valves[this.keyValve].turns * Math.PI * 2;
    }
  }

  /** Keep essential controls one comfortable step ahead after teleporting around the road. */
  private syncPanelAnchor(): void {
    const moved = this.panelAnchorReady && this.panelAnchor.distanceToSquared(this.point) > 4;
    if (this.panelAnchorReady && !moved) return;
    this.panelAnchorReady = true;
    this.panelRight.crossVectors(this.panelForward, this.up).normalize();
    this.panelAnchor.copy(this.point).addScaledVector(this.panelForward, 1.65);
    this.panelAnchor.y = Math.max(1.55, this.point.y + .08);
    const layout: ReadonlyArray<readonly [string, number]> = [['steps', handedX(-.27, this.a11y)], ['controls', handedX(.27, this.a11y)], ['network', 0], ['results', 0]];
    const yaw = Math.atan2(-this.panelForward.x, -this.panelForward.z);
    for (const [name, offset] of layout) {
      const panel = this.panels.get(name); if (!panel) continue;
      this.panelPoint.copy(this.panelAnchor).addScaledVector(this.panelRight, offset);
      if (panel.parent) panel.parent.worldToLocal(this.panelPoint);
      panel.position.copy(this.panelPoint);
      panel.rotation.set(-8 * Math.PI / 180, yaw, 0);
    }
  }

  private teardown(): void {
    if (this.disposed) return; this.disposed = true; this.resetting = true;
    for (const entity of this.queries.held.entities) this.world.getSystem(GrabSystem)?.forceRelease(entity);
    this.audio.dispose(); this.waterAudio.dispose(); this.instructor.dispose();
    this.effectEntity.dispose({ disposeResources: false }); this.waterEffect.dispose();
    for (const entity of this.createdEntities) entity.dispose({ disposeResources: false });
    this.createdEntities.length = 0; this.coverEntities.clear(); this.panels.clear(); this.homes.clear(); this.seats.clear();
  }
}

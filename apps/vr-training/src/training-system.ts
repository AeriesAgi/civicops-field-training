import { attemptDevice } from './training/attempt-context.js';
import { browserStorage } from './training/browser-storage.js';
import { prepareProcedure } from './training/programme-state.js';
import {
  createSystem, Entity, Grabbed, GrabSystem, Hovered, Mesh, MeshStandardMaterial,
  Object3D, OneHandGrabbable, Pressed, Quaternion, UIKit, UIKitMLAsset,
  Vector3, Visibility, VisibilityState,
} from '@iwsdk/core';
import { applyModuleAccessibility } from './module-accessibility.js';
import { ModuleDwell } from './module-dwell.js';
import { loadSettings, saveSettings, type AccessibilitySettings } from './training/accessibility-settings.js';
import { registerPokeableVisualTarget } from './hand-visual-system.js';
import { HoldConfirm } from './training/hold-confirm.js';
import { contextAction, checklist } from './training/presentation.js';
import { createHoldRing } from './scene-assets/hold-ring.scene-asset.js';
import { setTesterReadout } from './scene-assets/tester-readout.js';
import { FirstMinutes, TrainingSession, TrainingTarget } from './training-components.js';
import { elecLotoModule, createScenario, type LotoVariation } from './training/modules/elec-loto.js';
import { currentStep, getVoltage, hint, perform, start } from './training/procedure.js';
import type { ProcedureEvent, ProcedureState } from './training/procedure.js';
import { buildAttempt, defaultAccessibility, score } from './training/scoring.js';
import { TrainingProgress } from './training/progress.js';
import { presentModuleResults } from './training/module-results.js';
import { placeReviewPanel } from './training/review-panel.js';
import { CivicOpsClient, exportResults } from './training/civicops-client.js';
import { ScriptedInstructor } from './training/instructor.js';
import { createInstructor, LiveMetaInstructor, liveLlmOptions } from './training/meta-instructor.js';
import { loadGuidance, UNGUIDED_BRIEF } from './training/guidance.js';
import { assessmentStepTitle, automaticCoaching } from './training/assessment-cues.js';
import { CivicAudio } from './training/civic-audio.js';
import { OnboardingSession, GhostDemoTracker } from './training/onboarding.js';
import { DailyDrillProgress, dailyDrill, comeBackSummary } from './training/daily-drill.js';
import { createGestureFeedback } from './scene-assets/gesture-feedback.js';
import { PointerPressLatch } from './training/pointer-press.js';
import { createPokeDepression } from './training/gesture-feedback.js';
import { IdleHintTimer } from './training/idle-hints.js';
import { gestureDemoBinding } from './training/gesture-demo-binding.js';
import { desktopIntent, isDesktopTool, TOOL_LABELS, type DesktopTool } from './ui/desktop-intents.js';
import { lessonView, resultView } from './ui/lesson-view.js';
import { savedVolume } from './ui/title-options.js';
import { isDesktopSession, publishLesson, publishResult, publishToast } from './ui/desktop-bridge.js';

interface HomePose { position: Vector3; quaternion: Quaternion }
const HANDS = ['left', 'right'] as const;
const STEP_TARGETS: Record<string, string> = {
  'identify-circuit': 'breaker-sl-3', 'notify-control': 'controls-panel',
  'switch-off': 'breaker-sl-3', 'apply-lock': 'padlock', 'apply-tag': 'danger-tag', 'try-start': 'breaker-sl-3',
  'prove-tester': 'proving-unit', 'test-dead': 'terminals',
  're-prove-tester': 'proving-unit', 'safe-to-work': 'controls-panel',
};

/** ECS binds tracked hands and authored objects to the pure procedure. */
const DISPLAY_STEPS = ['Confirm circuit', 'Notify control', 'Switch OFF', 'Apply personal lock', 'Add danger tag', 'Try to start', 'Prove tester', 'Verify 0 V', 'Re-prove tester', 'Safe to work'];

export class TrainingSystem extends createSystem({
  targets: { required: [TrainingTarget] },
  pressed: { required: [TrainingTarget, Pressed] },
  held: { required: [TrainingTarget, Grabbed] },
  hovered: { required: [TrainingTarget, Hovered] },
  session: { required: [TrainingSession] },
}) {
  private state!: ProcedureState;
  private onboarding!: OnboardingSession;
  private demos!: GhostDemoTracker;
  private returnProgress!: DailyDrillProgress;
  private readonly audio = new CivicAudio();
  private feedback!: ReturnType<typeof createGestureFeedback>;
  private feedbackEntity!: Entity;
  private minutes!: Entity;
  private demoOrigin = new Vector3();
  private demoDestination = new Vector3();
  private hoverSize = new Vector3(.07, .09, .07);
  private soundForward = new Vector3();
  private soundUp = new Vector3(0, 1, 0);
  private masterVolume = .7;
  private dailyMode = false;
  private phaseAtMs = 0;
  private lastPhase = '';
  private activeStep = 'identify-circuit';
  private demoDrawn = '';
  private lastCaption = '';
  private terminalObject!: Object3D;
  private provingContact!: Object3D;
  private lineContact!: Object3D;
  private neutralContact!: Object3D;
  private progress!: TrainingProgress;
  private client!: CivicOpsClient;
  private instructor!: ScriptedInstructor;
  private readonly dwell = new ModuleDwell();
  private a11y: AccessibilitySettings = loadSettings(browserStorage(), globalThis.location?.search ?? '');
  private accessibility = { ...defaultAccessibility, oneHanded: this.a11y.oneHanded, gazePinch: this.a11y.gazePinch, highContrast: this.a11y.highContrast, captions: this.a11y.captions, benchHeightOffset: this.a11y.benchHeightOffset };
  private persistA11y(): void { this.a11y = { ...this.a11y, oneHanded: this.accessibility.oneHanded, gazePinch: this.accessibility.gazePinch, highContrast: this.accessibility.highContrast, captions: this.accessibility.captions }; saveSettings(browserStorage(), this.a11y); }
  private panels = new Map<string, UIKitMLAsset>();
  private homes = new Map<number, HomePose>();
  private materials = new Map<number, MeshStandardMaterial[]>();
  private point = new Vector3();
  private targetPoint = new Vector3();
  private finger = new Vector3();
  private testerTip = new Vector3(0, 0, -0.1);
  private tipIndices = [-1, -1];
  private jointCounts = [0, 0];
  private fingerViews: ReturnType<Entity['getVectorView']>[] = [];
  private startedAt = '';
  private startedMs = 0;
  private readonly idleHints = new IdleHintTimer();
  private lastSensor = '';
  private lastAction = '';
  private schematicChecked = false;
  private greeted = false;
  private saved = false;
  private resetting = false;
  private serial = 0;
  private settingsOpen = false;
  private jobsOpen = false;
  private readonly safeHold = new HoldConfirm();
  private readonly safePress = new PointerPressLatch();
  private holdRing!: ReturnType<typeof createHoldRing>;
  private holdEntity!: Entity;
  private holdReadyShown = false;
  /** Desktop (mouse and keyboard) play: the tool currently in the trainee's hand. */
  private desktopHeld?: Entity;
  private desktopTouch?: { point: Vector3; until: number };
  private readonly heldPoint = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly cameraRight = new Vector3();
  private readonly cameraUp = new Vector3();
  private tryWiggleUntil = 0;
  private reading = '';

  init(): void {
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get('seed') ?? 0);
    const variations = params.has('variation') ? params.get('variation')!.split(',').filter((value): value is LotoVariation => value === 'mislabelled-breaker' || value === 'backfeed') : undefined;
    this.state = prepareProcedure(start(createScenario(Number.isFinite(seed) ? seed : 0, variations)));
    this.terminalObject = this.world.requireSceneObject('terminals');
    this.lineContact = this.terminalObject.getObjectByName('LineContact')!;
    this.neutralContact = this.terminalObject.getObjectByName('NeutralContact')!;
    this.provingContact = this.world.requireSceneObject('proving-unit').getObjectByName('KnownLiveContact')!;
    const sessionEntity = this.world.requireSceneEntity('bench-rig');
    this.fingerViews = [sessionEntity.getVectorView(TrainingSession, 'leftIndexTip'),
      sessionEntity.getVectorView(TrainingSession, 'rightIndexTip')];
    this.progress = new TrainingProgress();
    this.returnProgress = new DailyDrillProgress();
    this.demos = new GhostDemoTracker(this.returnProgress.getSeenGestures());
    this.onboarding = new OnboardingSession({ returning: this.returnProgress.isReturning() || this.progress.getAttempts().length > 0 });
    this.minutes = sessionEntity;
    this.feedback = createGestureFeedback();
    this.feedbackEntity = this.world.createTransformEntity(this.feedback.root);
    this.cleanupFuncs.push(() => { this.feedbackEntity.dispose({ disposeResources: false }); this.feedback.dispose(); this.audio.dispose(); });
    this.client = new CivicOpsClient();
    for (const name of ['work-order', 'steps', 'captions', 'controls', 'results', 'settings', 'settings-toggle', 'jobs']) {
      this.panels.set(name, this.world.requireSceneObject<UIKitMLAsset>(`${name}-panel`));
    }
    this.instructor = createInstructor((line) => { this.lastCaption = line; this.text('captions', 'caption', line); this.publishDesktop(); }, { volume: this.masterVolume, llm: liveLlmOptions(), guidance: loadGuidance(browserStorage(), globalThis.location?.search ?? '') });
    if (this.instructor.guidance === 'unguided') this.instructor.say(UNGUIDED_BRIEF);
    this.cleanupFuncs.push(() => this.instructor.dispose());
    for (const entity of this.queries.targets.entities) this.prepareTarget(entity);
    // Shared, persisted accessibility settings (set on the AR assist screen, the quick-start or here).
    applyModuleAccessibility(this.a11y, { panels: this.panels, captionPanel: 'captions', captionFontSize: 2.2, panelHeight: 12, contrastPanels: ['work-order', 'steps', 'settings', 'controls'],
      steps: this.world.getSceneEntity('steps-panel')?.object3D, controls: this.world.getSceneEntity('controls-panel')?.object3D });
    if (!this.a11y.captions) this.world.getSceneEntity('captions-panel')?.setValue(Visibility, 'isVisible', false);
    if (this.a11y.gazePinch) this.input.xr.gazeEnabled = true;
    this.text('settings', 'one-handed', `One hand\n${this.accessibility.oneHanded ? 'ON' : 'OFF'}`);
    this.text('settings', 'high-contrast', `Contrast\n${this.accessibility.highContrast ? 'HIGH' : 'NORMAL'}`);
    this.text('settings', 'gaze-pinch', `Gaze\n${this.accessibility.gazePinch ? 'ON' : 'OFF'}`);
    this.text('settings', 'captions-toggle', `Captions\n${this.accessibility.captions ? 'ON' : 'OFF'}`);
    if (this.a11y.oneHanded) for (const entity of this.queries.targets.entities) {
      if (entity.getValue(TrainingTarget, 'kind') !== 'tool') continue;
      const home = this.homes.get(entity.index);
      if (home && entity.object3D) entity.object3D.position.x = home.position.x * 0.7;
    }
    this.holdRing = createHoldRing();
    this.holdEntity = this.world.createTransformEntity(this.holdRing.root, this.world.requireSceneEntity('controls-panel'));
    this.cleanupFuncs.push(() => { this.holdEntity.dispose({ disposeResources: false }); this.holdRing.root.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); if (!Array.isArray(object.material)) object.material.dispose(); } }); });
    this.cleanupFuncs.push(
      // On desktop the mouse picker drives presses; ignore the emulator pointer so one click is one action.
      this.queries.pressed.subscribe('qualify', (entity) => { if (!this.isDesktop()) this.activate(entity); }),
      this.queries.held.subscribe('qualify', (entity) => { if (this.isDesktop()) return; this.idleHints.reset(); this.learnGesture('pinch-grab'); this.syncDemo(); entity.object3D?.getWorldPosition(this.point); this.audio.play(entity.object3D?.name === 'danger-tag' ? 'tag-rustle' : 'ui-tick', this.point); }),
      this.queries.held.subscribe('disqualify', (entity) => { if (!this.isDesktop()) this.release(entity); }),
      this.world.visibilityState.subscribe((visibility) => {
        if (visibility === VisibilityState.Visible) {
          this.onboarding.enterXR(performance.now());
          this.audio.unlock(); this.audio.startRoadAmbience(); this.audio.setRoadAmbience(true, false); this.instructor.unlock();
          if (this.onboarding.phase === 'returning-choice' || this.onboarding.phase === 'raise-hands') this.instructor.sayLine(this.onboarding.phase);
          else this.instructor.sayStep(this.activeStep);
          this.refresh();
        } else this.audio.setRoadAmbience(false, false);
      }),
    );
    this.bindControls();
    this.world.requireSceneEntity('results-panel').setValue(Visibility, 'isVisible', false);
    this.setVolume(savedVolume(browserStorage()));
    if (this.accessibility.benchHeightOffset) this.world.requireSceneObject('bench-rig').position.y = this.accessibility.benchHeightOffset;
    this.bindDesktop();
    if (this.isDesktop()) this.enterDesktop();
    else this.instructor.sayLine('raise-hands');
    this.refresh();
  }

  private isDesktop(): boolean {
    return isDesktopSession() && !this.world.renderer.xr.isPresenting;
  }

  private interactive(): boolean {
    return this.world.visibilityState.peek() === VisibilityState.Visible || this.isDesktop();
  }

  /** Desktop play skips hand detection and the first-lock offer: the full lesson starts at once. */
  private enterDesktop(): void {
    this.greeted = true;
    this.onboarding.phase = 'training';
    this.audio.unlock(); this.audio.startRoadAmbience(); this.audio.setRoadAmbience(true, false); this.instructor.unlock();
    this.startedAt = new Date().toISOString();
    this.startedMs = performance.now();
    if (this.instructor.guidance === 'unguided') this.instructor.say(UNGUIDED_BRIEF);
    else this.instructor.sayStep('identify-circuit');
  }

  private bindDesktop(): void {
    const pick = (event: Event) => { const name = (event as CustomEvent<{ name: string }>).detail?.name; if (name) this.desktopPick(name); };
    const command = (event: Event) => { const cmd = (event as CustomEvent<{ cmd: string }>).detail?.cmd; if (cmd) this.desktopCommand(cmd); };
    window.addEventListener('civicops:desktop-pick', pick);
    window.addEventListener('civicops:desktop-command', command);
    this.cleanupFuncs.push(() => { window.removeEventListener('civicops:desktop-pick', pick); window.removeEventListener('civicops:desktop-command', command); });
  }

  private heldTool(): DesktopTool | undefined {
    const name = this.desktopHeld?.object3D?.name ?? '';
    return isDesktopTool(name) ? name : undefined;
  }

  private desktopPick(name: string): void {
    if (!this.isDesktop() || this.resetting) return;
    this.idleHints.reset();
    this.audio.unlock(); this.instructor.unlock();
    if (!this.canAct()) return;
    const intent = desktopIntent(name, this.heldTool());
    switch (intent.kind) {
      case 'pick-up': {
        const entity = [...this.queries.targets.entities].find(candidate => candidate.object3D?.name === intent.tool);
        if (!entity) return;
        if (entity.getValue(TrainingTarget, 'snapped')) { publishToast(`Your ${TOOL_LABELS[intent.tool]} is already in place.`, 'info'); return; }
        this.desktopPutDown();
        this.desktopHeld = entity;
        entity.object3D?.getWorldPosition(this.point);
        this.audio.play(intent.tool === 'danger-tag' ? 'tag-rustle' : 'ui-tick', this.point);
        this.learnGesture('pinch-grab');
        publishToast(`Holding the ${TOOL_LABELS[intent.tool]}.`, 'info');
        break;
      }
      case 'put-down': this.desktopPutDown(); break;
      case 'place': this.desktopPlace(intent.tool); break;
      case 'poke-breaker': {
        const entity = [...this.queries.targets.entities].find(candidate => candidate.object3D?.name === `breaker-${intent.breakerId}`);
        if (entity) this.activate(entity);
        break;
      }
      case 'tester': this.desktopTester(intent.sensor); break;
      case 'notify':
        if (currentStep(this.state)?.id === 'notify-control') this.act('notify-control');
        else publishToast('Control is notified once, after identifying SL-3 and before switching off.', 'info');
        break;
      case 'warn': publishToast(intent.message, 'warn'); break;
      default: break;
    }
    this.refresh();
  }

  private desktopCommand(cmd: string): void {
    if (!this.isDesktop()) return;
    this.audio.unlock(); this.instructor.unlock();
    if (cmd === 'retry') { this.desktopPutDown(); this.onboarding.phase = 'training'; this.reset(); return; }
    if (cmd === 'hint') { this.giveHint(); return; }
    if (cmd === 'put-down') { this.desktopPutDown(); this.refresh(); return; }
    if (cmd === 'notify') { this.desktopPick('controls-panel'); return; }
    if (cmd === 'safe-begin') { this.beginSafeHold(); return; }
    if (cmd === 'safe-end') { this.endSafeHold(); return; }
  }

  private beginSafeHold(): void {
    this.idleHints.reset();
    this.panels.get('controls')?.getElementById('safe-to-work')?.getWorldPosition(this.point);
    this.audio.play('ui-tick', this.point);
    this.safeHold.begin(currentStep(this.state)?.id === 'safe-to-work' && !this.state.completed, performance.now() / 1000);
    this.holdReadyShown = false;
  }

  private endSafeHold(): void {
    const confirmed = this.safeHold.release(currentStep(this.state)?.id === 'safe-to-work' && !this.state.completed);
    this.holdRing.progress.geometry.setDrawRange(0, 0);
    this.text('controls', 'hold-label', 'Hold: safe to work');
    if (confirmed) this.act('safe-to-work');
    else if (currentStep(this.state)?.id === 'safe-to-work') publishToast('Keep holding until the ring fills, then release.', 'info');
    this.publishDesktop();
  }

  private desktopPutDown(): void {
    const entity = this.desktopHeld;
    this.desktopHeld = undefined; this.desktopTouch = undefined;
    if (!entity?.object3D || entity.getValue(TrainingTarget, 'snapped')) return;
    const home = this.homes.get(entity.index);
    if (home) { entity.object3D.position.copy(home.position); entity.object3D.quaternion.copy(home.quaternion); }
  }

  private desktopPlace(tool: 'padlock' | 'danger-tag'): void {
    const entity = this.desktopHeld;
    if (!entity?.object3D) return;
    const object = entity.object3D;
    this.world.requireSceneObject(tool === 'padlock' ? 'lock-zone' : 'tag-zone').getWorldPosition(this.targetPoint);
    object.position.copy(this.targetPoint);
    object.parent?.worldToLocal(object.position);
    this.desktopHeld = undefined;
    this.release(entity);
    const placed = tool === 'padlock' ? this.state.physical.lockApplied : this.state.physical.tagApplied;
    if (!placed && !entity.getValue(TrainingTarget, 'snapped') && !this.state.completed) {
      // The reducer refused the placement (wrong order); the tool stays in hand.
      this.desktopHeld = entity;
    }
  }

  private desktopTester(sensor: 'proving' | 'terminals'): void {
    (sensor === 'proving' ? this.provingContact : this.lineContact).getWorldPosition(this.targetPoint);
    this.desktopTouch = { point: this.targetPoint.clone(), until: performance.now() + 900 };
    this.testerContact(sensor);
    this.lastSensor = '';
  }

  private placeHeldTool(): void {
    const object = this.desktopHeld?.object3D;
    if (!object) return;
    const camera = this.world.camera;
    if (this.desktopTouch && performance.now() < this.desktopTouch.until) {
      this.heldPoint.copy(this.desktopTouch.point);
      this.heldPoint.y += 0.03;
    } else {
      this.desktopTouch = undefined;
      camera.getWorldPosition(this.heldPoint);
      camera.getWorldDirection(this.cameraForward);
      this.cameraUp.set(0, 1, 0);
      this.cameraRight.crossVectors(this.cameraForward, this.cameraUp).normalize();
      this.heldPoint.addScaledVector(this.cameraForward, 0.42).addScaledVector(this.cameraRight, 0.14).addScaledVector(this.cameraUp, -0.13);
    }
    object.position.copy(this.heldPoint);
    object.parent?.worldToLocal(object.position);
  }

  private publishDesktop(): void {
    if (!this.state) return;
    const held = this.heldTool();
    (window as unknown as { civicOpsHeldTool?: string }).civicOpsHeldTool = held ?? '';
    publishLesson(lessonView(this.state, {
      caption: this.lastCaption, guidance: this.instructor?.guidance ?? 'guided',
      held: held ? TOOL_LABELS[held] : undefined, reading: this.reading,
    }));
  }

  private text(panel: string, id: string, value: string): void {
    this.panels.get(panel)?.getElementById<UIKit.Text>(id)?.setProperties({ text: value });
  }

  private bind(panel: string, id: string, callback: () => void, onRelease = false): void {
    const element = this.panels.get(panel)?.getElementById(id);
    if (!element) return;
    element.name = id;
    this.cleanupFuncs.push(registerPokeableVisualTarget(element));
    // A button that hides its panel must wait for release to preserve SDK pointer capture.
    const feedbackAction = () => {
      if (!this.interactive()) return;
      this.idleHints.reset();
      this.audio.unlock(); this.audio.startRoadAmbience(); this.audio.setRoadAmbience(true, false); this.instructor.unlock();
      element.getWorldPosition(this.point);
      if (onRelease) this.feedback.contact(this.point);
      this.audio.play('ui-tick', this.point);
      callback();
    };
    this.cleanupFuncs.push(this.dwell.register(id, element, this.panels.get(panel)!, feedbackAction));
    const pressedDepth = { transformTranslateZ: -.4 }, restingDepth = { transformTranslateZ: 0 };
    const depress = createPokeDepression(pressed => element.setProperties(pressed ? pressedDepth : restingDepth));
    const press = new PointerPressLatch();
    const pressFeedback = (event: { pointerId: number }) => { this.idleHints.reset(); press.press(event.pointerId, element); element.getWorldPosition(this.point); this.feedback.contact(this.point, undefined, depress); if (!onRelease) feedbackAction(); };
    const release = (event: { pointerId: number }) => { if (press.release(event.pointerId) && onRelease) feedbackAction(); };
    const cancel = (event: { pointerId: number }) => { press.cancel(event.pointerId); };
    element.setProperties({ onPointerDown: pressFeedback, onPointerUp: release, onPointerCancel: cancel, onPointerLeave: cancel });
    this.cleanupFuncs.push(() => { press.reset(); element.setProperties({ onPointerDown: undefined, onPointerUp: undefined, onPointerCancel: undefined, onPointerLeave: undefined }); });
  }

  private bindControls(): void {
    this.bind('work-order', 'back-to-jobs', () => this.showJobs(), true);
    this.bind('steps', 'jobs-intro', () => this.showJobs(), true);
    this.bind('steps', 'jobs-lesson', () => this.showJobs(), true);
    this.bind('steps', 'repeat-demo', () => { const binding = gestureDemoBinding(currentStep(this.state)?.id ?? 'identify-circuit'); this.demoDrawn = ''; this.demos.repeat(binding.gesture, performance.now(), 20_000); this.syncDemo(); });
    this.bind('steps', 'explain-why', () => {
      const step = currentStep(this.state);
      if (!step) return;
      if (this.instructor instanceof LiveMetaInstructor) {
        void this.instructor.ask(`Why is ${step.id.replace(/-/g, ' ')} required?`, { stepId: step.id, programme: 'elec-loto' });
      } else {
        this.instructor.sayWhy(step.id);
      }
    });
    this.bind('steps', 'intro-primary', () => this.chooseIntro(true), true);
    this.bind('steps', 'intro-secondary', () => this.chooseIntro(false), true);
    this.bind('results', 'daily-drill', () => this.startDaily(), true);
    this.bind('settings', 'volume-down', () => this.setVolume(this.masterVolume - .1));
    this.bind('settings', 'volume-up', () => this.setVolume(this.masterVolume + .1));
    for (let bay = 1; bay <= 4; bay++) {
      this.bind('settings', `identify-sl-${bay}`, () => this.act({
        type: 'identify-circuit', breakerId: `sl-${bay}`, schematicChecked: this.schematicChecked,
      }));
    }
    this.bind('work-order', 'check-schematic', () => {
      this.schematicChecked = true;
      this.instructor.sayLine('schematic-checked');
      this.text('work-order', 'work-order-status', 'SCHEMATIC CHECKED');
    });
    this.bind('controls', 'notify-control', () => {
      if (currentStep(this.state)?.id === 'notify-control') this.act('notify-control');
    }, true);
    const safe = this.panels.get('controls')!.getElementById('safe-to-work')!;
    safe.name = 'safe-to-work';
    this.cleanupFuncs.push(registerPokeableVisualTarget(safe));
    const pressedDepth = { transformTranslateZ: -.4 }, restingDepth = { transformTranslateZ: 0 };
    const depressSafe = createPokeDepression(pressed => safe.setProperties(pressed ? pressedDepth : restingDepth));
    const safePress = this.safePress;
    const cancelSafe = (event: { pointerId: number }) => { if (!safePress.cancel(event.pointerId)) return; this.safeHold.cancel(); this.holdRing.progress.geometry.setDrawRange(0, 0); this.text('controls', 'hold-label', 'Hold: safe to work'); };
    safe.setProperties({
      onPointerDown: (event: { pointerId: number }) => { this.idleHints.reset(); safePress.press(event.pointerId, safe); safe.getWorldPosition(this.point); this.feedback.contact(this.point, undefined, depressSafe); this.audio.play('ui-tick', this.point); this.safeHold.begin(currentStep(this.state)?.id === 'safe-to-work' && !this.state.completed, performance.now() / 1000); this.holdReadyShown = false; },
      onPointerUp: (event: { pointerId: number }) => {
        if (!safePress.release(event.pointerId)) return;
        const confirmed = this.safeHold.release(currentStep(this.state)?.id === 'safe-to-work' && !this.state.completed);
        this.holdRing.progress.geometry.setDrawRange(0, 0);
        this.text('controls', 'hold-label', 'Hold: safe to work');
        if (confirmed) this.act('safe-to-work');
      },
      onPointerCancel: cancelSafe,
      onPointerLeave: cancelSafe,
    });
    this.cleanupFuncs.push(() => { safePress.reset(); safe.setProperties({ onPointerDown: undefined, onPointerUp: undefined, onPointerCancel: undefined, onPointerLeave: undefined }); });
    this.bind('settings-toggle', 'open-settings', () => this.setSettings(true), true);
    this.bind('settings', 'close-settings', () => this.setSettings(false), true);
    this.bind('settings', 'hint', () => this.giveHint());
    this.bind('settings', 'one-handed', () => {
      this.accessibility.oneHanded = !this.accessibility.oneHanded;
      for (const entity of this.queries.targets.entities) {
        if (entity.getValue(TrainingTarget, 'kind') !== 'tool' || entity.hasComponent(Grabbed)
          || entity.getValue(TrainingTarget, 'snapped')) continue;
        const home = this.homes.get(entity.index);
        if (home && entity.object3D) entity.object3D.position.x = home.position.x * (this.accessibility.oneHanded ? 0.7 : 1);
      }
      this.text('settings', 'one-handed', `One hand\n${this.accessibility.oneHanded ? 'ON' : 'OFF'}`); this.persistA11y();
      this.instructor.sayLine(this.accessibility.oneHanded ? 'one-hand-enabled' : 'one-hand-disabled');
      this.refresh();
    });
    this.bind('settings', 'high-contrast', () => {
      this.accessibility.highContrast = !this.accessibility.highContrast;
      for (const [name, panel] of this.panels) {
        if (!['work-order', 'steps', 'settings', 'controls'].includes(name)) continue;
        panel.getElementById('panel-root')?.setProperties({ backgroundColor: this.accessibility.highContrast ? '#ffffff' : '#edf3f2', color: this.accessibility.highContrast ? '#000000' : '#142936' });
      }
      this.text('settings', 'high-contrast', `Contrast\n${this.accessibility.highContrast ? 'HIGH' : 'NORMAL'}`); this.persistA11y();
    });
    this.bind('settings', 'gaze-pinch', () => {
      this.accessibility.gazePinch = !this.accessibility.gazePinch;
      this.input.xr.gazeEnabled = this.accessibility.gazePinch; this.persistA11y();
      this.text('settings', 'gaze-pinch', `Gaze\n${this.accessibility.gazePinch ? 'ON' : 'OFF'}`);
      this.instructor.sayLine(this.accessibility.gazePinch ? 'gaze-pinch-enabled' : 'gaze-pinch-disabled');
      this.refresh();
    });
    this.bind('settings', 'captions-toggle', () => {
      this.accessibility.captions = !this.accessibility.captions;
      this.world.requireSceneEntity('captions-panel').setValue(Visibility, 'isVisible', this.accessibility.captions);
      this.text('settings', 'captions-toggle', `Captions\n${this.accessibility.captions ? 'ON' : 'OFF'}`); this.persistA11y();
    });
    this.bind('settings', 'bench-down', () => this.benchHeight(-0.04));
    this.bind('settings', 'bench-up', () => this.benchHeight(0.04));
    this.bind('results', 'try-again', () => { this.onboarding.phase = 'training'; this.reset(); }, true);
    this.bind('settings', 'export-results', () => exportResults(this.progress.getAttempts()));
    this.bind('results', 'back-to-jobs', () => this.showJobs(), true);
    this.bind('jobs', 'start-module', () => { this.jobsOpen = false; this.onboarding.phase = 'training'; this.reset(); }, true);
    const mismatch = this.state.scenario.variations.includes('mislabelled-breaker');
    if (mismatch) {
      this.text('settings', 'identify-sl-3', '2 ?');
      this.world.requireSceneObject<UIKitMLAsset>('breaker-labels-panel')
        .getElementById('breaker-label-3')?.setProperties({ text: 'SL-2 ?' });
    }
    this.text('work-order', 'job-reference', 'JOB / DEMO0001');
    this.text('work-order', 'schematic', 'SL-3');
    this.panels.get('work-order')?.getElementById('check-schematic')?.setProperties({ display: mismatch ? 'flex' : 'none' });
    this.panels.get('work-order')?.getElementById('panel-root')?.setProperties({ height: mismatch ? 35 : 29 });
    if (this.state.scenario.variations.includes('backfeed')) {
      this.instructor.sayLine('backfeed-unavailable');
    }
  }

  private prepareTarget(entity: Entity): void {
    const object = entity.object3D;
    if (!object) return;
    this.feedback.prepareHover(object);
    this.feedback.hideHover();
    this.homes.set(entity.index, { position: object.position.clone(), quaternion: object.quaternion.clone() });
    const clones: MeshStandardMaterial[] = [];
    const shared = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    object.traverse((child) => {
      if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
      let material = shared.get(child.material);
      if (!material) {
        material = child.material.clone();
        shared.set(child.material, material);
        clones.push(material);
      }
      child.material = material;
    });
    this.materials.set(entity.index, clones);
    this.cleanupFuncs.push(() => { for (const material of clones) material.dispose(); });
  }

  private activate(entity: Entity): void {
    const action = entity.getValue(TrainingTarget, 'action');
    if (!entity.getValue(TrainingTarget, 'active') || !action) return;
    if (!this.canAct()) return;
    entity.object3D?.getWorldPosition(this.point);
    const toggle = entity.object3D?.getObjectByName('Toggle');
    const restingZ = toggle?.position.z ?? 0;
    this.feedback.contact(this.point, undefined, toggle ? (amount) => { toggle.position.z = restingZ - amount * .003; } : undefined);
    if (action.startsWith('breaker:')) {
      const breakerId = action.slice(8);
      const stepId = currentStep(this.state)?.id;
      if (breakerId === 'sl-3' && stepId === 'try-start') { this.act('try-start'); return; }
      if (breakerId === 'sl-3' && this.state.physical.breakerOff && this.state.physical.lockApplied) {
        // A locked switch cannot move: show it holding without a second switch-off error.
        this.tryWiggleUntil = performance.now() + 700;
        this.audio.play('lock-click', this.point);
        return;
      }
      if (stepId === 'identify-circuit') {
        this.act({ type: 'identify-circuit', breakerId, schematicChecked: this.schematicChecked });
      } else {
        this.act({ type: 'switch-off', breakerId });
      }
    }
  }

  private act(event: ProcedureEvent): void {
    if (this.state.completed || this.resetting || !this.canAct()) return;
    // Inputs and the update loop must agree on the exact 90-second boundary.
    if (this.onboarding.microActive && this.onboarding.tick(performance.now())) {
      this.reset(); this.instructor.sayLine('drill-timeout'); return;
    }
    if (!this.startedAt) {
      this.startedAt = new Date().toISOString();
      this.startedMs = performance.now();
    }
    this.idleHints.reset();
    const previous = this.state;
    this.state = perform(this.state, event, Math.round(performance.now() - this.startedMs));
    this.lastAction = typeof event === 'string' ? event : event.type;
    if (typeof event !== 'string' && event.type === 'switch-off'
      && (event.breakerId === 'sl-3' ? this.state.physical.breakerOff : this.state.physical.wrongBreakerOff)) {
      const toggle = this.world.requireSceneObject(`breaker-${event.breakerId}`).getObjectByName('Toggle');
      if (toggle) toggle.rotation.x = -0.65;
    }
    const type = typeof event === 'string' ? event : event.type;
    const result = this.state.steps[this.state.steps.length - 1];
    this.instructor.sayOutcome(previous, this.state, this.onboarding.phase === 'training');
    if (this.state.criticalErrors.length > previous.criticalErrors.length) {
      publishToast(this.state.feedback || 'Unsafe or out-of-order action.', 'bad');
      this.world.requireSceneObject('terminals').getWorldPosition(this.point);
      this.feedback.unsafe(this.point); this.audio.play('warning-buzz', this.point);
      this.panels.get('captions')?.getElementById('panel-root')?.setProperties({ backgroundColor: '#65252a' });
    } else if (result?.outcome === 'correct') {
      const target = this.world.getSceneObject(STEP_TARGETS[type]);
      target?.getWorldPosition(this.point);
      if (type !== 'identify-circuit' && type !== 'switch-off' && type !== 'notify-control') this.feedback.contact(this.point);
      this.audio.play(type === 'switch-off' ? 'breaker-clunk' : type === 'apply-lock' || type === 'try-start' ? 'lock-click' : type === 'apply-tag' ? 'tag-rustle' : 'ui-tick', this.point);
      if (type === 'try-start') { this.tryWiggleUntil = performance.now() + 900; publishToast('Start attempt blocked. Your lock holds SL-3 OFF.', 'good'); }
      else if (this.isDesktop() && this.state.steps.length > previous.steps.length) publishToast(`${elecLotoModule.steps.find(step => step.id === type)?.label ?? 'Step'}: done.`, 'good');
      if (type === 'identify-circuit' || type === 'notify-control' || type === 'switch-off' || type === 'try-start') this.learnGesture('poke');
      if (type === 'apply-lock' || type === 'apply-tag') this.learnGesture('place');
      if (type === 'safe-to-work') this.learnGesture('hold-to-confirm');
      if (this.onboarding.phase === 'first-target' && type === 'identify-circuit') {
        this.onboarding.firstTargetSucceeded(performance.now()); this.returnProgress.recordOnboardingComplete();
      } else if (this.onboarding.phase.startsWith('micro-')) {
        this.onboarding.performMicro(type as 'switch-off' | 'apply-lock' | 'apply-tag', performance.now());
        if (this.onboarding.firstLockEarned) {
          this.returnProgress.recordFirstLock(); this.audio.play('cert-stamp');
        }
      }
    } else {
      this.audio.play('ui-tick', this.point);
      if (this.state.steps.length > previous.steps.length && result) publishToast(result.note || this.state.feedback, 'warn');
      else if (this.state.feedback !== previous.feedback && this.state.feedback) publishToast(this.state.feedback, 'warn');
    }
    this.syncDemo(); this.refresh();
    if (this.state.completed) this.finish();

  }

  private release(entity: Entity): void {
    if (this.resetting || this.state.completed || !entity.object3D) return;
    const object = entity.object3D;
    const name = object.name;
    const isLock = name === 'padlock';
    const isTag = name === 'danger-tag';
    if (!isLock && !isTag) return;
    const zone = this.world.requireSceneObject(isLock ? 'lock-zone' : 'tag-zone');
    object.getWorldPosition(this.point);
    zone.getWorldPosition(this.targetPoint);
    if (this.point.distanceToSquared(this.targetPoint) > 0.0081) return;
    this.act(isLock ? 'apply-lock' : 'apply-tag');
    const applied = isLock ? this.state.physical.lockApplied : this.state.physical.tagApplied;
    if (!applied) return;
    object.position.copy(this.targetPoint);
    object.parent?.worldToLocal(object.position);
    object.quaternion.identity();
    entity.setValue(TrainingTarget, 'snapped', true);
    entity.setValue(TrainingTarget, 'active', false);
    // Keep the SDK handle registered; translation is locked through its public component.
    entity.setValue(OneHandGrabbable, 'translate', false);
    entity.setValue(OneHandGrabbable, 'rotate', false);
  }

  private giveHint(source: 'requested' | 'automatic' = 'requested'): void {
    if (this.state.completed || !this.greeted || this.onboarding.phase !== 'training') return;
    this.state = hint(this.state, Math.round(performance.now() - this.startedMs), source);
    this.idleHints.reset();
    const step = currentStep(this.state); if (step) this.instructor.sayHint(step.id);
    this.refresh();
  }

  private benchHeight(delta: number): void {
    const offset = Math.max(-0.16, Math.min(0.16, this.accessibility.benchHeightOffset + delta));
    this.accessibility.benchHeightOffset = offset;
    this.world.requireSceneObject('bench-rig').position.y = offset;
    this.text('settings', 'bench-up', `Bench +\n${Math.round(offset * 100)} cm`);
  }

  private setSettings(open: boolean): void {
    this.settingsOpen = open;
    if (open) {
      this.demos.cancel(); this.syncDemo(); this.safePress.reset(); this.safeHold.cancel();
      this.holdRing.progress.geometry.setDrawRange(0, 0); this.text('controls', 'hold-label', 'Hold: safe to work');
    }
    this.world.requireSceneEntity('settings-panel').setValue(Visibility, 'isVisible', open);
    this.world.requireSceneEntity('settings-toggle-panel').setValue(Visibility, 'isVisible', !open && !this.state.completed && !this.jobsOpen);
    this.world.requireSceneEntity('steps-panel').setValue(Visibility, 'isVisible', !open && !this.state.completed && !this.jobsOpen);
    this.refresh();
  }

  private showJobs(): void {
    window.dispatchEvent(new Event('civicops:jobs'));
  }


  private refresh(): void {
    const step = currentStep(this.state);
    this.activeStep = step?.id ?? '';
    this.text('steps', 'current-step', step ? assessmentStepTitle(this.instructor.guidance, DISPLAY_STEPS[step.order - 1], step.order, DISPLAY_STEPS.length) : 'Attempt finished');
    for (const definition of elecLotoModule.steps) {
      const done = this.state.steps.some((result) => result.stepId === definition.id && result.outcome === 'correct');
      const marker = checklist(this.state, definition.id, definition.order);
      this.text('steps', `step-${definition.order}`, marker);
      this.panels.get('steps')?.getElementById(`step-${definition.order}`)?.setProperties({ color: '#173d38', backgroundColor: done ? '#c8e9d4' : definition.id === step?.id ? '#f5d78c' : '#e7ede4' });
    }
    this.text('captions', 'caption-step', step ? `STEP ${step.order} / ${elecLotoModule.steps.length}` : 'ATTEMPT COMPLETE');
    if (this.state.physical.notified) {
      this.text('work-order', 'work-order-status', 'CONTROL NOTIFIED');
    }
    for (const entity of this.queries.session.entities) {
      entity.setValue(TrainingSession, 'step', step?.id ?? 'finished');
      entity.setValue(TrainingSession, 'complete', this.state.completed);
      entity.setValue(TrainingSession, 'failed', this.state.failed);
      entity.setValue(TrainingSession, 'hints', this.state.hintsUsed);
      entity.setValue(TrainingSession, 'score', score(this.state));
      entity.setValue(TrainingSession, 'lastAction', this.lastAction);
      entity.setValue(TrainingSession, 'safeHoldProgress', this.safeHold.progress);
    }
    const correctBreaker = this.world.requireSceneObject('breaker-sl-3');
    const lever = correctBreaker.getObjectByName('Toggle');
    if (lever) lever.rotation.x = this.state.physical.breakerOff ? -0.65 : 0.65;
    const targetName = step ? STEP_TARGETS[step.id] : '';
    for (const entity of this.queries.targets.entities) {
      entity.setValue(TrainingTarget, 'highlighted', automaticCoaching(this.instructor.guidance) && !!this.greeted && this.canAct() && entity.object3D?.name === targetName);
    }
    this.world.requireSceneEntity('work-order-panel').setValue(Visibility, 'isVisible', !!step && step.order <= 3 && !this.jobsOpen);
    const action = contextAction(step?.id, this.state.completed);
    this.world.requireSceneEntity('controls-panel').setValue(Visibility, 'isVisible', !!action && !this.settingsOpen && !this.jobsOpen);
    this.panels.get('controls')?.getElementById('notify-control')?.setProperties({ display: action === 'notify-control' ? 'flex' : 'none' });
    this.panels.get('controls')?.getElementById('safe-to-work')?.setProperties({ display: action === 'safe-to-work' ? 'flex' : 'none' });
    this.text('controls', 'action-title', action === 'safe-to-work' ? 'CONFIRM' : 'NOTIFY');
    this.holdRing.root.visible = action === 'safe-to-work';
    this.holdEntity.setValue(Visibility, 'isVisible', action === 'safe-to-work');
    this.panels.get('settings')?.getElementById('panel-root')?.setProperties({ height: (this.accessibility.oneHanded || this.accessibility.gazePinch) && step?.id === 'identify-circuit' ? 58 : 48 });
    this.panels.get('settings')?.getElementById('settings-fallback')?.setProperties({ display: (this.accessibility.oneHanded || this.accessibility.gazePinch) && step?.id === 'identify-circuit' ? 'flex' : 'none' });
    this.refreshOnboarding();
    this.publishDesktop();
  }

  private canAct(): boolean {
    const phase = this.onboarding.phase;
    return this.greeted && !this.state.completed && !this.jobsOpen && (phase === 'first-target' || phase === 'training' || phase === 'micro-off' || phase === 'micro-lock' || phase === 'micro-tag');
  }

  private setVolume(value: number): void {
    this.masterVolume = Math.max(0, Math.min(1, Math.round(value * 10) / 10));
    this.audio.setVolume(this.masterVolume); this.instructor.setVolume(this.masterVolume);
    this.text('settings', 'volume-up', `Volume +\n${Math.round(this.masterVolume * 100)}%`);
  }

  private chooseIntro(primary: boolean): void {
    const phase = this.onboarding.phase;
    if (phase === 'returning-choice') {
      this.onboarding.chooseReturning(primary ? 'continue' : 'daily');
      if (!primary) { this.startDaily(); return; }
      this.dailyMode = false; this.reset();
    } else if (phase === 'micro-offer') {
      if (primary) {
        this.onboarding.startMicroDrill(performance.now());
        this.state = perform(this.state, 'notify-control', 0);
        this.instructor.sayLine('micro-off');
      } else {
        this.onboarding.skipMicroDrill(); this.instructor.sayStep('notify-control');
      }
    } else if (phase === 'first-lock-stamp') {
      this.onboarding.continueTraining(); this.dailyMode = false; this.reset();
    }
    this.refresh();
  }

  private startDaily(): void {
    const drill = dailyDrill();
    this.dailyMode = true; this.onboarding.phase = 'training';
    this.state = prepareProcedure(start(createScenario(drill.seed, drill.variation === 'mislabelled-breaker' ? ['mislabelled-breaker'] : [])));
    this.reset(); this.configureScenario(); this.instructor.sayLine('daily-start');
    this.refresh();
  }

  private configureScenario(): void {
    const mismatch = this.state.scenario.variations.includes('mislabelled-breaker');
    this.world.requireSceneObject<UIKitMLAsset>('breaker-labels-panel').getElementById('breaker-label-3')?.setProperties({ text: mismatch ? 'SL-2 ?' : 'SL-3' });
    this.text('settings', 'identify-sl-3', mismatch ? '2 ?' : 'SL-3');
    this.panels.get('work-order')?.getElementById('check-schematic')?.setProperties({ display: mismatch ? 'flex' : 'none' });
    this.panels.get('work-order')?.getElementById('panel-root')?.setProperties({ height: mismatch ? 35 : 29 });
  }

  private refreshOnboarding(): void {
    const phase = this.onboarding.phase;
    if (phase !== this.lastPhase) {
      this.phaseAtMs = performance.now(); this.lastPhase = phase;
      if (phase === 'micro-offer' || phase === 'micro-lock' || phase === 'micro-tag' || phase === 'first-lock-stamp') this.instructor.sayLine(phase);
    }
    const intro = phase === 'micro-offer' || phase === 'first-lock-stamp' || phase === 'returning-choice';
    this.panels.get('steps')?.getElementById('intro-body')?.setProperties({ display: intro ? 'flex' : 'none' });
    this.panels.get('steps')?.getElementById('lesson-body')?.setProperties({ display: intro ? 'none' : 'flex' });
    this.panels.get('steps')?.getElementById('panel-root')?.setProperties({ height: intro ? 34 : this.onboarding.microActive ? 29 : 36.5, backgroundColor: phase === 'first-lock-stamp' ? '#c8e9d4' : '#f7f3e9' });
    const micro = this.onboarding.microActive;
    for (const id of ['check-row-1', 'check-row-3']) this.panels.get('steps')?.getElementById(id)?.setProperties({ display: micro ? 'none' : 'flex' });
    this.text('steps', 'steps-legend', micro ? 'OFF / LOCK / TAG' : '> NEXT  [x] DONE');
    if (micro) {
      const marks = [this.state.physical.breakerOff, this.state.physical.lockApplied, this.state.physical.tagApplied];
      for (let index = 0; index < 3; index++) this.text('steps', `step-${index + 4}`, `${marks[index] ? '[x]' : index === (phase === 'micro-off' ? 0 : phase === 'micro-lock' ? 1 : 2) ? '>' : 'o'} ${['OFF', 'LOCK', 'TAG'][index]}`);
    }
    if (intro) {
      this.text('steps', 'intro-eyebrow', phase === 'first-lock-stamp' ? 'STAMP EARNED' : phase === 'returning-choice' ? 'WELCOME BACK' : 'FIRST 5 MIN');
      this.text('steps', 'intro-title', phase === 'returning-choice' ? 'Keep sharp' : 'First lock');
      this.panels.get('steps')?.getElementById('intro-title')?.setProperties({ fontSize: phase === 'first-lock-stamp' ? 6.3 : 4.2 });
      this.text('steps', 'intro-copy', phase === 'first-lock-stamp' ? 'OFF / LOCK / TAG\nYour first lock is recorded.' : phase === 'returning-choice' ? 'Your bench is ready.\nBuild your daily streak.' : 'Switch off. Lock. Tag.\nA 90-second practice.');
      this.text('steps', 'intro-primary', phase === 'first-lock-stamp' ? 'Full lesson' : phase === 'returning-choice' ? 'Continue' : 'Try first lock');
      this.text('steps', 'intro-secondary', phase === 'returning-choice' ? 'Daily drill' : 'Full lesson');
      this.panels.get('steps')?.getElementById('intro-secondary')?.setProperties({ display: phase === 'first-lock-stamp' ? 'none' : 'flex' });
    }
    this.world.requireSceneEntity('steps-panel').setValue(Visibility, 'isVisible', phase !== 'raise-hands' && phase !== 'first-target' && !this.settingsOpen && !this.state.completed && !this.jobsOpen);
    if (phase !== 'training') {
      this.world.requireSceneEntity('work-order-panel').setValue(Visibility, 'isVisible', (phase === 'raise-hands' || phase === 'first-target') && !this.jobsOpen);
      this.world.requireSceneEntity('controls-panel').setValue(Visibility, 'isVisible', false);
      this.text('captions', 'caption-step', phase === 'raise-hands' ? 'WELCOME, CREW' : phase.startsWith('micro-') ? 'FIRST LOCK / 90 SECONDS' : phase === 'first-lock-stamp' ? 'YOUR FIRST LOCK' : phase === 'returning-choice' ? 'WELCOME BACK' : 'BAY 3 / SL-3');
    }
    this.world.requireSceneEntity('settings-toggle-panel').setValue(Visibility, 'isVisible', (phase === 'training' || this.onboarding.microActive) && !this.settingsOpen && !this.state.completed && !this.jobsOpen);
    this.minutes.setValue(FirstMinutes, 'phase', phase);
    this.minutes.setValue(FirstMinutes, 'xrEntryMs', this.onboarding.enteredAtMs);
    this.minutes.setValue(FirstMinutes, 'firstActionMs', this.onboarding.firstActionMs ?? -1);
    this.minutes.setValue(FirstMinutes, 'firstLock', !!this.returnProgress.firstLockAt);
    this.minutes.setValue(FirstMinutes, 'dailySeed', dailyDrill().seed);
  }

  private learnGesture(gesture: 'poke' | 'pinch-grab' | 'place' | 'hold-to-confirm'): void {
    this.demos.succeed(gesture); this.returnProgress.recordGestureSeen(gesture);
  }

  private startDemo(gesture: 'poke' | 'pinch-grab' | 'place' | 'hold-to-confirm'): void {
    if (this.demos.start(gesture, performance.now())) this.returnProgress.recordGestureSeen(gesture);
  }

  private syncDemo(): void {
    const gesture = this.demos.activeGesture ?? '';
    if (!gesture) { this.feedback.hideDemo(); this.demoDrawn = ''; }
    if (gesture && gesture !== this.demoDrawn) {
      const step = currentStep(this.state)?.id ?? 'identify-circuit';
      const binding = gestureDemoBinding(step);
      if (binding.uiElementId) this.panels.get('controls')!.getElementById(binding.uiElementId)!.getWorldPosition(this.demoOrigin);
      else this.world.requireSceneObject(binding.sceneObject).getWorldPosition(this.demoOrigin);
      if (gesture === 'place') this.world.requireSceneObject(step === 'apply-tag' ? 'tag-zone' : 'lock-zone').getWorldPosition(this.demoDestination);
      this.feedback.showDemo(gesture, this.demoOrigin, gesture === 'place' ? this.demoDestination : undefined);
      this.demoDrawn = gesture;
    }
    this.minutes.setValue(FirstMinutes, 'demo', gesture);
  }

  private updateFeedback(): void {
    if (!this.canAct()) { this.feedback.hideHover(); this.feedback.hideSnap(); this.feedback.hideDemo(); this.demoDrawn = ''; return; }
    const step = this.activeStep;
    if (automaticCoaching(this.instructor.guidance) && !this.settingsOpen && !this.demos.activeGesture && performance.now() - this.phaseAtMs >= 1800) {
      const gesture = step === 'safe-to-work' ? 'hold-to-confirm' : step === 'apply-lock' || step === 'apply-tag' || step === 'prove-tester' ? 'pinch-grab' : step === 'identify-circuit' ? 'poke' : undefined;
      if (gesture) this.startDemo(gesture);
    }
    let placing = false;
    for (const entity of this.queries.held.entities) {
      const name = entity.object3D?.name;
      if (name !== 'padlock' && name !== 'danger-tag') continue;
      this.world.requireSceneObject(name === 'padlock' ? 'lock-zone' : 'tag-zone').getWorldPosition(this.demoDestination);
      this.feedback.showSnap(this.demoDestination, undefined, entity.object3D);
      if (automaticCoaching(this.instructor.guidance) && !this.settingsOpen && !this.demos.activeGesture) this.startDemo('place');
      placing = true;
    }
    if (!placing) this.feedback.hideSnap();
    let hovering = false;
    for (const entity of this.queries.hovered.entities) {
      if (!entity.object3D || entity.hasComponent(Grabbed) || entity.getValue(TrainingTarget, 'snapped')) continue;
      entity.object3D.getWorldPosition(this.point);
      this.feedback.showHover(this.point, this.hoverSize, entity.object3D); hovering = true; break;
    }
    if (!hovering) this.feedback.hideHover();
  }

  private finish(): void {
    if (this.saved) return;
    this.saved = true;
    this.demos.cancel(); this.syncDemo(); this.feedback.hideHover(); this.feedback.hideSnap();
    const attempt = buildAttempt(this.state, {
      startedAt: this.startedAt, completedAt: new Date().toISOString(),
      accessibility: this.accessibility, inputMode: this.accessibility.gazePinch ? 'gaze-hands' : 'hands',
      device: this.isDesktop() ? { runtime: 'emulated', deviceName: 'Desktop mouse and keyboard' } : attemptDevice(this.world.renderer.xr.isPresenting),
    });
    this.desktopPutDown();
    publishResult(resultView(attempt));
    const certification = this.progress.record(attempt);
    if (this.dailyMode) this.returnProgress.recordDailyPass(attempt);
    const comeback = comeBackSummary(this.progress.getAttempts());
    if (attempt.passed) this.audio.play('success-chime');
    this.safePress.reset(); this.safeHold.cancel();
    this.settingsOpen = false;
    this.world.renderer.toneMappingExposure = .72;
    this.world.requireSceneEntity('results-panel').setValue(Visibility, 'isVisible', true);
    for (const name of ['work-order', 'steps', 'captions', 'controls', 'settings', 'settings-toggle']) {
      this.world.requireSceneEntity(`${name}-panel`).setValue(Visibility, 'isVisible', false);
    }
    presentModuleResults(this.panels.get('results')!, {
      attempt, module: elecLotoModule, certification, comeback,
      daily: this.returnProgress.moduleDailyStatus(elecLotoModule), departmentLabel: 'ELECTRICAL',
      completeEyebrow: 'CIVICOPS / ISOLATION COMPLETE', feedback: this.lastCaption,
      showSafetyFeedback: attempt.criticalErrors.length > 0 && this.accessibility.captions,
      showScoreOnNoncriticalFailure: true,
    });
    placeReviewPanel(this.panels.get('results')!, this.player.head, this.panels.get('results')?.getElementById('result-body'));
    for (const entity of this.queries.session.entities) entity.setValue(TrainingSession, 'score', attempt.score);
    const serial = this.serial;
    void this.client.syncAttempt(attempt).then((result) => {
      if (serial === this.serial) this.text('results', 'sync-status',
        result.status === 'synced' ? 'Synced to CivicOps.' : result.status === 'failed'
          ? 'Saved locally. Sync unavailable.' : 'Saved on this device.');
    });
  }

  private reset(): void {
    this.resetting = true;
    this.serial++;
    this.desktopHeld = undefined; this.desktopTouch = undefined; this.reading = ''; this.tryWiggleUntil = 0;
    publishResult(undefined);
    this.jobsOpen = false; this.settingsOpen = false; this.safePress.reset(); this.safeHold.cancel();
    this.world.renderer.toneMappingExposure = 1;
    this.world.requireSceneEntity('jobs-panel').setValue(Visibility, 'isVisible', false);
    for (const entity of this.queries.targets.entities) {
      this.world.getSystem(GrabSystem)?.forceRelease(entity);
      const home = this.homes.get(entity.index);
      if (home && entity.object3D) {
        entity.object3D.position.copy(home.position);
        entity.object3D.quaternion.copy(home.quaternion);
        const toggle = entity.object3D.getObjectByName('Toggle');
        if (toggle) toggle.rotation.x = 0.65;
        if (this.accessibility.oneHanded && entity.getValue(TrainingTarget, 'kind') === 'tool') {
          entity.object3D.position.x *= 0.7;
        }
      }
      entity.setValue(TrainingTarget, 'snapped', false);
      entity.setValue(TrainingTarget, 'active', true);
      if (entity.hasComponent(OneHandGrabbable)) {
        entity.setValue(OneHandGrabbable, 'translate', true);
        entity.setValue(OneHandGrabbable, 'rotate', true);
      }
    }
    this.state = prepareProcedure(start(this.state.scenario));
    this.startedAt = new Date().toISOString();
    this.startedMs = performance.now();
    this.saved = false;
    this.lastSensor = '';
    this.lastAction = '';
    this.schematicChecked = false;
    this.idleHints.reset();
    this.world.requireSceneEntity('results-panel').setValue(Visibility, 'isVisible', false);
    for (const name of ['work-order', 'steps', 'captions', 'controls', 'settings', 'settings-toggle']) {
      this.world.requireSceneEntity(`${name}-panel`).setValue(Visibility, 'isVisible', name === 'settings' ? false : name !== 'captions' || this.accessibility.captions);
    }
    this.text('work-order', 'work-order-status', 'CHECK CIRCUIT');
    this.text('work-order', 'voltage', 'Tester: -- V');
    setTesterReadout(this.world.requireSceneObject('voltage-tester'), null);
    this.resetting = false;
    this.demos.cancel(); this.demoDrawn = '';
    this.feedback.reset();
    this.panels.get('captions')?.getElementById('panel-root')?.setProperties({ backgroundColor: '#173d38' });
    this.configureScenario();
    this.instructor.sayStep('identify-circuit');
    this.refresh();
  }

  update(delta: number, time: number): void {
    const xr = this.world.visibilityState.peek() === VisibilityState.Visible;
    const desktop = !xr && this.isDesktop();
    if (!xr && !desktop) return;
    if (xr) this.dwell.tick(this.a11y.dwellSelect, this.player.head, performance.now());
    if (desktop) this.placeHeldTool();
    const lever = this.tryWiggleUntil ? this.world.requireSceneObject('breaker-sl-3').getObjectByName('Toggle') : undefined;
    if (lever) {
      const left = this.tryWiggleUntil - performance.now();
      if (left > 0) lever.rotation.x = -0.65 + (this.a11y.reducedMotion ? 0.12 : 0.22 * Math.abs(Math.sin(left / 60)) * Math.min(1, left / 400));
      else { lever.rotation.x = this.state.physical.breakerOff ? -0.65 : 0.65; this.tryWiggleUntil = 0; }
    }
    if (this.safeHold.pressed) {
      this.safeHold.advanceAt(performance.now() / 1000);
      for (const entity of this.queries.session.entities) entity.setValue(TrainingSession, 'safeHoldProgress', this.safeHold.progress);
      this.holdRing.progress.geometry.setDrawRange(0, Math.floor(this.safeHold.progress * 40) * 6);
      if (this.safeHold.ready && !this.holdReadyShown) { this.holdReadyShown = true; this.text('controls', 'hold-label', 'Release to confirm'); }
    }
    const now = performance.now();
    if (this.onboarding.tick(now)) { this.reset(); this.instructor.sayLine('drill-timeout'); }
    if (this.onboarding.phase !== this.lastPhase) this.refresh();
    this.feedback.update(delta);
    this.demos.tick(now); this.syncDemo();
    this.player.head.getWorldPosition(this.point);
    this.player.head.getWorldDirection(this.soundForward).negate();
    this.audio.setListenerPose(this.point, this.soundForward, this.soundUp);
    this.updateFeedback();
    if (desktop) {
      this.updateGlow(time);
      return;
    }
    const adapters = this.input.xr.visualAdapters.hand;
    if (this.greeted && !adapters.left.jointTransforms && !adapters.right.jointTransforms && this.onboarding.trackingLost()) {
      this.greeted = false; this.demos.cancel(); this.syncDemo(); this.instructor.sayLine('raise-hands'); this.refresh();
    }
    if (!this.greeted && (adapters.left.jointTransforms || adapters.right.jointTransforms)) {
      this.greeted = true;
      this.accessibility.gazePinch = this.input.xr.gazePointer.canTarget();
      this.text('settings', 'gaze-pinch', `Gaze\n${this.accessibility.gazePinch ? 'ON' : 'OFF'}`);
      this.startedAt = new Date().toISOString();
      this.startedMs = performance.now();
      this.onboarding.handsTracked(!!adapters.left.jointTransforms, !!adapters.right.jointTransforms);
      this.instructor.sayLine(this.onboarding.phase === 'returning-choice' ? 'returning-choice' : 'first-target');
      this.refresh();
    }
    if (this.idleHints.tick(delta, automaticCoaching(this.instructor.guidance) && this.greeted && !this.state.completed && this.onboarding.phase === 'training'
      && !this.settingsOpen && !this.demos.activeGesture && !this.safeHold.pressed)) this.giveHint('automatic');
    this.updateGlow(time);
    if (this.state.completed || !this.canAct()) return;
    // SDK joint buffers are relative to the grip; reuse vectors instead of querying poses.
    for (let hand = 0; hand < HANDS.length; hand++) {
      const adapter = adapters[HANDS[hand]];
      if (adapter.jointSpaces.length !== this.jointCounts[hand]) {
        this.jointCounts[hand] = adapter.jointSpaces.length;
        this.tipIndices[hand] = -1;
        for (let index = 0; index < adapter.jointSpaces.length; index++) {
          if (adapter.jointSpaces[index].jointName === 'index-finger-tip') this.tipIndices[hand] = index;
        }
      }
      if (!adapter.jointTransforms || this.tipIndices[hand] < 0) continue;
      this.finger.fromArray(adapter.jointTransforms, this.tipIndices[hand] * 16 + 12);
      this.finger.applyMatrix4(this.player.gripSpaces[HANDS[hand]].matrixWorld);
      const tipView = this.fingerViews[hand];
      tipView[0] = this.finger.x; tipView[1] = this.finger.y; tipView[2] = this.finger.z;
      this.lineContact.getWorldPosition(this.targetPoint);
      const touchesLine = this.finger.distanceToSquared(this.targetPoint) < 0.0004;
      this.neutralContact.getWorldPosition(this.targetPoint);
      if (!this.state.physical.deadTested && (touchesLine || this.finger.distanceToSquared(this.targetPoint) < 0.0004)) {
        this.act({ type: 'touch-terminals' });
        return;
      }
    }
    this.checkTester();
  }

  private updateGlow(time: number): void {
    const glow = this.a11y.reducedMotion ? 0.6 : 0.4 + 0.3 * Math.sin(time * 3);
    for (const entity of this.queries.targets.entities) {
      const materials = this.materials.get(entity.index);
      if (!materials) continue;
      const highlighted = entity.getValue(TrainingTarget, 'highlighted');
      const unsafeTarget = this.state.failed && entity.object3D?.name === 'terminals';
      for (const material of materials) {
        material.emissive.setHex(unsafeTarget ? 0xff3030 : highlighted ? 0x22d3ee : 0x000000);
        material.emissiveIntensity = unsafeTarget ? .12 + .13 * glow : highlighted ? glow * .55 : 0;
      }
    }
  }

  private checkTester(): void {
    let sensor = '';
    for (const entity of this.queries.held.entities) {
      const object = entity.object3D;
      if (!object || object.name !== 'voltage-tester') continue;
      this.point.copy(this.testerTip);
      object.localToWorld(this.point);
      this.provingContact.getWorldPosition(this.targetPoint);
      if (this.point.distanceToSquared(this.targetPoint) < 0.0025) sensor = 'proving';
      this.terminalObject.getWorldPosition(this.targetPoint);
      this.targetPoint.y += 0.024;
      if (this.point.distanceToSquared(this.targetPoint) < 0.0025) sensor = 'terminals';
    }
    if (sensor && sensor !== this.lastSensor) this.testerContact(sensor as 'proving' | 'terminals');
    this.lastSensor = sensor;
  }

  /** One tester contact edge, shared by tracked hands and the desktop pointer. */
  private testerContact(sensor: 'proving' | 'terminals'): void {
    // State transitions allocate only on contact edges, never on an idle frame.
    if (sensor === 'proving') {
      this.reading = 'Proving unit: 230 V';
      this.act(this.state.physical.deadTested ? 're-prove-tester' : 'prove-tester');
      this.text('work-order', 'voltage', 'Proving source: 230 V');
      setTesterReadout(this.world.requireSceneObject('voltage-tester'), 230);
      this.provingContact.getWorldPosition(this.point);
      this.audio.play('proving-tone', this.point);
      this.audio.play('tester-live', this.point);
    } else {
      const voltage = getVoltage(this.state);
      this.reading = `SL-3 terminals: ${voltage} V`;
      this.act('test-dead');
      this.text('work-order', 'voltage', `Circuit: ${voltage} V`);
      setTesterReadout(this.world.requireSceneObject('voltage-tester'), voltage);
      this.lineContact.getWorldPosition(this.point);
      this.audio.play(voltage === 0 ? 'tester-dead' : 'tester-live', this.point);
    }
    this.publishDesktop();
  }
}

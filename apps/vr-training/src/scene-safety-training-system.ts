import { attemptAccessibility, attemptDevice } from './training/attempt-context.js';
import { browserStorage } from './training/browser-storage.js';
import { prepareProcedure } from './training/programme-state.js';
import {
  AdditiveBlending, BufferGeometry, CircleGeometry, createSystem, Entity, Float32BufferAttribute,
  Grabbed, GrabSystem, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PlaneGeometry, PokeInteractable, Pressed, Quaternion, RayInteractable, ShaderMaterial,
  UIKit, UIKitMLAsset, Vector3, Visibility, VisibilityState,
} from '@iwsdk/core';
import { applyModuleAccessibility } from './module-accessibility.js';
import { SeatedPanelRig } from './seated-panel-rig.js';
import { ModuleDwell } from './module-dwell.js';
import { loadSettings, saveSettings, type AccessibilitySettings } from './training/accessibility-settings.js';
import { SceneSafetySession, SceneSafetyTarget } from './scene-safety-components.js';
import { TrainingSession } from './training-components.js';
import { registerPokeableVisualTarget } from './hand-visual-system.js';
import { PointerPressLatch } from './training/pointer-press.js';
import { CivicAudio } from './training/civic-audio.js';
import { ScriptedInstructor } from './training/instructor.js';
import { createInstructor, LiveMetaInstructor, liveLlmOptions } from './training/meta-instructor.js';
import { loadGuidance, UNGUIDED_BRIEF } from './training/guidance.js';
import { guidanceCaption, guidanceStatus } from './training/caption-guidance.js';
import { assessmentStepTitle } from './training/assessment-cues.js';
import { TrainingProgress } from './training/progress.js';
import { DailyDrillProgress, comeBackSummary } from './training/daily-drill.js';
import { buildAttempt, score } from './training/scoring.js';
import { presentModuleResults } from './training/module-results.js';
import { placeReviewPanel } from './training/review-panel.js';
import { defaultCrewForModule } from './training/modules/module-registry.js';
import { createFireDailyDrill, createFireScenario, SCENE_SAFETY_NOTICE, sceneSafetyModule, sceneStepLines, type SceneStepId } from './training/modules/scene-safety.js';
import { currentFireStep, goodFireEvents, hintFire, performFire, startFire, type FireEvent, type FirePartKind, type FireState } from './training/scene-safety-procedure.js';
import {
  FIRE_CASUALTY_XZ, FIRE_HAZARDS, FIRE_HAZARD_MARKERS, FIRE_SCENE, buildHandover, casualtyById, casualtyCardCopy, createGoodFireLayout,
  inExclusion, inLiveLane, sceneCasualties,
  type CasualtyId, type FireLayout, type SceneHazard, type SceneHandover, type TriageTag,
} from './training/scene-safety-geometry.js';
import { MovingAtlasBatch } from './scene-assets/moving-atlas-batch.js';
import { decodeSurfaceAttribute } from './training/static-batching.js';
import { formatTrainingCaption } from './training/spatial-caption.js';
import { trackGeneratedInstances } from './training/generated-instances.js';
import { HazardMarker } from './scene-assets/hazard-marker.js';

interface Home { position: Vector3; quaternion: Quaternion }
const TITLES: Readonly<Record<SceneStepId, string>> = {
  'place-blocker': 'Angle the engine',
  'warning-taper': 'Taper and flares',
  'size-up': 'Name the hazards',
  'cable-exclusion': 'Mark the live line',
  'safe-approach': 'Mark the approach',
  triage: 'Tag every vest',
  handover: 'Hand over to control',
};
const COPY: Readonly<Record<SceneStepId, string>> = {
  'place-blocker': 'Pinch the engine.\nPark it upstream.\nAngle the closed lane.',
  'warning-taper': 'Place six cones.\nAdd flares upstream.\nKeep the lane taper.',
  'size-up': 'Point at the markers.\nStay on safe ground.\nPinch each marker.',
  'cable-exclusion': 'Pinch the marker.\nDrop it by the cable.\nTreat the line as live.',
  'safe-approach': 'Stand on the shoulder.\nPoke Mark approach.\nStay out of the lane.',
  triage: 'Poke a vest. Read it.\nPinch the matching tag.\nShape, colour and word.',
  handover: 'Poke Send handover.\nCounts, hazards, units.\nYou still decide.',
};
const FIRE_INSTRUCTIONS = Object.values(sceneStepLines).map((line) => line.instruction);
const PLACEABLE = new Set<string>(['blocker', 'cone', 'flare', 'exclusion']);
const skipRaycast = () => {};

/** Hands bind the crash scene to the shared procedure, instructor, score and results. */
export class SceneSafetyTrainingSystem extends createSystem({
  targets: { required: [SceneSafetyTarget] },
  held: { required: [SceneSafetyTarget, Grabbed] },
  pressed: { required: [SceneSafetyTarget, Pressed] },
}) {
  private state!: FireState;
  private session!: Entity;
  private cardEntity!: Entity;
  private readonly panels = new Map<string, UIKitMLAsset>();
  private readonly homes = new Map<number, Home>();
  private readonly parts = new Map<string, Entity>();
  private readonly cones: Entity[] = [];
  private readonly casualties: Entity[] = [];
  private readonly traffic: Object3D[] = [];
  private readonly trafficZ = [18, 4, -12];
  private readonly generated: Entity[] = [];
  private readonly disposedResources: { dispose(): void }[] = [];
  private readonly orphans: { dispose(): void }[] = [];
  private readonly glow: MeshStandardMaterial[] = [];
  private readonly glowPhase: number[] = [];
  private readonly point = new Vector3();
  private readonly other = new Vector3();
  private readonly forward = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly matrix = new Matrix4();
  private readonly inverse = new Matrix4();
  private readonly q = new Quaternion();
  private readonly audio = new CivicAudio();
  private readonly progress = new TrainingProgress();
  private readonly daily = new DailyDrillProgress();
  private instructor!: ScriptedInstructor;
  private coneMesh?: InstancedMesh;
  private atlasBatch?: MovingAtlasBatch;
  private fuelMaterial?: ShaderMaterial;
  private sweepMaterial?: ShaderMaterial;
  private startedAt = '';
  private startedMs = 0;
  private frames = 0;
  private dailyMode = false;
  private resetting = false;
  private saved = false;
  private disposed = false;
  private staging = false;
  private sirenPlayed = false;
  private crewId = 'fire-01';

  private seatedRig!: SeatedPanelRig;
  private readonly dwell = new ModuleDwell();
  private a11y: AccessibilitySettings = loadSettings(browserStorage(), globalThis.location?.search ?? '');
  init(): void {
    const params = new URLSearchParams(location.search);
    const seed = Number(params.get('seed') ?? 0);
    this.dailyMode = params.get('daily') === '1';
    this.state = prepareProcedure(startFire(this.dailyMode ? createFireDailyDrill().scenario : createFireScenario(Number.isFinite(seed) ? seed : 0)));
    this.crewId = defaultCrewForModule(sceneSafetyModule);
    this.session = this.world.requireSceneEntity('fire-session');
    this.cardEntity = this.world.requireSceneEntity('fire-casualty-panel');
    for (const name of ['steps', 'controls', 'casualty', 'handover', 'results']) {
      this.panels.set(name, this.world.requireSceneObject<UIKitMLAsset>(`fire-${name}-panel`));
    }
    this.seatedRig = new SeatedPanelRig({ steps: [this.panels.get('steps')!], controls: [this.panels.get('controls')!, this.panels.get('handover')!] });
    applyModuleAccessibility(this.a11y, { panels: this.panels, captionPanel: 'steps', captionFontSize: 2.7, captionHeight: 12.8, panelHeight: 52, steps: this.world.getSceneEntity('fire-steps-panel')?.object3D, controls: this.world.getSceneEntity('fire-controls-panel')?.object3D });
    this.instructor = createInstructor(() => {}, { volume: .7, llm: liveLlmOptions(), guidance: loadGuidance(browserStorage(), globalThis.location?.search ?? '') });
    for (const entity of this.queries.targets.entities) {
      const object = entity.object3D;
      if (!object) continue;
      this.homes.set(entity.index, { position: object.position.clone(), quaternion: object.quaternion.clone() });
      const id = entity.getValue(SceneSafetyTarget, 'partId') ?? '';
      if (id) this.parts.set(id, entity);
      const kind = entity.getValue(SceneSafetyTarget, 'kind');
      if (kind === 'cone') this.cones.push(entity);
      if (kind === 'casualty') this.casualties.push(entity);
    }
    this.coneMesh = this.buildConeInstances();
    this.buildHazards();
    this.buildLights();
    for (let index = 1; index <= 3; index += 1) this.traffic.push(this.world.requireSceneObject(`fire-traffic-${index}`));
    const atlasRoots = ['fire-engine','fire-ambulance','fire-mast','fire-exclusion',
      'fire-flare-1','fire-flare-2','fire-flare-3','fire-c1','fire-c2','fire-c3','fire-c4',
      'fire-tag-minor','fire-tag-delayed','fire-tag-immediate','fire-tag-expectant',
      'fire-traffic-1','fire-traffic-2','fire-traffic-3'].map(name => this.world.requireSceneObject(name));
    this.atlasBatch = new MovingAtlasBatch(this.session.object3D!, atlasRoots, 'CivicOpsRoadsAtlas');
    this.generated.push(this.world.createTransformEntity(this.atlasBatch.mesh, this.session));
    this.disposedResources.push(this.atlasBatch);
    this.bindControls();
    const host = window as unknown as { civicOpsStageFire?: (shot: string) => void };
    host.civicOpsStageFire = (shot) => this.stage(shot);
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', (entity) => this.grab(entity)),
      this.queries.held.subscribe('disqualify', (entity) => this.release(entity)),
      this.queries.pressed.subscribe('qualify', (entity) => this.press(entity)),
      this.world.visibilityState.subscribe((visibility) => {
        if (visibility === VisibilityState.Visible) this.unlockAudio();
        else this.audio.setSceneAmbience(false);
      }),
      () => { delete host.civicOpsStageFire; this.teardown(); },
    );
    this.startedAt = new Date().toISOString();
    this.startedMs = performance.now();
    this.setVisible('casualty', false);
    this.setVisible('handover', false);
    this.setVisible('results', false);
    this.unlockAudio();
    this.refresh();
    this.instructor.say(SCENE_SAFETY_NOTICE);
    if (this.instructor.guidance === 'unguided') this.instructor.say(UNGUIDED_BRIEF);
    this.text('steps', 'caption', formatTrainingCaption(guidanceCaption(this.instructor.guidance, COPY['place-blocker'], this.state.feedback, FIRE_INSTRUCTIONS)));
  }

  private buildConeInstances(): InstancedMesh | undefined {
    const first = this.cones[0]?.object3D;
    if (!first) return undefined;
    first.updateMatrixWorld(true);
    const inverse = first.matrixWorld.clone().invert();
    const arrays = { position: [] as number[], normal: [] as number[], uv: [] as number[] };
    let source: Mesh['material'] | undefined;
    first.traverse((child) => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) return;
      source ??= child.material;
      const expanded = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry;
      const decoded = new BufferGeometry();
      for (const name of ['position', 'normal', 'uv'] as const) {
        const attribute = expanded.getAttribute(name);
        decoded.setAttribute(name, new Float32BufferAttribute(decodeSurfaceAttribute(attribute), attribute.itemSize));
      }
      decoded.applyMatrix4(this.matrix.multiplyMatrices(inverse, child.matrixWorld));
      for (const name of ['position', 'normal', 'uv'] as const) {
        const values = decoded.getAttribute(name).array;
        for (let index = 0; index < values.length; index += 1) arrays[name].push(values[index]);
      }
      decoded.dispose();
      if (expanded !== child.geometry) expanded.dispose();
    });
    if (!source || Array.isArray(source)) return undefined;
    const geometry = new BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) geometry.setAttribute(name, new Float32BufferAttribute(arrays[name], name === 'uv' ? 2 : 3));
    geometry.computeBoundingSphere();
    const instances = new InstancedMesh(geometry, source, this.cones.length);
    instances.name = 'FireCones';
    instances.frustumCulled = false;
    instances.raycast = skipRaycast;
    this.generated.push(this.world.createTransformEntity(instances, this.session));
    trackGeneratedInstances(instances, this.disposedResources);
    for (const entity of this.cones) entity.object3D?.traverse((child) => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) return;
      const hidden = child.material.clone();
      hidden.visible = false;
      child.material = hidden;
      this.disposedResources.push(hidden);
    });
    return instances;
  }

  private updateConeInstances(): void {
    const instances = this.coneMesh;
    if (!instances) return;
    for (let index = 0; index < this.cones.length; index += 1) {
      const object = this.cones[index].object3D;
      if (!object) continue;
      object.updateMatrixWorld(true);
      this.matrix.multiplyMatrices(this.inverse, object.matrixWorld);
      instances.setMatrixAt(index, this.matrix);
    }
    instances.instanceMatrix.needsUpdate = true;
  }

  private buildHazards(): void {
    const spots: ReadonlyArray<{ id: SceneHazard; color: string }> = [
      { id: 'fuel-spill', color: '#8ef6d2' },
      { id: 'downed-cable', color: '#f5d78c' },
      { id: 'unstable-vehicle', color: '#ffb25a' },
      { id: 'traffic', color: '#ff6d62' },
    ];
    for (const spot of spots) {
      const mesh = new HazardMarker(spot.color);
      const point = FIRE_HAZARD_MARKERS[spot.id];
      mesh.position.set(point.x, 0.16, point.z);
      mesh.name = `hazard-${spot.id}`;
      const entity = this.world.createTransformEntity(mesh, this.session);
      entity.addComponent(SceneSafetyTarget, { kind: 'hazard', partId: spot.id });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      this.generated.push(entity);
      this.disposedResources.push(mesh);
    }
  }

  private claimEmissive(mesh: Mesh, color: string, phase: number): void {
    if (Array.isArray(mesh.material)) return;
    this.orphans.push(mesh.material);
    const material = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.34, metalness: 0.04 });
    mesh.material = material;
    mesh.raycast = skipRaycast;
    this.glow.push(material);
    this.glowPhase.push(phase);
    this.disposedResources.push(material);
  }

  private paint(rootName: string, meshName: string, color: string, phase: number): void {
    const node = this.world.requireSceneObject(rootName).getObjectByName(meshName);
    node?.traverse((child) => { if (child instanceof Mesh) this.claimEmissive(child, color, phase); });
  }

  private buildLights(): void {
    this.paint('fire-engine', 'LightBarRed', '#ff2d2d', 0);
    this.paint('fire-engine', 'LightBarBlue', '#2f63ff', Math.PI);
    this.paint('fire-ambulance', 'LightBarRed', '#ff2d2d', 0.4);
    this.paint('fire-ambulance', 'LightBarBlue', '#2f63ff', Math.PI + 0.4);
    this.paint('fire-mast', 'MastLamp', '#ffe1a8', 0.2);
    for (let index = 1; index <= 3; index += 1) this.paint(`fire-flare-${index}`, 'FlareGlow', '#ff6a1a', index * 0.8);
    const street = this.world.requireSceneObject('fire-street');
    this.fuelMaterial = new ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float time;
        vec3 color=0.55+0.45*cos(6.28318*(vUv.x*3.0+vUv.y*2.0+time*0.35+vec3(0.0,0.33,0.67)));
        float rim=smoothstep(0.52,0.05,distance(vUv,vec2(0.5)));
        gl_FragColor=vec4(color,0.62*rim);`,
    });
    const spill = street.getObjectByName('FuelSpill');
    if (spill instanceof Mesh) {
      if (!Array.isArray(spill.material)) this.orphans.push(spill.material);
      spill.material = this.fuelMaterial;
      spill.raycast = skipRaycast;
    } else {
      const geometry = new CircleGeometry(1.15, 18);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new Mesh(geometry, this.fuelMaterial);
      mesh.position.set(FIRE_SCENE.fuel.x, 0.12, FIRE_SCENE.fuel.z);
      mesh.raycast = skipRaycast;
      this.generated.push(this.world.createTransformEntity(mesh, this.session));
      this.disposedResources.push(geometry);
    }
    this.disposedResources.push(this.fuelMaterial);
    this.sweepMaterial = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float time;
        float sweep=sin(vUv.y*16.0-time*3.2);
        vec3 lamp=sweep>0.0?vec3(0.95,0.08,0.1):vec3(0.12,0.28,1.0);
        float band=smoothstep(0.05,0.8,abs(sweep));
        float pool=smoothstep(0.42,0.0,distance(vUv,vec2(0.28,0.46)));
        float flare=smoothstep(0.07,0.0,distance(vUv,vec2(0.22,0.86)));
        gl_FragColor=vec4(lamp*band+vec3(1.0,0.62,0.22)*(pool*0.45+flare),band*0.16+pool*0.28+flare*0.55);`,
    });
    const sweepGeometry = new PlaneGeometry(12, 36);
    sweepGeometry.rotateX(-Math.PI / 2);
    const sweep = new Mesh(sweepGeometry, this.sweepMaterial);
    sweep.position.set(-1.4, 0.11, 6);
    sweep.frustumCulled = false;
    sweep.raycast = skipRaycast;
    sweep.name = 'LightSweep';
    this.generated.push(this.world.createTransformEntity(sweep, this.session));
    this.disposedResources.push(sweepGeometry, this.sweepMaterial);
  }

  private unlockAudio(): void {
    if (this.world.visibilityState.peek() !== VisibilityState.Visible) return;
    this.audio.unlock();
    this.audio.startSceneAmbience();
    this.audio.setSceneAmbience(true);
    this.instructor.unlock();
    if (!this.sirenPlayed) { this.sirenPlayed = true; this.audio.play('siren-blip'); }
  }

  private text(panel: string, id: string, value: string): void { this.panels.get(panel)?.getElementById<UIKit.Text>(id)?.setProperties({ text: value }); }
  private setVisible(panel: string, visible: boolean): void { this.world.getSceneEntity(`fire-${panel}-panel`)?.setValue(Visibility, 'isVisible', visible); }
  private bind(panel: string, id: string, callback: () => void): void {
    const element = this.panels.get(panel)?.getElementById(id);
    if (!element) return;
    element.name = id;
    this.cleanupFuncs.push(this.dwell.register(id, element, this.panels.get(panel)!, () => { this.unlockAudio(); callback(); }));
    const latch = new PointerPressLatch();
    const down = { transformTranslateZ: -.35 };
    const up = { transformTranslateZ: 0 };
    const cancel = (event: { pointerId: number }) => { latch.cancel(event.pointerId); element.setProperties(up); };
    element.setProperties({
      onPointerDown: (event: { pointerId: number }) => { latch.press(event.pointerId, element); element.setProperties(down); this.unlockAudio(); },
      onPointerUp: (event: { pointerId: number }) => { if (!latch.release(event.pointerId)) return; element.setProperties(up); if (this.world.visibilityState.peek() === VisibilityState.Visible) callback(); },
      onPointerCancel: cancel,
      onPointerLeave: cancel,
    });
    this.cleanupFuncs.push(registerPokeableVisualTarget(element), () => { latch.reset(); element.setProperties({ onPointerDown: undefined, onPointerUp: undefined, onPointerLeave: undefined, onPointerCancel: undefined }); });
  }

  private bindControls(): void {
    const jobs = () => window.dispatchEvent(new Event('civicops:jobs'));
    this.bind('steps', 'back-to-jobs', jobs);
    this.bind('steps', 'explain-why', () => {
      const stepId = (currentFireStep(this.state)?.id ?? 'place-blocker') as SceneStepId;
      if (this.instructor instanceof LiveMetaInstructor) {
        void this.instructor.ask(`Why is ${stepId.replace(/-/g, ' ')} required?`, { stepId, programme: 'scene-safety' }).then((line) => {
          this.text('steps', 'caption', formatTrainingCaption(line));
        });
        return;
      }
      const why = sceneStepLines[stepId]?.why;
      if (!why) return;
      this.instructor.say(why);
      this.text('steps', 'caption', formatTrainingCaption(why));
    });
    this.bind('controls', 'mark-approach', () => { this.player.head.getWorldPosition(this.point); this.act({ type: 'approach', x: this.point.x, z: this.point.z }); });
    this.bind('controls', 'send-handover', () => this.handover());
    this.bind('controls', 'hint', () => { this.state = hintFire(this.state, Math.round(performance.now() - this.startedMs)); this.refresh(); this.instructor.say(this.state.feedback); this.text('steps', 'caption', formatTrainingCaption(this.state.feedback)); });
    this.bind('controls', 'reset', () => this.reset(false));
    this.bind('controls', 'daily-drill', () => this.reset(true));
    this.bind('controls', 'jobs', jobs);
    this.bind('handover', 'see-results', () => this.finish());
    this.bind('handover', 'handover-jobs', jobs);
    this.bind('results', 'try-again', () => this.reset(false));
    this.bind('results', 'daily-drill', () => this.reset(true));
    this.bind('results', 'back-to-jobs', jobs);
  }

  private now(): number { return Math.round(performance.now() - this.startedMs); }
  private act(event: FireEvent): void {
    if (this.disposed || this.resetting || this.state.completed) return;
    const previous = this.state;
    const previousStep = currentFireStep(previous)?.id;
    this.state = performFire(previous, event, this.now());
    if (this.state === previous) return;
    this.refresh();
    const type = typeof event === 'string' ? event : event.type;
    const nextStep = currentFireStep(this.state)?.id as SceneStepId | undefined;
    const speak = this.state.failed || (type !== 'place' && type !== 'remove') || nextStep !== previousStep;
    if (speak) {
      const volunteered = (type === 'place' || type === 'remove') && !this.state.failed && !!nextStep;
      const line = volunteered ? sceneStepLines[nextStep].instruction : this.state.feedback;
      if (volunteered) this.instructor.sayInstruction(line); else this.instructor.say(line);
      this.text('steps', 'caption', formatTrainingCaption(guidanceCaption(this.instructor.guidance, line, this.state.feedback, FIRE_INSTRUCTIONS)));
    }
    if (!this.state.failed && typeof event !== 'string' && event.type === 'place') this.audio.play(event.kind === 'flare' ? 'flare-pop' : 'cone-thunk');
    if (this.state.failed) { this.audio.play('warning-buzz'); this.finish(); }
  }

  private grab(entity: Entity): void {
    this.unlockAudio();
    if (this.state.completed) { this.world.getSystem(GrabSystem)?.forceRelease(entity); return; }
    const kind = entity.getValue(SceneSafetyTarget, 'kind') ?? '';
    if (!PLACEABLE.has(kind)) return;
    this.act({ type: 'remove', kind: kind as FirePartKind, id: entity.getValue(SceneSafetyTarget, 'partId') ?? '' });
  }

  private restore(entity: Entity): void {
    const home = this.homes.get(entity.index);
    const object = entity.object3D;
    if (!home || !object) return;
    this.session.object3D?.attach(object);
    object.position.copy(home.position);
    object.quaternion.copy(home.quaternion);
  }

  private nearestCasualty(maxDistance: number): Entity | undefined {
    let best: Entity | undefined;
    let bestDistance = maxDistance;
    for (let index = 0; index < this.casualties.length; index += 1) {
      const entity = this.casualties[index];
      entity.object3D?.getWorldPosition(this.other);
      const dx = this.point.x - this.other.x;
      const dz = this.point.z - this.other.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= bestDistance) { bestDistance = distance; best = entity; }
    }
    return best;
  }

  private release(entity: Entity): void {
    if (this.disposed || this.resetting || this.state.completed || !entity.object3D) return;
    const object = entity.object3D;
    const kind = entity.getValue(SceneSafetyTarget, 'kind') ?? '';
    const id = entity.getValue(SceneSafetyTarget, 'partId') ?? '';
    object.getWorldPosition(this.point);
    if (kind === 'tag') {
      const casualty = this.nearestCasualty(1.15);
      const casualtyId = casualty?.getValue(SceneSafetyTarget, 'partId') ?? '';
      if (casualty?.object3D && (casualtyId === 'c1' || casualtyId === 'c2' || casualtyId === 'c3' || casualtyId === 'c4')) {
        casualty.object3D.attach(object);
        object.position.set(0, 1.05, 0.18);
        object.rotation.set(0, 0, 0);
        this.showCasualty(casualtyId);
        this.act({ type: 'tag', casualtyId, tag: id as TriageTag });
        this.audio.play('tag-rustle');
        return;
      }
      this.restore(entity);
      return;
    }
    if (!PLACEABLE.has(kind)) return;
    const out = Math.abs(this.point.x) > 16 || this.point.z < -26 || this.point.z > 30 || this.point.y > 2.4;
    if (out) { this.act({ type: 'remove', kind: kind as FirePartKind, id }); this.restore(entity); return; }
    if (kind === 'exclusion') {
      const dx = this.point.x - FIRE_SCENE.cable.x;
      const dz = this.point.z - FIRE_SCENE.cable.z;
      if (Math.hypot(dx, dz) <= 4.4) { this.point.x = FIRE_SCENE.cable.x; this.point.z = FIRE_SCENE.cable.z; }
    }
    object.getWorldQuaternion(this.q);
    this.forward.set(0, 0, 1).applyQuaternion(this.q);
    const yaw = Math.atan2(this.forward.x, this.forward.z);
    this.session.object3D?.attach(object);
    object.position.set(this.point.x, 0, this.point.z);
    object.rotation.set(0, yaw, 0);
    this.act({ type: 'place', kind: kind as FirePartKind, placement: { id, x: this.point.x, z: this.point.z, yaw } });
  }

  private press(entity: Entity): void {
    const kind = entity.getValue(SceneSafetyTarget, 'kind');
    const id = entity.getValue(SceneSafetyTarget, 'partId') ?? '';
    if (kind === 'hazard' && (FIRE_HAZARDS as readonly string[]).includes(id)) this.act({ type: 'hazard', id: id as SceneHazard });
    if (kind === 'casualty') this.showCasualty(id);
  }

  private showCasualty(id: string): void {
    const casualty = casualtyById(this.state.scenario, id);
    const object = this.cardEntity.object3D;
    if (!casualty || !object) return;
    const spot = FIRE_CASUALTY_XZ[casualty.id];
    const card = casualtyCardCopy(casualty);
    object.position.set(spot.x - 0.9, 1.28, spot.z + 0.15);
    this.player.head.getWorldPosition(this.other);
    object.rotation.set(-0.25, Math.atan2(this.other.x - object.position.x, this.other.z - object.position.z), 0);
    this.text('casualty', 'card-title', card.title);
    this.text('casualty', 'card-body', card.body);
    this.setVisible('casualty', true);
  }

  private fillHandover(card: SceneHandover): void {
    const counts = card.categories;
    this.text('handover', 'handover-counts', `Minor ${counts.minor}  Delayed ${counts.delayed}\nImmediate ${counts.immediate}  Expectant ${counts.expectant}`);
    this.text('handover', 'handover-hazards', card.hazards.length === FIRE_HAZARDS.length ? 'Fuel, cable, vehicle\nand open traffic.' : 'Hazards still open.\nFinish the size-up.');
    this.text('handover', 'handover-units', card.unitsNeeded.join('\n'));
    this.text('handover', 'handover-cable', 'Cable stays live until\nElectricity confirms dead.');
  }

  private handover(): void {
    this.act('handover');
    if (!this.state.handover) return;
    this.fillHandover(this.state.handover);
    this.setVisible('steps', false);
    this.setVisible('controls', false);
    this.setVisible('results', false);
    this.setVisible('handover', true);
    this.audio.play('radio-squelch');
  }

  private refresh(): void {
    const step = (currentFireStep(this.state)?.id ?? 'handover') as SceneStepId;
    this.text('steps', 'current-step', assessmentStepTitle(this.instructor.guidance, TITLES[step], sceneSafetyModule.steps.find((definition) => definition.id === step)?.order ?? sceneSafetyModule.steps.length, sceneSafetyModule.steps.length));
    this.text('steps', 'caption', formatTrainingCaption(guidanceCaption(this.instructor.guidance, COPY[step], this.state.feedback, FIRE_INSTRUCTIONS)));
    this.text('steps', 'safety-notice', this.state.scenario.variations.includes('deteriorating-casualty')
      ? 'Vest 2 deteriorated.\nRead the card again.\nYou decide the tag.'
      : 'Illustrative training.\nYou decide each action.\nNot emergency care.');
    this.text('controls', 'found-count', `Hazards ${this.state.foundHazards.length} / 4`);
    this.text('controls', 'tag-count', `Tags ${sceneCasualties(this.state.scenario).filter((casualty) => this.state.tags[casualty.id]).length} / 4`);
    this.text('controls', 'zone-status', this.state.failed ? 'STOPPED\nStep back and reset.' : guidanceStatus(this.instructor.guidance, COPY[step]));
    let count = 0;
    for (const definition of sceneSafetyModule.steps) {
      const correct = this.state.steps.some((result) => result.stepId === definition.id && result.outcome === 'correct');
      if (correct) count += 1;
      this.text('steps', `step-${definition.order}`, correct ? '+' : String(definition.order));
      this.panels.get('steps')?.getElementById(`step-${definition.order}`)?.setProperties({ backgroundColor: correct ? '#103d50' : definition.id === step ? '#f5d78c' : '#e3ebe5', color: correct ? '#ffffff' : '#103d50' });
    }
    this.text('steps', 'step-progress', `${count} / 7 complete`);
    this.session.setValue(SceneSafetySession, 'step', step);
    this.session.setValue(SceneSafetySession, 'complete', this.state.completed);
    this.session.setValue(SceneSafetySession, 'failed', this.state.failed);
    this.session.setValue(SceneSafetySession, 'score', score(this.state));
    this.session.setValue(SceneSafetySession, 'found', this.state.foundHazards.length);
    this.session.setValue(SceneSafetySession, 'tagged', sceneCasualties(this.state.scenario).filter((casualty) => this.state.tags[casualty.id]).length);
    this.session.setValue(SceneSafetySession, 'lastFeedback', this.state.feedback);
    this.session.setValue(TrainingSession, 'step', step);
    this.session.setValue(TrainingSession, 'complete', this.state.completed);
    this.session.setValue(TrainingSession, 'failed', this.state.failed);
    this.session.setValue(TrainingSession, 'score', score(this.state));
  }

  private finish(): void {
    if (this.saved || !this.state.completed) return;
    this.saved = true;
    for (const entity of this.queries.targets.entities) this.world.getSystem(GrabSystem)?.forceRelease(entity);
    const attempt = buildAttempt(this.state, { startedAt: this.startedAt, completedAt: new Date().toISOString(), crewId: this.crewId, accessibility: attemptAccessibility(this.a11y), device: attemptDevice(this.world.renderer.xr.isPresenting) }, sceneSafetyModule);
    const certification = this.progress.record(attempt, sceneSafetyModule);
    if (this.dailyMode) this.daily.recordDailyPass(attempt);
    presentModuleResults(this.panels.get('results')!, {
      attempt, module: sceneSafetyModule, certification,
      comeback: comeBackSummary(this.progress.getAttempts(), new Date(), { moduleId: sceneSafetyModule.id, crewId: this.crewId, passMark: 80 }),
      daily: this.daily.moduleDailyStatus(sceneSafetyModule),
      departmentLabel: 'FIRE & EMS', completeEyebrow: 'CIVICOPS / SCENE SAFETY COMPLETE', feedback: formatTrainingCaption(this.state.feedback),
    });
    placeReviewPanel(this.panels.get('results')!, this.player.head, this.panels.get('results')?.getElementById('result-body'));
    this.setVisible('steps', false);
    this.setVisible('controls', false);
    this.setVisible('handover', false);
    this.setVisible('casualty', false);
    this.setVisible('results', true);
    this.audio.play(attempt.passed ? 'success-chime' : 'warning-buzz');
  }

  private reset(daily: boolean): void {
    if (this.state.completed && !this.saved) this.finish();
    this.resetting = true;
    for (const entity of this.queries.targets.entities) {
      this.world.getSystem(GrabSystem)?.forceRelease(entity);
      this.restore(entity);
    }
    this.dailyMode = daily;
    this.state = prepareProcedure(startFire(daily ? createFireDailyDrill().scenario : this.state.scenario));
    this.saved = false;
    this.startedAt = new Date().toISOString();
    this.startedMs = performance.now();
    this.frames = 0;
    this.setVisible('results', false);
    this.setVisible('handover', false);
    this.setVisible('casualty', false);
    this.setVisible('steps', true);
    this.setVisible('controls', true);
    this.resetting = false;
    this.refresh();
    this.instructor.sayInstruction(COPY['place-blocker']);
  }

  private movePart(id: string, x: number, z: number, yaw: number): void {
    const entity = this.parts.get(id);
    const object = entity?.object3D;
    if (!object) return;
    this.session.object3D?.attach(object);
    object.position.set(x, 0, z);
    object.rotation.set(0, yaw, 0);
  }

  private applyLayout(layout: FireLayout): void {
    if (layout.blocker) this.movePart(layout.blocker.id, layout.blocker.x, layout.blocker.z, layout.blocker.yaw);
    for (const cone of layout.cones) this.movePart(cone.id, cone.x, cone.z, cone.yaw);
    for (const flare of layout.flares) this.movePart(flare.id, flare.x, flare.z, flare.yaw);
    if (layout.exclusion) this.movePart(layout.exclusion.id, layout.exclusion.x, layout.exclusion.z, layout.exclusion.yaw);
  }

  private stage(shot: string): void {
    this.staging = true;
    this.frames = 0;
    const layout = createGoodFireLayout();
    if (shot === 'overview' || shot === 'blocker' || shot === 'exclusion' || shot === 'triage' || shot === 'handover' || shot === 'results') this.applyLayout(layout);
    if (shot === 'overview' || shot === 'blocker' || shot === 'exclusion' || shot === 'triage') {
      this.setVisible('steps', false);
      this.setVisible('controls', false);
    }
    if (shot === 'triage' || shot === 'handover' || shot === 'results') {
      const tag = this.parts.get('immediate');
      const casualty = this.parts.get('c3');
      if (tag?.object3D && casualty?.object3D) {
        casualty.object3D.attach(tag.object3D);
        tag.object3D.position.set(0, 1.05, 0.18);
        tag.object3D.rotation.set(0, 0, 0);
      }
      this.showCasualty('c3');
    }
    if (shot === 'handover' || shot === 'results') {
      let state = startFire(this.state.scenario);
      const events = goodFireEvents(this.state.scenario);
      const through = shot === 'results' ? events : events.slice(0, -1);
      for (const event of through) state = performFire(state, event, 4000);
      this.state = state;
      this.refresh();
    }
    if (shot === 'handover') {
      this.fillHandover(buildHandover(this.state.scenario, FIRE_HAZARDS));
      this.setVisible('steps', false);
      this.setVisible('controls', false);
      this.setVisible('results', false);
      this.setVisible('handover', true);
    }
    if (shot === 'results') {
      this.state = performFire(this.state, 'handover', 5000);
      this.saved = false;
      this.finish();
    }
    this.staging = false;
  }

  update(delta: number, time: number): void {
    if (this.disposed || this.world.visibilityState.peek() !== VisibilityState.Visible) return;
    this.seatedRig.update(this.player, this.player.head, this.a11y);
    this.dwell.tick(this.a11y.dwellSelect, this.player.head, performance.now());
    this.frames += 1;
    this.session.object3D?.updateMatrixWorld(true);
    if (this.session.object3D) this.inverse.copy(this.session.object3D.matrixWorld).invert();
    this.updateConeInstances();
    for (let index = 0; index < this.glow.length; index += 1) {
      const wave = Math.sin(time * 8 + this.glowPhase[index]);
      this.glow[index].emissiveIntensity = this.a11y.reducedMotion ? 2.2 : wave > 0 ? 3.2 : 1.35;
    }
    if (this.fuelMaterial) this.fuelMaterial.uniforms.time.value = time;
    if (this.sweepMaterial) this.sweepMaterial.uniforms.time.value = time;
    for (let index = 0; index < this.traffic.length; index += 1) {
      this.trafficZ[index] -= delta * 7;
      if (this.trafficZ[index] < -22) this.trafficZ[index] += 46;
      this.traffic[index].position.set(2.35, 0, this.trafficZ[index]);
    }
    this.atlasBatch?.update();
    this.player.head.getWorldPosition(this.point);
    this.player.head.getWorldDirection(this.forward).negate();
    this.audio.setListenerPose(this.point, this.forward, this.up);
    if (this.staging || this.frames < 30 || this.state.completed || this.state.failed) return;
    if (inExclusion(this.point.x, this.point.z) || inLiveLane(this.point.x, this.point.z)) this.act({ type: 'stand', x: this.point.x, z: this.point.z });
  }

  private teardown(): void {
    if (this.disposed) return;
    if (this.state.completed && !this.saved) this.finish();
    this.disposed = true;
    for (const entity of this.queries.targets.entities) this.world.getSystem(GrabSystem)?.forceRelease(entity);
    this.instructor.dispose();
    this.audio.setSceneAmbience(false);
    this.audio.dispose();
    for (const entity of this.generated) entity.dispose({ disposeResources: false });
    for (const resource of this.disposedResources) resource.dispose();
    for (const orphan of this.orphans) orphan.dispose();
  }
}

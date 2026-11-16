import { isRoomEntry } from './ar-entry.js';
import type { RoomAssistSystem } from './room-assist-system.js';
import { ScriptedInstructor } from './training/instructor.js';
import { createInstructor, liveLlmOptions } from './training/meta-instructor.js';
import { browserStorage } from './training/browser-storage.js';
import { loadGuidance, type GuidanceMode } from './training/guidance.js';
import { preShiftView } from './training/preshift-guidance.js';
import { chooseGuidance, guidanceToggleLabel, nextGuidance } from './training/guidance-toggle.js';
import { loadSettings, saveSettings, type AccessibilitySettings } from './training/accessibility-settings.js';
import { dwellToggleLabel } from './training/gaze-dwell.js';
import { ModuleDwell } from './module-dwell.js';
import { TRAINING_PROGRAMMES } from './training/programmes.js';
import { activatePreparation, answerPreparation, buildPreparationFailure, startPreparation, type PreparationState } from './training/programme-state.js';
import { StreetLifeSystem } from './street-life-system.js';
import { preShiftEnabled } from './ui/title-options.js';
import { BufferGeometry, CacheManager, createSystem, Entity, Material, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Texture, UIKit, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { createHazardIconStrip, selectedDepartmentIcon } from './scene-assets/department-icons.scene-asset.js';
import { MODULE_MODEL_IDS, retireModelResources } from './training/module-assets.js';
import { ModuleBoard } from './module-components.js';
import { registerPokeableVisualTarget } from './hand-visual-system.js';
import { PointerPressLatch } from './training/pointer-press.js';
import { certificationTitle, resolveTrainingEntry, workOrderCard, type HazardChip } from './training/catalog/work-orders.js';
import { practiceCertificationDisplay } from './training/certification-display.js';
import { TrainingProgress } from './training/progress.js';
import { trainingModuleById, defaultCrewForModule } from './training/modules/module-registry.js';
import type { FieldAssistSystem } from './field-assist-system.js';
import type { RoadsTrainingSystem } from './roads-training-system.js';
import type { SceneSafetyTrainingSystem } from './scene-safety-training-system.js';
import type { TrainingSystem } from './training-system.js';
import type { SceneStaticBatchingSystem } from './scene-static-batching-system.js';
import type { WaterTrainingSystem } from './water-training-system.js';

const JOBS: Record<string, readonly string[]> = {
  electricity: ['ELEC.STREETLIGHT_FAULT', 'ELEC.LIVE_WIRE_DOWN'],
  water: ['WATER.BURST_MAIN'],
  roads: ['ROADS.POTHOLE_REPAIR', 'ROADS.BLOCKED_DRAIN', 'ROADS.TRAFFIC_SIGNAL_FAULT'],
  fire: ['FIRE.VEHICLE_EXTRICATION', 'EMS.MEDICAL_RESPONSE', 'TRAFFIC.CRASH_SCENE'],
};
/** One department router; systems and module-owned GPU resources retire on exit. */
export class ModuleBoardSystem extends createSystem({ board: { required: [ModuleBoard] } }) {
  private panel?: UIKitMLAsset;
  private listeners: (() => void)[] = [];
  private department = 'electricity';
  private jobIndex = 0;
  private code = JOBS.electricity[0];
  private preparation?: PreparationState;
  private preparationStarted = '';
  private approvedModule?: string;
  private preShiftInstructor?: ScriptedInstructor;
  private guidance: GuidanceMode = 'guided';
  private a11y: AccessibilitySettings = loadSettings(browserStorage(), globalThis.location?.search ?? '');
  private readonly dwell = new ModuleDwell();
  private current = 'board';
  private switching = false;
  private electricalClass?: typeof TrainingSystem;
  private batchingClass?: typeof SceneStaticBatchingSystem;
  private roadsClass?: typeof RoadsTrainingSystem;
  private waterClass?: typeof WaterTrainingSystem;
  private fireClass?: typeof SceneSafetyTrainingSystem;
  private roomClass?:typeof RoomAssistSystem;
  private assistClass?: typeof FieldAssistSystem;
  private fade!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private fadeEntity!: Entity;
  private fadeTarget = 0;
  private faded?: () => void;
  private hazardEntity?: Entity;
  private hazardStrip?: Mesh<BufferGeometry, MeshBasicMaterial>;
  private hazardLayoutPending = false;
  private readonly hazardPoint = new Vector3();

  init(): void {
    this.fade = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ color: '#06131a', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    this.fade.position.z = -.1; this.fade.renderOrder = 10000; this.fade.frustumCulled = false; this.fade.visible = false;
    this.fadeEntity = this.world.createTransformEntity(this.fade, { parent: this.world.playerHeadEntity, persistent: true });
    const jobs = () => { if(isRoomEntry(location.search)){location.search='';return;}void this.switchTo('board'); };
    window.addEventListener('civicops:jobs', jobs);
    // Title screen and desktop HUD open a lesson directly by id.
    const open = (event: Event) => { const id = (event as CustomEvent<{ moduleId: string }>).detail?.moduleId; if (id) void this.switchTo(id); };
    window.addEventListener('civicops:open-module', open);
    this.cleanupFuncs.push(() => window.removeEventListener('civicops:open-module', open));
    this.cleanupFuncs.push(() => { window.removeEventListener('civicops:jobs', jobs); this.unbind(); this.fadeEntity.dispose({ disposeResources: false }); this.fade.geometry.dispose(); this.fade.material.dispose(); });
    const requested = new URLSearchParams(location.search).get('department');
    if (requested && (JOBS[requested] || requested === 'assist' || requested === 'metro' || requested === 'disaster')) {
      this.department = requested;
      this.code = JOBS[requested]?.[0] ?? this.code;
    }
    this.guidance = loadGuidance(browserStorage(), globalThis.location?.search ?? '');
    this.preShiftInstructor = createInstructor(() => {}, { volume: 0.65, llm: liveLlmOptions(), guidance: this.guidance });
    this.cleanupFuncs.push(() => this.preShiftInstructor?.dispose());
    this.bindBoard();
    this.publishModule();
    const entry = resolveTrainingEntry(location.search);
    if (new URLSearchParams(location.search).get('mode') === 'assist') void this.switchTo('field-assist');
    else if (entry.kind === 'module') void this.switchTo(entry.moduleId);
    else if (entry.kind === 'unavailable') { this.code = entry.card.code; this.refresh(); }
  }

  /** Board-level mode switch. The headset choice is saved and beats any ?guidance= judge URL from here on. */
  private toggleGuidance(): void {
    this.guidance = nextGuidance(this.guidance);
    const search = chooseGuidance(browserStorage(), location.search, this.guidance);
    if (search !== location.search) history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`);
    this.preShiftInstructor?.dispose();
    this.preShiftInstructor = createInstructor(() => {}, { volume: 0.65, llm: liveLlmOptions(), guidance: this.guidance });
    this.publishModule();
    this.refresh();
  }

  /** Look-to-press for the board and every module, saved with the shared accessibility settings. */
  private toggleDwell(): void {
    const current = loadSettings(browserStorage(), '');
    saveSettings(browserStorage(), { ...current, dwellSelect: !current.dwellSelect });
    this.refresh();
  }

  private retireHazards(): void {
    this.hazardEntity?.dispose({ disposeResources: false }); this.hazardEntity = undefined;
    this.hazardStrip?.geometry.dispose(); this.hazardStrip?.material.dispose(); this.hazardStrip = undefined;
    this.hazardLayoutPending = false;
  }
  private unbind(): void { this.retireHazards(); for (const remove of this.listeners) remove(); this.listeners = []; this.panel = undefined; }
  private bind(id: string, callback: () => void): void {
    const element = this.panel?.getElementById(id); if (!element) return;
    element.name = id;
    this.listeners.push(this.dwell.register(id, element, this.panel!, () => { if (!this.switching) callback(); }));
    const latch = new PointerPressLatch();
    const down = (event: { pointerId: number }) => { if (this.switching) return; latch.press(event.pointerId, element); element.setProperties({ transformTranslateZ: -.35 }); };
    const up = (event: { pointerId: number }) => { if (!latch.release(event.pointerId)) return; element.setProperties({ transformTranslateZ: 0 }); callback(); };
    const cancel = (event: { pointerId: number }) => { latch.cancel(event.pointerId); element.setProperties({ transformTranslateZ: 0 }); };
    element.setProperties({ onPointerDown: down, onPointerUp: up, onPointerCancel: cancel, onPointerLeave: cancel });
    this.listeners.push(registerPokeableVisualTarget(element), () => { latch.reset(); element.setProperties({ onPointerDown: undefined, onPointerUp: undefined, onPointerCancel: undefined, onPointerLeave: undefined }); });
  }

  private bindBoard(): void {
    this.panel = this.world.requireSceneObject<UIKitMLAsset>('department-board-panel');
    for (const department of Object.keys(JOBS)) this.bind(`tab-${department}`, () => { this.department = department; this.jobIndex = 0; this.code = JOBS[department][0]; this.refresh(); });
    for (const department of ['assist', 'metro', 'disaster']) this.bind(`tab-${department}`, () => { this.department = department; this.refresh(); });
    this.bind('next-job', () => { const codes = JOBS[this.department]; if (codes) { this.jobIndex = (this.jobIndex + 1) % codes.length; this.code = codes[this.jobIndex]; this.refresh(); } });
    this.bind('open-module', () => { const card = workOrderCard(this.code); if (this.department === 'assist') { location.search='?mode=assist';return; } if (JOBS[this.department] && card.availability === 'ready' && card.moduleId) void this.switchTo(card.moduleId); });
    this.bind('asset-credits-open',()=>{this.retireHazards();this.panel?.getElementById('board-content')?.setProperties({display:'none'});this.panel?.getElementById('asset-credits-panel')?.setProperties({display:'flex'});});
    this.bind('asset-credits-close',()=>{this.panel?.getElementById('asset-credits-panel')?.setProperties({display:'none'});this.panel?.getElementById('board-content')?.setProperties({display:'flex'});this.refresh();});
    this.bind('guidance-toggle', () => this.toggleGuidance());
    this.bind('dwell-toggle', () => this.toggleDwell());
    this.bind('programme-choice-0', () => this.checkPreparation(0));
    this.bind('programme-choice-1', () => this.checkPreparation(1));
    this.bind('programme-cancel', () => { this.preparation = undefined; this.approvedModule = undefined; activatePreparation(undefined); this.preShiftInstructor?.stop(); this.showPreparation(); });
    this.showPreparation(); this.refresh();
  }

  private text(id: string, text: string): void { this.panel?.getElementById<UIKit.Text>(id)?.setProperties({ text }); }
  private updateHazards(hazards: readonly HazardChip[], options: readonly string[] = []): void {
    this.retireHazards();
    for (let index = 0; index < 3; index += 1) {
      const label = hazards[index]?.label ?? options[index];
      this.panel?.getElementById(`hazard-chip-${index + 1}`)?.setProperties({ display: label ? 'flex' : 'none' });
      this.panel?.getElementById(`hazard-mark-${index + 1}`)?.setProperties({ display: hazards.length ? 'flex' : 'none' });
      this.text(`hazard-text-${index + 1}`, label ?? '');
    }
    if (hazards.length === 0) return;
    this.hazardStrip = createHazardIconStrip(hazards.map((hazard) => hazard.icon));
    this.hazardEntity = this.world.createTransformEntity(this.hazardStrip, this.world.requireSceneEntity('department-board-panel'));
    this.hazardLayoutPending = true;
  }
  private refresh(): void {
    const card = workOrderCard(this.code);
    selectedDepartmentIcon.value = Object.keys(JOBS).indexOf(this.department);
    const ready = !!JOBS[this.department] && card.availability === 'ready';
    this.text('department-readiness', '4 READY / ELEC + WATER + ROADS + FIRE');
    this.text('guidance-toggle', guidanceToggleLabel(this.guidance));
    this.a11y = loadSettings(browserStorage(), globalThis.location?.search ?? '');
    this.text('dwell-toggle', dwellToggleLabel(this.a11y.dwellSelect));
    this.text('board-note', JOBS[this.department] && card.pendingCatalogue
      ? 'Catalogue pending. Requirements await agency approval.\nIllustrative training. A human decides every action.'
      : "Illustrative training. Follow your employer's SOPs.\nObject guidance only. You decide every action.");
    for (const department of Object.keys(JOBS)) this.panel?.getElementById(`tab-${department}`)?.setProperties({ backgroundColor: this.department === department ? '#f7d58b' : '#28434c', color: this.department === department ? '#102a34' : '#ffffff' });
    if (JOBS[this.department]) {
      const module = card.moduleId ? trainingModuleById(card.moduleId) : undefined;
      const cert = module ? new TrainingProgress().certification(module, 'demo-trainee', defaultCrewForModule(module)) : undefined;
      this.text('job-reference', `DEMO / ${card.syntheticReference.split('-').slice(-1)[0]} / ${card.code.slice(0, 32)}`);
      this.text('job-title', card.title);
      this.updateHazards(card.hazards);
      this.text('job-cert', `Required: ${card.requiredCertifications.length ? card.requiredCertifications.map(code => certificationTitle(code).replace('Municipal PPE and scene safety', 'PPE').replace('Pipe repair field assessment', 'Pipe field assessment').replace('Traffic protection assessment', 'Traffic assessment').replace('Authorised electrical person', 'Authorised person')).join(' / ') : 'Department approval'}`);
      const currency = practiceCertificationDisplay(cert);
      this.text('job-expiry', `Training cert: ${currency.status} / Expiry: ${currency.expiry}`);
      const lesson = this.department === 'water' ? 'Water' : this.department === 'roads' ? 'Roads' : this.department === 'fire' ? 'Fire' : 'Electrical';
      this.text('open-module', ready ? `Start ${lesson} training` : card.availability === 'no-simulation' ? 'No simulation yet' : 'Coming next / locked');
      this.text('next-job', JOBS[this.department].length > 1 ? 'Next work order' : '1 Water work order');

    } else {
      const assist = this.department === 'assist';
      this.text('job-reference', 'CIVICOPS / NEXT EXPERIENCES');
      this.text('job-title', assist ? 'On-site assist (AR)' : this.department === 'metro' ? 'Metro Police / traffic' : 'Disaster Management');
      this.updateHazards([], assist ? ['Hazard scan', 'Scene brief', 'Work checks'] : this.department === 'metro' ? ['Crash scenes', 'Lane exposure', 'Unit ETAs'] : ['Flood response', 'Evacuation', 'Safe access']);
      this.text('job-cert', 'Objects and situations only. No identification.');
      this.text('job-expiry', 'On-device / No recording / Human decisions');
      this.text('open-module', assist ? 'Open on-site assist' : 'Coming next / locked'); this.text('next-job', 'Visible roadmap');
    }
    this.panel?.getElementById('open-module')?.setProperties({ backgroundColor: ready || this.department === 'assist' ? '#113f3d' : '#d5e3e0', color: ready || this.department === 'assist' ? '#ffffff' : '#102a34' });
    for (const entity of this.queries.board.entities) { entity.setValue(ModuleBoard, 'selected', this.code); entity.setValue(ModuleBoard, 'status', ready ? 'ready' : 'coming-next'); }
  }

  private beginPreparation(moduleId: string): void {
    activatePreparation(undefined); this.approvedModule = undefined;
    this.preparation = startPreparation(moduleId); this.preparationStarted = new Date().toISOString();
    this.showPreparation();
  }
  private showPreparation(): void {
    const state = this.preparation;
    this.panel?.getElementById('board-content')?.setProperties({ display: state ? 'none' : 'flex' });
    this.panel?.getElementById('programme-content')?.setProperties({ display: state ? 'flex' : 'none' });
    this.panel?.getElementById('panel-root')?.setProperties({ width: state ? 66 : 96, height: state ? 78 : 63 });
    const icons = this.world.getSceneObject<Object3D>('department-icons'); if (icons) icons.visible = !state;
    if (this.hazardStrip) this.hazardStrip.visible = !state;
    const host = window as unknown as { civicOpsPreparation?: { moduleId: string; index: number; phase: string; guidance: GuidanceMode } | null };
    if (!state) { host.civicOpsPreparation = null; return; }
    const programme = TRAINING_PROGRAMMES[state.moduleId], check = programme.checks[state.index];
    const view = preShiftView(state, this.guidance);
    host.civicOpsPreparation = { moduleId: state.moduleId, index: state.index, phase: state.phase, guidance: this.guidance };
    this.text('programme-title', programme.title);
    this.text('programme-context', programme.context);
    this.text('programme-progress', view.progress);
    this.text('programme-prompt', state.phase === 'stopped' ? 'Make safe. Review with your supervisor.' : state.phase === 'ready' ? 'Briefing, hazards and PPE checked.' : check.prompt);
    this.text('programme-choice-0', state.phase === 'stopped' ? 'Repeat pre-shift checks' : state.phase === 'ready' ? 'Enter the work site' : check.choices[0]);
    this.text('programme-choice-1', check?.choices[1] ?? '');
    this.panel?.getElementById('programme-choice-1')?.setProperties({ display: state.phase === 'checking' ? 'flex' : 'none' });
    this.text('programme-feedback', view.feedback);
    if (view.spoken) this.preShiftInstructor?.say(view.spoken);
  }
  private checkPreparation(choice: 0 | 1): void {
    if (!this.preparation || this.switching) return;
    this.preShiftInstructor?.unlock();
    if (this.preparation.phase === 'stopped') { this.beginPreparation(this.preparation.moduleId); return; }
    if (this.preparation.phase === 'ready') {
      const next = this.preparation.moduleId;
      activatePreparation(this.preparation); this.approvedModule = next; this.preparation = undefined;
      (window as unknown as { civicOpsPreparation?: unknown }).civicOpsPreparation = null;
      this.preShiftInstructor?.stop(); void this.switchTo(next); return;
    }
    this.preparation = answerPreparation(this.preparation, choice);
    if (this.preparation.phase === 'stopped') {
      const module = trainingModuleById(this.preparation.moduleId)!;
      new TrainingProgress().record(buildPreparationFailure(this.preparation, { startedAt: this.preparationStarted, completedAt: new Date().toISOString() }), module);
    }
    this.showPreparation();
  }

  private blackout(): Promise<void> { this.fade.visible = true; this.fadeTarget = 1; return new Promise(resolve => { this.faded = resolve; }); }
  async switchTo(next: string): Promise<void> {
    if (!['board', 'elec-loto', 'water-burst', 'roads-zone', 'scene-safety', 'field-assist'].includes(next) || this.switching || next === this.current) return;
    if (TRAINING_PROGRAMMES[next] && this.approvedModule !== next) {
      // Hands-on first: the six pre-shift knowledge checks are an opt-in option on the title screen.
      if (preShiftEnabled(browserStorage())) { this.beginPreparation(next); return; }
      this.preparation = undefined; this.approvedModule = next; activatePreparation(undefined);
      (window as unknown as { civicOpsPreparation?: unknown }).civicOpsPreparation = null;
    }
    if (next === 'board') { this.preparation = undefined; this.approvedModule = undefined; activatePreparation(undefined); }
    this.switching = true; this.publishModule();
    await this.blackout();
    this.unbind();
    if (this.electricalClass) { this.world.unregisterSystem(this.electricalClass); this.electricalClass = undefined; }
    if (this.batchingClass) { this.world.unregisterSystem(this.batchingClass); this.batchingClass = undefined; }
    if (this.roadsClass) { this.world.unregisterSystem(this.roadsClass); this.roadsClass = undefined; }
    if (this.waterClass) { this.world.unregisterSystem(this.waterClass); this.waterClass = undefined; }
    if (this.fireClass) { this.world.unregisterSystem(this.fireClass); this.fireClass = undefined; }
    if (this.roomClass) {this.world.unregisterSystem(this.roomClass);this.roomClass=undefined;}
    if (this.assistClass) { this.world.unregisterSystem(this.assistClass); this.assistClass = undefined; }
    const old = this.current;
    const level = next === 'board' ? 'board' : next === 'elec-loto' ? 'main' : next === 'roads-zone' ? 'roads' : next === 'field-assist' ? 'ar' : next === 'scene-safety' ? 'fire' : 'water';
    try {
      await this.world.loadLevel(`${import.meta.env.BASE_URL}scenes/${level}.iwsdk.scene.json`);
      this.retireAssets(old);
      this.current = next;
      if (next === 'elec-loto') {
        const [{ TrainingSystem: training }, { SceneStaticBatchingSystem: batching }] = await Promise.all([import('./training-system.js'), import('./scene-static-batching-system.js')]);
        this.batchingClass = batching; this.world.registerSystem(batching);
        this.electricalClass = training; this.world.registerSystem(training);
      } else if (next === 'water-burst') {
        const { WaterTrainingSystem: water } = await import('./water-training-system.js');
        this.waterClass = water; this.world.registerSystem(water);
      } else if (next === 'roads-zone') {
        const { RoadsTrainingSystem: roads } = await import('./roads-training-system.js');
        this.roadsClass = roads; this.world.registerSystem(roads);
      } else if (next === 'scene-safety') {
        const { SceneSafetyTrainingSystem: fire } = await import('./scene-safety-training-system.js');
        this.fireClass = fire; this.world.registerSystem(fire);
      } else if (next === 'field-assist') {
        const { FieldAssistSystem: assist } = await import('./field-assist-system.js');
        this.assistClass = assist; this.world.registerSystem(assist);
        const {RoomAssistSystem:room}=await import('./room-assist-system.js');this.roomClass=room;this.world.registerSystem(room);
      } else this.bindBoard();
      this.world.getSystem(StreetLifeSystem)?.refreshActors();
      (window as unknown as { civicOpsModuleError?: string }).civicOpsModuleError = '';
    } catch (error) {
      console.error('Department module could not load', error);
      (window as unknown as { civicOpsModuleError?: string }).civicOpsModuleError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (this.electricalClass) { this.world.unregisterSystem(this.electricalClass); this.electricalClass = undefined; }
      if (this.batchingClass) { this.world.unregisterSystem(this.batchingClass); this.batchingClass = undefined; }
      if (this.roadsClass) { this.world.unregisterSystem(this.roadsClass); this.roadsClass = undefined; }
      if (this.waterClass) { this.world.unregisterSystem(this.waterClass); this.waterClass = undefined; }
      if (this.fireClass) { this.world.unregisterSystem(this.fireClass); this.fireClass = undefined; }
    if (this.roomClass) {this.world.unregisterSystem(this.roomClass);this.roomClass=undefined;}
    if (this.assistClass) { this.world.unregisterSystem(this.assistClass); this.assistClass = undefined; }
      await this.world.loadLevel(`${import.meta.env.BASE_URL}scenes/board.iwsdk.scene.json`);
      this.retireAssets(old); if (next !== old) this.retireAssets(next); this.current = 'board'; this.approvedModule = undefined; activatePreparation(undefined); this.bindBoard();
      this.text('board-note', 'This lesson could not load. Select it to retry.');
    } finally { this.fadeTarget = 0; this.switching = false; this.publishModule(); }
  }

  private publishModule(): void {
    const host = window as unknown as { civicOpsModule?: string; civicOpsFade?: number; civicOpsGuidance?: GuidanceMode };
    host.civicOpsModule = this.current;
    host.civicOpsGuidance = this.guidance;
    host.civicOpsFade = this.fade.material.opacity;
    window.dispatchEvent(new CustomEvent('civicops:module', { detail: { module: this.current, switching: this.switching } }));
  }

  private retireAssets(moduleId: string): void {
    const protectedMaterials = new Set<Material>(), protectedTextures = new Set<Texture>();
    const collect = (key: string, visitor: (mesh: Mesh) => void) => CacheManager.getAsset<{scene:Object3D}>(CacheManager.resolveUrl(key))?.scene.traverse(object => { if (object instanceof Mesh) visitor(object); });
    for (const key of ['workshop-room', 'workbench']) collect(key, mesh => { for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { protectedMaterials.add(material); for (const value of Object.values(material)) if (value instanceof Texture) protectedTextures.add(value); } });
    const geometries = new Set<Mesh['geometry']>(), materials = new Set<Material>(), textures = new Set<Texture>();
    for (const key of MODULE_MODEL_IDS[moduleId] ?? []) {
      collect(key, mesh => { geometries.add(mesh.geometry); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { if (!protectedMaterials.has(material)) materials.add(material); for (const value of Object.values(material)) if (value instanceof Texture && !protectedTextures.has(value)) textures.add(value); } });
      CacheManager.deleteAsset(key);
    }
    retireModelResources([{ geometries, materials, textures }], { materials: protectedMaterials, textures: protectedTextures });
  }

  update(delta: number): void {
    this.dwell.tick(this.a11y.dwellSelect && !this.switching && !!this.panel, this.player.head, performance.now());
    if (this.hazardLayoutPending && this.hazardStrip && this.panel) {
      this.panel.getElementById('hazard-mark-1')?.getWorldPosition(this.hazardPoint);
      this.panel.worldToLocal(this.hazardPoint); this.hazardStrip.position.copy(this.hazardPoint);
      this.hazardLayoutPending = false;
    }
    if (!this.fade.visible) return;
    const amount = Math.min(1, delta / .22);
    const opacity = this.fade.material.opacity;
    this.fade.material.opacity = this.fadeTarget > opacity ? Math.min(this.fadeTarget, opacity + amount) : Math.max(this.fadeTarget, opacity - amount);
    if (this.fade.material.opacity === 1 && this.faded) { const done = this.faded; this.faded = undefined; done(); }
    if (this.fade.material.opacity === 0) this.fade.visible = false;
    (window as unknown as { civicOpsFade?: number }).civicOpsFade = this.fade.material.opacity;
  }
}

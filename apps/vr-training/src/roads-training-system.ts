import { attemptAccessibility, attemptDevice } from './training/attempt-context.js';
import { browserStorage } from './training/browser-storage.js';
import { ROADS_CREW_STANDBY, ROADS_CREW_WALK_SECONDS, ROADS_STAGING } from './training/roads-staging.js';
import {roadsPropHeight} from './training/roads-surfaces.js';
import {RoadsMarshal} from './scene-assets/roads-marshal.js';
import {roadsAssessmentModule} from './training/modules/roads-zone.js';
import type {TaxiFleet} from './scene-assets/taxi-fleet.js';
import {StreetLifeSystem} from './street-life-system.js';
import { RoadsRain } from './scene-assets/roads-rain.js';
import { HazardTape } from './scene-assets/hazard-tape.js';
import { roadsWeather } from './training/roads-weather.js';
import { RAIN_STEPS, samplePotholeIncident, incidentRoadHeight, validTapeSpan, type RainEvent, type IncidentPose } from './training/roads-incident.js';
import { prepareProcedure } from './training/programme-state.js';
import {
  AssetManager, BufferGeometry, Color, createSystem, Entity, Float32BufferAttribute, Grabbed, GrabSystem,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, OneHandGrabbable, TorusGeometry, Quaternion, RingGeometry,
  UIKit, UIKitMLAsset, Vector3, Visibility, VisibilityState,
} from '@iwsdk/core';
import { applyModuleAccessibility } from './module-accessibility.js';
import { SeatedPanelRig } from './seated-panel-rig.js';
import { ModuleDwell } from './module-dwell.js';
import { loadSettings, saveSettings, type AccessibilitySettings } from './training/accessibility-settings.js';
import { RoadsSession, RoadsTarget, RoadsTape } from './roads-components.js';
import { TrainingSession } from './training-components.js';
import { registerPokeableVisualTarget } from './hand-visual-system.js';
import { PointerPressLatch } from './training/pointer-press.js';
import { CivicAudio } from './training/civic-audio.js';
import { ScriptedInstructor } from './training/instructor.js';
import { createInstructor, LiveMetaInstructor, liveLlmOptions } from './training/meta-instructor.js';
import { loadGuidance, UNGUIDED_BRIEF } from './training/guidance.js';
import { roadsGuidedFeedback, roadsIncidentCaption, roadsOpening } from './training/roads-guidance.js';
import { assessmentStepTitle, automaticCoaching, incidentStepTitle, roadsZoneStatus } from './training/assessment-cues.js';
import { guidanceCaption } from './training/caption-guidance.js';
import { TrainingProgress } from './training/progress.js';
import { DailyDrillProgress, comeBackSummary } from './training/daily-drill.js';
import { buildAttempt, score } from './training/scoring.js';
import { presentModuleResults } from './training/module-results.js';
import { placeReviewPanel } from './training/review-panel.js';
import { roadsZoneModule, createRoadsScenario, createRoadsDailyDrill, roadsStepLines, type RoadsStepId } from './training/modules/roads-zone.js';
import { startRoads, currentRoadsStep, performRoads, hintRoads, type RoadsState, type RoadsEvent } from './training/roads-procedure.js';
import { checkRoadsLayout, type RoadsPlacement, type RoadsPartKind, roadsRequirements } from './training/roads-geometry.js';
import { sampleRoadTraffic, trafficRoute, upstreamRoadsFlagger, type TrafficPose, type TrafficRoute } from './training/roads-traffic.js';
import { decodeSurfaceAttribute } from './training/static-batching.js';
import { formatTrainingCaption } from './training/spatial-caption.js';
import { buildRoadsRulerSurface, roadFeedbackMarker, roadTrafficCaption } from './training/roads-feedback.js';
import { trackGeneratedInstances } from './training/generated-instances.js';

interface Home { position: Vector3; quaternion: Quaternion; }
const TITLES:Readonly<Record<string,string>>={
  'park-vehicle':'Park upstream', 'advance-warning':'Advance warning', 'cone-taper':'Build the taper',
  'keep-left':'Guide the merge', 'protect-work-area':'Protect the work', 'position-flaggers':'Protect the marshals', 'test-traffic':'Check, then run',
};
const ROADS_INSTRUCTIONS=Object.values(roadsStepLines).map(line=>line.instruction);
const COPY:Readonly<Record<string,string>>={
  'park-vehicle':'Brief the parked driver.\nCheck escape and mirrors.\nTurn the beacon on.',
  'advance-warning':'Pinch the warning sign.\nLeave room to slow down.',
  'cone-taper':'Place six cones in a long taper.\nEven spacing guides the merge.',
  'keep-left':'Place the arrow at taper start.\nTwist it to face arriving traffic.',
  'protect-work-area':'Grip clear of joined corners.\nEnclose all sides. Keep the footpath open.',
  'position-flaggers':'Brief the crew to take both refuges.\nSTOP stays displayed.\nCheck sight lines before traffic.',
  'test-traffic':'Zone check, then Run traffic.\nWatch the approach and merge.',
};

/** Hands bind free-plane placement to the shared outcomes, instructor and results. */
export class RoadsTrainingSystem extends createSystem({
  tapeHeld:{required:[RoadsTape,Grabbed]}, targets:{required:[RoadsTarget]}, held:{required:[RoadsTarget,Grabbed]},
}) {
  private state!:RoadsState;
  private rain?:RoadsRain;
  private weather=roadsWeather(location.search);
  private tape?:HazardTape;
  private reel?:Entity;
  private tapeDrawing=false;
  private tapeTied=false;
  private incidentSeconds=0;
  private crewSeconds=0;
  private fleet?:TaxiFleet;
  private readonly incidentPose:IncidentPose={x:0,z:0,yaw:0,roll:0,hazards:false,stage:'approach'};
  private incidentStage='approach';
  private readonly fleetViewer=new Vector3();
  private session!:Entity;
  private readonly panels=new Map<string,UIKitMLAsset>();
  private readonly homes=new Map<number,Home>();
  private readonly coneEntities:Entity[]=[];
  private readonly delineatorEntities:Entity[]=[];
  private readonly barrierEntities:Entity[]=[];
  private readonly generated:Entity[]=[];
  private readonly disposedResources:{dispose():void}[]=[];
  private readonly point=new Vector3();
  private readonly forward=new Vector3();
  private readonly up=new Vector3(0,1,0);
  private readonly matrix=new Matrix4();
  private readonly inverse=new Matrix4();
  private readonly q=new Quaternion();
  private readonly marker=new Object3D();
  private readonly feedbackColor=new Color();
  private readonly traffic:Object3D[]=[];
  private readonly trafficPoses:TrafficPose[]=[];
  private readonly audio=new CivicAudio();
  private readonly progress=new TrainingProgress();
  private readonly daily=new DailyDrillProgress();
  private instructor!:ScriptedInstructor;
  private cones?:InstancedMesh;
  private delineators?:InstancedMesh;
  private barriers?:InstancedMesh;
  private markers!:InstancedMesh;
  private ruler!:Mesh;
  private beacon?:Object3D;
  private bend?:Object3D;
  private readonly flaggerFaces:{id:string;actor:RoadsMarshal;target:Object3D}[]=[];
  private upstreamFlaggerIndex=-1;
  private route!:TrafficRoute;
  private startedAt='';
  private startedMs=0;
  private runSeconds=0;
  private animationRunning=false;
  private dailyMode=false;
  private resetting=false;
  private saved=false;
  private disposed=false;
  private reaction='waiting';
  private nudgedCone?:Entity;
  private contactCone?:Entity;

  private seatedRig!: SeatedPanelRig;
  private readonly dwell = new ModuleDwell();
  private a11y: AccessibilitySettings = loadSettings(browserStorage(), globalThis.location?.search ?? '');
  init():void {
    const seed=Number(new URLSearchParams(location.search).get('seed')??0);
    const scenario=createRoadsScenario(seed);scenario.variations.push('rain-incident');scenario.id+='-rain';
    this.state=prepareProcedure(startRoads(scenario));
    this.session=this.world.requireSceneEntity('roads-session');
    for(const name of ['steps','controls','results']) this.panels.set(name,this.world.requireSceneObject<UIKitMLAsset>(`roads-${name}-panel`));
    this.seatedRig=new SeatedPanelRig({steps:[this.panels.get('steps')!],controls:[this.panels.get('controls')!]});
    applyModuleAccessibility(this.a11y, { panels: this.panels, captionPanel: 'steps', captionFontSize: 2.7, captionHeight: 12.8, panelHeight: 52, steps: this.world.getSceneEntity('roads-steps-panel')?.object3D, controls: this.world.getSceneEntity('roads-controls-panel')?.object3D });
    this.instructor=createInstructor(()=>{}, {volume:.7, llm: liveLlmOptions(), guidance: loadGuidance(browserStorage(), globalThis.location?.search ?? '')});
    this.state=roadsOpening(this.state,this.instructor.guidance);
    for(const entity of this.queries.targets.entities) {
      const object=entity.object3D!;
      this.homes.set(entity.index,{position:object.position.clone(),quaternion:object.quaternion.clone()});
      if(entity.getValue(RoadsTarget,'kind')==='cone') this.coneEntities.push(entity);
      if(entity.getValue(RoadsTarget,'kind')==='delineator') this.delineatorEntities.push(entity);
      if(entity.getValue(RoadsTarget,'kind')==='barrier') this.barrierEntities.push(entity);
      if(entity.getValue(RoadsTarget,'kind')==='flagger') {
        const source=AssetManager.getGLTF('roads-marshal',{shared:true});
        if(!source)throw new Error('The licensed marshal rig is not ready');
        this.flaggerFaces.push({target:object,id:entity.getValue(RoadsTarget,'partId')??'',actor:new RoadsMarshal(object,source.scene,[...source.animations,...(AssetManager.getGLTF('street-actors',{shared:true})?.animations.filter(c=>c.name==='Walk')??[])])});
      }
    }
    this.bend=this.world.requireSceneObject('roads-street').getObjectByName('BendOccluder');
    if(this.bend)this.bend.visible=this.state.scenario.variations.includes('blind-bend');
    this.beacon=this.world.requireSceneObject('roads-bakkie').getObjectByName('Beacon');
    this.cones=this.buildMarkerInstances(this.coneEntities,'TrafficCones');
    this.delineators=this.buildMarkerInstances(this.delineatorEntities,'TrafficDelineators');
    this.barriers=this.buildMarkerInstances(this.barrierEntities,'WorkBarriers');
    this.buildGuidance();
    for(let i=1;i<=3;i++) {
      const car=this.world.requireSceneObject(`roads-traffic-${i}`);this.traffic.push(car);
      this.trafficPoses.push({x:0,z:0,yaw:0,reaction:'cruise'});
    }
    this.route=trafficRoute(this.state.layout,false);
    this.rain=new RoadsRain(this.session.object3D!,this.weather,this.a11y.reducedMotion);
    this.buildIncident();this.bindControls();
    this.cleanupFuncs.push(
      this.queries.tapeHeld.subscribe('qualify',entity=>{
        if(this.state.rainPhase!=='tape'){this.world.getSystem(GrabSystem)?.forceRelease(entity);return;}
        this.tapeDrawing=true;this.tape!.mesh.visible=true;this.tape!.physics.setEnds(8,1.05,3.65,8.1,1.05,3.65,true);
      }),
      this.queries.tapeHeld.subscribe('disqualify',()=>this.tieTape()),
      this.queries.held.subscribe('qualify',entity=>{
        this.unlockAudio();
        if(this.state.completed){this.world.getSystem(GrabSystem)?.forceRelease(entity);return;}
        this.act({type:'remove',kind:(entity.getValue(RoadsTarget,'kind')??'cone') as RoadsPartKind,id:entity.getValue(RoadsTarget,'partId')??''});
        this.markers.visible=false;
      }),
      this.queries.held.subscribe('disqualify',entity=>this.release(entity)),
      this.world.visibilityState.subscribe(visibility=>{
        if(visibility===VisibilityState.Visible)this.unlockAudio();
        else this.audio.setRoadAmbience(false,false);
      }),()=>this.teardown(),
    );
    this.startedAt=new Date().toISOString();this.startedMs=performance.now();
    this.setVisible('results',false);this.unlockAudio();this.refresh();
    this.instructor.sayInstruction(RAIN_STEPS[this.state.rainPhase??'traffic'].instruction);
    if (this.instructor.guidance === 'unguided') this.instructor.say(UNGUIDED_BRIEF);
  }

  private buildIncident():void {
    this.fleet=this.world.getSystem(StreetLifeSystem)?.assessmentFleet();
    if(!this.fleet)throw new Error('The licensed Roads traffic fleet is not ready');
    this.tape=new HazardTape();this.generated.push(this.world.createTransformEntity(this.tape.mesh,this.session));
    const reelGeometry=new TorusGeometry(.065,.026,6,12),material=new MeshBasicMaterial({color:'#e9bc32'}),mesh=new Mesh(reelGeometry,material);mesh.name='PinchTapeReel';mesh.position.set(8,1.05,3.65);
    this.reel=this.world.createTransformEntity(mesh,this.session);this.reel.addComponent(RoadsTape).addComponent(OneHandGrabbable);this.generated.push(this.reel);this.disposedResources.push(reelGeometry,material);
  }
  private tieTape():void {
    if(!this.tapeDrawing||!this.reel?.object3D)return;this.tapeDrawing=false;
    const reel=this.reel.object3D;reel.getWorldPosition(this.point);this.session.object3D!.worldToLocal(this.point);
    const anchored=this.state.layout.barriers.some(b=>Math.hypot(b.x-this.point.x,b.z-this.point.z)<.4);
    if(this.state.rainPhase==='tape'&&this.state.zoneChecked&&anchored&&validTapeSpan(8,3.65,this.point.x,this.point.z)&&Math.abs(this.point.y-1.05)<.4){
      this.tapeTied=true;this.tape!.physics.setEnds(8,1.05,3.65,this.point.x,1.05,this.point.z,true);reel.visible=false;this.act('incident:tape');
    }else{this.tape!.mesh.visible=false;this.text('steps','caption',formatTrainingCaption('Tie to a protected-side barrier, 0.8-4 m from the reel. Keep the footpath clear.'));}
    this.session.object3D!.attach(reel);reel.position.set(8,1.05,3.65);
  }
  private updateIncident(delta:number):void {
    this.incidentSeconds+=Math.min(delta,.1);
    samplePotholeIncident(this.a11y.reducedMotion?14:this.incidentSeconds,this.incidentPose);
    const p=this.incidentPose;
    const distance=Math.hypot(p.x-this.fleetViewer.x,p.z-this.fleetViewer.z);
    this.fleet?.set(2,p.x,incidentRoadHeight(p.z),p.z,p.yaw,distance,true,p.hazards,p.hazards&&(this.a11y.reducedMotion||Math.sin(this.incidentSeconds*5)>.2),this.a11y.reducedMotion,p.roll);
    if(p.stage!==this.incidentStage){this.incidentStage=p.stage;this.session.setValue(RoadsSession,'incidentStage',p.stage);if(p.stage==='strike'){this.audio.play('cone-thunk');this.audio.play('warning-buzz');if(!this.state.completed)this.instructor.say('Control, Roads 3. Taxi tyre strike. Stay in refuge. Protect the approach before assisting.');}}
    if(this.tapeDrawing&&this.reel?.object3D){this.reel.object3D.getWorldPosition(this.point);this.session.object3D!.worldToLocal(this.point);this.tape!.physics.setEnds(8,1.05,3.65,this.point.x,this.point.y,this.point.z);}
    if(this.tapeDrawing||this.tapeTied)this.tape?.update(this.a11y.reducedMotion?0:delta,Math.sin(this.incidentSeconds*2)*.65);
  }

  private buildMarkerInstances(entities:readonly Entity[],name:string):InstancedMesh|undefined {
    const first=entities[0]?.object3D;if(!first)return undefined;
    first.updateMatrixWorld(true);const inverse=first.matrixWorld.clone().invert();
    const arrays={position:[] as number[],normal:[] as number[],uv:[] as number[]};
    let source:Mesh['material']|undefined;
    first.traverse(child=>{
      if(!(child instanceof Mesh))return;source??=child.material;
      const expanded=child.geometry.index?child.geometry.toNonIndexed():child.geometry;
      const decoded=new BufferGeometry();
      for(const name of ['position','normal','uv'] as const) {
        const attribute=expanded.getAttribute(name);decoded.setAttribute(name,new Float32BufferAttribute(decodeSurfaceAttribute(attribute),attribute.itemSize));
      }
      decoded.applyMatrix4(this.matrix.multiplyMatrices(inverse,child.matrixWorld));
      for(const name of ['position','normal','uv'] as const)for(const value of decoded.getAttribute(name).array)arrays[name].push(value);
      decoded.dispose();if(expanded!==child.geometry)expanded.dispose();
    });
    if(!source||Array.isArray(source))throw Error(`Roads ${name} requires one shared material.`);
    const geometry=new BufferGeometry();
    for(const name of ['position','normal','uv'] as const)geometry.setAttribute(name,new Float32BufferAttribute(arrays[name],name==='uv'?2:3));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const instances=new InstancedMesh(geometry,source,entities.length);instances.frustumCulled=false;
    instances.name=name;this.generated.push(this.world.createTransformEntity(instances,this.session));
    trackGeneratedInstances(instances,this.disposedResources);
    for(const entity of entities)entity.object3D!.traverse(child=>{
      if(!(child instanceof Mesh)||Array.isArray(child.material))return;
      const hidden=child.material.clone();hidden.visible=false;child.material=hidden;this.disposedResources.push(hidden);
    });
    return instances;
  }

  private updateMarkerInstances(instances:InstancedMesh|undefined,entities:readonly Entity[]):void {
    if(!instances)return;
    for(let i=0;i<entities.length;i++) {
      const object=entities[i].object3D!;object.updateMatrixWorld(true);
      this.matrix.multiplyMatrices(this.inverse,object.matrixWorld);instances.setMatrixAt(i,this.matrix);
    }
    instances.instanceMatrix.needsUpdate=true;
  }

  private buildGuidance():void {
    const geometry=new RingGeometry(.009,.014,16);
    geometry.rotateX(-Math.PI/2);
    const material=new MeshBasicMaterial({color:'#ffffff',depthWrite:false,toneMapped:false});
    this.markers=new InstancedMesh(geometry,material,7);this.markers.visible=false;this.markers.frustumCulled=false;
    this.generated.push(this.world.createTransformEntity(this.markers,this.session));trackGeneratedInstances(this.markers,this.disposedResources,true);
    // A translucent measuring ribbon appears only after a mistaken taper check.
    const rulerGeometry=new BufferGeometry();
    rulerGeometry.setAttribute('position',new Float32BufferAttribute(buildRoadsRulerSurface(),3));
    const rulerMaterial=new MeshBasicMaterial({color:'#b1ffdf',transparent:true,opacity:.9,depthWrite:false,toneMapped:false});
    this.ruler=new Mesh(rulerGeometry,rulerMaterial);this.ruler.visible=false;
    this.generated.push(this.world.createTransformEntity(this.ruler,this.session));this.disposedResources.push(rulerGeometry,rulerMaterial);
  }

  private unlockAudio():void {
    if(this.world.visibilityState.peek()!==VisibilityState.Visible)return;
    this.audio.unlock();this.audio.startRoadAmbience();this.audio.startRainAmbience(this.weather);this.audio.setRoadAmbience(true,this.state.layout.beaconOn);this.instructor.unlock();
  }
  private text(panel:string,id:string,text:string):void {this.panels.get(panel)?.getElementById<UIKit.Text>(id)?.setProperties({text});}
  private show(panel:string,id:string,visible:boolean):void {this.panels.get(panel)?.getElementById(id)?.setProperties({display:visible?'flex':'none'});}
  private setVisible(panel:string,visible:boolean):void {this.world.getSceneEntity(`roads-${panel}-panel`)?.setValue(Visibility,'isVisible',visible);}
  private bind(panel:string,id:string,callback:()=>void):void {
    const element=this.panels.get(panel)?.getElementById(id);if(!element)return;
    element.name=id;const latch=new PointerPressLatch();
    this.cleanupFuncs.push(this.dwell.register(id,element,this.panels.get(panel)!,()=>{this.unlockAudio();callback();}));
    const down={transformTranslateZ:-.35},up={transformTranslateZ:0};
    const cancel=(event:{pointerId:number})=>{latch.cancel(event.pointerId);element.setProperties(up);};
    element.setProperties({onPointerDown:(event:{pointerId:number})=>{latch.press(event.pointerId,element);element.setProperties(down);this.unlockAudio();},
      onPointerUp:(event:{pointerId:number})=>{if(!latch.release(event.pointerId))return;element.setProperties(up);if(this.world.visibilityState.peek()===VisibilityState.Visible)callback();},
      onPointerCancel:cancel,onPointerLeave:cancel});
    this.cleanupFuncs.push(registerPokeableVisualTarget(element),()=>{latch.reset();element.setProperties({onPointerDown:undefined,onPointerUp:undefined,onPointerLeave:undefined,onPointerCancel:undefined});});
  }
  private bindControls():void {
    this.bind('steps','back-to-jobs',()=>window.dispatchEvent(new Event('civicops:jobs')));
    this.bind('steps','explain-why',()=>{
      const stepId=(currentRoadsStep(this.state)?.id??'park-vehicle') as RoadsStepId;
      if(this.instructor instanceof LiveMetaInstructor){
        void this.instructor.ask(`Why is ${stepId.replace(/-/g,' ')} required?`,{stepId,programme:'roads-zone'}).then((line)=>{this.text('steps','caption',formatTrainingCaption(line));});
        return;
      }
      const why=roadsStepLines[stepId]?.why;if(why){this.instructor.say(why);this.text('steps','caption',formatTrainingCaption(why));}
    });
    this.bind('controls','incident-action',()=>{const phase=this.state.rainPhase;if(phase&&phase!=='traffic'&&phase!=='tape'&&phase!=='ready')this.act(`incident:${phase}` as RainEvent);});
    this.bind('controls','incident-unsafe',()=>this.act('incident:enter-lane'));
    this.bind('controls','weather-toggle',()=>{this.weather=this.weather==='clear'?'drizzle':this.weather==='drizzle'?'storm':'clear';this.rain?.dispose();this.rain=new RoadsRain(this.session.object3D!,this.weather,this.a11y.reducedMotion);this.audio.changeRainWeather(this.weather);this.text('controls','weather-toggle',this.weather.toUpperCase());window.dispatchEvent(new CustomEvent('civicops:weather',{detail:this.weather}));});
    this.text('controls','weather-toggle',this.weather.toUpperCase());
    this.bind('controls','beacon-toggle',()=>this.act({type:'beacon',on:!this.state.layout.beaconOn}));
    this.bind('controls','zone-check',()=>this.act('zone-check'));
    this.bind('controls','run-traffic',()=>this.runTraffic());
    this.bind('controls','work-start',()=>{
      const step=currentRoadsStep(this.state)?.id;
      this.act(step==='park-vehicle'?'brief-driver':step==='position-flaggers'?'brief-marshals':'begin-work');
    });
    this.bind('controls','traffic-finish',()=>{if(this.runSeconds>=5)this.finish();});
    this.bind('controls','hint',()=>{this.state=hintRoads(this.state,Math.round(performance.now()-this.startedMs));if(this.state.rainPhase&&this.state.rainPhase!=='traffic'&&this.state.rainPhase!=='ready')this.state={...this.state,feedback:RAIN_STEPS[this.state.rainPhase].instruction};this.refresh();this.instructor.say(this.state.feedback);this.text('steps','caption',formatTrainingCaption(this.state.feedback));});
    this.bind('controls','reset',()=>this.reset(false));
    this.bind('results','try-again',()=>this.reset(false));
    this.bind('results','daily-drill',()=>this.reset(true));
    this.bind('results','back-to-jobs',()=>window.dispatchEvent(new Event('civicops:jobs')));
  }
  private cacheUpstreamFlagger():void {
    const upstream=upstreamRoadsFlagger(this.state.layout.flaggers);
    this.upstreamFlaggerIndex=this.flaggerFaces.findIndex(faces=>faces.id===upstream?.id);
  }
  private act(event:RoadsEvent):void {
    if(this.disposed||this.resetting||this.state.completed)return;
    const previous=this.state;this.state=roadsGuidedFeedback(previous,performRoads(previous,event,Math.round(performance.now()-this.startedMs)),this.instructor.guidance);
    if(this.state===previous)return;
    if(previous.rainPhase!=='traffic'&&this.state.rainPhase==='traffic'){this.tapeTied=false;if(this.tape)this.tape.mesh.visible=false;if(this.reel?.object3D)this.reel.object3D.visible=true;}
    this.cacheUpstreamFlagger();
    this.refresh();
    const type=typeof event==='string'?event:event.type;
    if(type==='zone-check')this.displayCheck();
    this.audio.setRoadAmbience(true,this.state.layout.beaconOn);
    this.session.setValue(RoadsSession,'lastFeedback',this.state.feedback);
    if(type!=='place') {
      this.instructor.say(this.state.feedback);
      // Zone check already chose a concise clear/fault caption. Keep that visible
      // while the instructor speaks the complete reducer feedback.
      if(type!=='zone-check')this.text('steps','caption',formatTrainingCaption(this.state.feedback));
    }
    if(this.state.failed){this.audio.play('warning-buzz');if(type!=='run-traffic')this.finish();}
  }
  private release(entity:Entity):void {
    if(this.disposed||this.resetting||this.state.completed||!entity.object3D)return;
    const object=entity.object3D;object.getWorldPosition(this.point);this.session.object3D!.worldToLocal(this.point);
    const id=entity.getValue(RoadsTarget,'partId')??'';const kind=entity.getValue(RoadsTarget,'kind');
    if(Math.abs(this.point.x)>40||this.point.z<-8||this.point.z>8){
      this.act({type:'remove',kind:kind as RoadsPartKind,id});this.session.object3D!.attach(object);const home=this.homes.get(entity.index);if(home){object.position.copy(home.position);object.quaternion.copy(home.quaternion);}return;
    }
    object.getWorldQuaternion(this.q);
    this.forward.set(0,0,1).applyQuaternion(this.q);
    const placement:RoadsPlacement={id,x:this.point.x,z:this.point.z,yaw:Math.atan2(this.forward.x,this.forward.z)};
    this.session.object3D!.attach(object);object.position.set(placement.x,roadsPropHeight(placement.x,placement.z),placement.z);object.rotation.set(0,placement.yaw,0);
    this.act({type:'place',kind:kind as RoadsPartKind,placement});
    object.getWorldPosition(this.point);this.audio.play('cone-thunk',this.point);
    this.markers.visible=false;
  }

  private displayCheck():void {
    const check=this.state.zoneCheck;if(!check)return;
    const anchors=[[-10,4.65],[-5.6,4.65],[-1.6,1.35],[-4.5,4.65],[13,1.65],[22,4.65],[1.5,-1.0]];
    this.markers.count=7;
    for(let i=0;i<7;i++) {
      const definition=roadsZoneModule.steps[i],issue=check.issues.find(item=>item.stepId===definition.id);
      this.marker.position.set(...roadFeedbackMarker(issue?.x??anchors[i][0],issue?.z??anchors[i][1]));this.marker.updateMatrix();this.markers.setMatrixAt(i,this.marker.matrix);
      this.markers.setColorAt(i,this.feedbackColor.set(check.checks[definition.id as keyof typeof check.checks]?'#79f1c5':'#ff6456'));
    }
    this.markers.instanceMatrix.needsUpdate=true;if(this.markers.instanceColor)this.markers.instanceColor.needsUpdate=true;
    this.markers.visible=true;this.ruler.visible=this.state.ghostRulerVisible&&check.issues.some(issue=>issue.stepId==='cone-taper');
    if(this.ruler.visible){
      const minimum=roadsRequirements(this.state.scenario).minimumTaperLength;
      const start=this.state.layout.cones.reduce((left,cone)=>Math.min(left,cone.x),0);
      this.ruler.scale.x=minimum/6;this.ruler.position.x=start+minimum/2;
    }
    this.text('controls','zone-status',check.valid?'CLEAR / 7 geometry checks':'REPAIR / '+check.issues.length+' checks');
    this.text('steps','caption',formatTrainingCaption(check.valid?'Zone geometry clear.\nRun traffic to test the layout.':check.issues[0].message));
    this.audio.play(check.valid?'success-chime':'warning-buzz');
  }
  private runTraffic():void {
    this.act('run-traffic');if(!this.state.trafficRunning)return;
    this.cacheUpstreamFlagger();
    this.route=trafficRoute(this.state.layout,this.state.zoneCheck?.valid??false,this.state.trafficFault);
    this.contactCone=this.route.coneId?this.coneEntities.find(entity=>entity.getValue(RoadsTarget,'partId')===this.route.coneId):undefined;
    this.animationRunning=true;this.runSeconds=7;this.nudgedCone=undefined;
    this.refresh();this.displayCheck();
    if(this.state.failed)this.instructor.say(this.state.trafficFault?.message??'Stop. Repair the traffic-control zone.');else this.instructor.sayInstruction('Watch traffic slow, stop at the marshal, then merge left.');
  }
  private refresh():void {
    const step=currentRoadsStep(this.state)?.id??'test-traffic';
    const order=roadsZoneModule.steps.find(definition=>definition.id===step)?.order??roadsZoneModule.steps.length;
    this.text('steps','current-step',assessmentStepTitle(this.instructor.guidance,TITLES[step],order,roadsZoneModule.steps.length));this.text('steps','caption',formatTrainingCaption(guidanceCaption(this.instructor.guidance,COPY[step],this.state.feedback,ROADS_INSTRUCTIONS)));
    if(step==='advance-warning'&&automaticCoaching(this.instructor.guidance)){
      const requirements=roadsRequirements(this.state.scenario);
      this.text('steps','caption',formatTrainingCaption(`${requirements.speedKph} km/h: ${Math.round(-requirements.warningRange[1]*10)/10}-${Math.round(-requirements.warningRange[0]*10)/10} m upstream\nDemo spacing only\nUse the approved road plan.`));
    }
    this.text('controls','speed-limit',this.state.scenario.variations.includes('speed-80')?'80 km/h':'60 km/h');
    this.text('controls','beacon-status',this.state.layout.beaconOn?'ON':'OFF');
    this.text('controls','beacon-toggle',this.state.layout.beaconOn?'Beacon: on':'Beacon: off');
    this.text('controls','action-title',this.animationRunning?'TRAFFIC':'ROAD ZONE');
    this.text('controls','work-start',step==='park-vehicle'?'Driver brief':step==='position-flaggers'?(this.state.crewDispatch==='walking'?'Crew moving':'Brief crew'):'Request work');
    this.session.setValue(RoadsSession,'crewDispatch',this.state.crewDispatch);
    this.text('controls','zone-status',this.animationRunning?(this.state.failed?'STOP / Unsafe approach':'DEMO / Observe traffic flow'):this.state.zoneChecked?'CLEAR / Ready to run':roadsZoneStatus(this.instructor.guidance,this.state.scenario.variations.includes('blind-bend')?'BEND / Warn earlier':'Place freely. Check your zone.'));
    this.show('controls','traffic-actions',this.animationRunning);
    this.panels.get('controls')?.getElementById('panel-root')?.setProperties({height:this.animationRunning?59:52});
    this.show('controls','traffic-finish',this.animationRunning);this.show('controls','work-start',!this.animationRunning);
    this.show('controls','stop-go-toggle',false);
    this.show('controls','action-copy',false);
    let count=0;
    for(const definition of roadsZoneModule.steps) {
      const correct=this.state.steps.some(result=>result.stepId===definition.id&&result.outcome==='correct');if(correct)count++;
      this.text('steps',`step-${definition.order}`,correct?'+':String(definition.order));
      this.panels.get('steps')?.getElementById(`step-${definition.order}`)?.setProperties({backgroundColor:correct?'#103d50':definition.id===step?'#f5d78c':'#e3ebe5',color:correct?'#ffffff':'#103d50'});
    }
    this.text('steps','step-progress',`${count} / 7 complete`);
    const phase=this.state.rainPhase,incident=phase&&phase!=='traffic'&&phase!=='ready';
    this.show('controls','incident-actions',!!incident);this.show('controls','incident-unsafe',phase==='refuge'||phase==='radio');
    if(phase){this.session.setValue(RoadsSession,'incidentStep',phase);if(incident){this.text('steps','current-step',incidentStepTitle(this.instructor.guidance,RAIN_STEPS[phase].title,phase));this.text('steps','caption',formatTrainingCaption(roadsIncidentCaption(this.state,this.instructor.guidance)));this.text('controls','incident-action',RAIN_STEPS[phase].action);this.show('controls','incident-action',phase!=='tape');this.panels.get('controls')?.getElementById('panel-root')?.setProperties({height:59});}}

    this.session.setValue(RoadsSession,'step',step);this.session.setValue(RoadsSession,'complete',this.state.completed);
    this.session.setValue(RoadsSession,'failed',this.state.failed);this.session.setValue(RoadsSession,'score',score(this.state));
    this.session.setValue(RoadsSession,'speedLimit',this.state.scenario.variations.includes('speed-80')?80:60);
    this.session.setValue(RoadsSession,'placed',this.state.layout.cones.length+this.state.layout.delineators.length+this.state.layout.barriers.length+this.state.layout.flaggers.length+(this.state.layout.vehicle?1:0)+(this.state.layout.warning?1:0)+(this.state.layout.keepLeft?1:0));
    this.session.setValue(RoadsSession,'zoneGood',this.state.zoneCheck?.valid??false);this.session.setValue(RoadsSession,'running',this.animationRunning);
    this.session.setValue(TrainingSession,'step',step);this.session.setValue(TrainingSession,'complete',this.state.completed);
    this.session.setValue(TrainingSession,'failed',this.state.failed);this.session.setValue(TrainingSession,'score',score(this.state));
  }
  private finish():void {
    if(this.saved||!this.state.completed)return;this.saved=true;
    for(const entity of this.queries.targets.entities)this.world.getSystem(GrabSystem)?.forceRelease(entity);
    const assessment=roadsAssessmentModule(this.state.scenario);
    const attempt=buildAttempt(this.state,{startedAt:this.startedAt,completedAt:new Date().toISOString(),crewId:'roads-01',accessibility:attemptAccessibility(this.a11y),device:attemptDevice(this.world.renderer.xr.isPresenting)},roadsZoneModule);
    const certification=this.progress.record(attempt,assessment);if(this.dailyMode)this.daily.recordDailyPass(attempt);
    presentModuleResults(this.panels.get('results')!,{attempt,module:assessment,certification,
      comeback:comeBackSummary(this.progress.getAttempts(),new Date(),{moduleId:roadsZoneModule.id,crewId:'roads-01',passMark:80}),
      daily:this.daily.moduleDailyStatus(roadsZoneModule),departmentLabel:'ROADS',completeEyebrow:'CIVICOPS / ROAD ZONE COMPLETE',feedback:formatTrainingCaption(this.state.feedback)});
    placeReviewPanel(this.panels.get('results')!,this.player.head,this.panels.get('results')?.getElementById('result-body'));
    this.setVisible('steps',false);this.setVisible('controls',false);this.setVisible('results',true);
    this.world.renderer.toneMappingExposure=.72;this.audio.play(attempt.passed?'success-chime':'warning-buzz');
  }
  private reset(daily:boolean):void {
    // The traffic view defers its result card; preserve completed evidence before a new attempt.
    if(this.state.completed&&!this.saved)this.finish();
    this.resetting=true;
    for(const entity of this.queries.targets.entities) {
      this.world.getSystem(GrabSystem)?.forceRelease(entity);const home=this.homes.get(entity.index);
      if(home&&entity.object3D){this.session.object3D!.attach(entity.object3D);entity.object3D.position.copy(home.position);entity.object3D.quaternion.copy(home.quaternion);}
    }
    this.dailyMode=daily;this.state=prepareProcedure(startRoads(daily?createRoadsDailyDrill().scenario:this.state.scenario));
    if(!this.state.rainPhase){this.state.scenario.variations.push('rain-incident');this.state.rainPhase='refuge';}
    this.state=roadsOpening(this.state,this.instructor.guidance);
    this.cacheUpstreamFlagger();
    if(this.bend)this.bend.visible=this.state.scenario.variations.includes('blind-bend');
    this.route=trafficRoute(this.state.layout,false);this.runSeconds=0;this.animationRunning=false;this.nudgedCone=undefined;this.contactCone=undefined;
    this.crewSeconds=0;this.incidentSeconds=0;this.incidentStage='approach';this.tapeDrawing=false;this.tapeTied=false;if(this.tape)this.tape.mesh.visible=false;if(this.reel?.object3D){this.reel.object3D.visible=true;this.reel.object3D.position.set(8,1.05,3.65);}
    this.saved=false;this.startedAt=new Date().toISOString();this.startedMs=performance.now();this.reaction='waiting';
    this.markers.visible=false;this.ruler.visible=false;this.world.renderer.toneMappingExposure=1;
    this.setVisible('results',false);this.setVisible('steps',true);this.setVisible('controls',true);
    this.resetting=false;this.refresh();this.instructor.sayInstruction(RAIN_STEPS[this.state.rainPhase??'traffic'].instruction);
    if (this.instructor.guidance === 'unguided') this.instructor.say(UNGUIDED_BRIEF);
  }
  update(delta:number,time:number):void {
    if(this.disposed||this.world.visibilityState.peek()!==VisibilityState.Visible)return;
    this.seatedRig.update(this.player,this.player.head,this.a11y);this.dwell.tick(this.a11y.dwellSelect,this.player.head,performance.now());
    this.session.object3D!.updateMatrixWorld(true);this.inverse.copy(this.session.object3D!.matrixWorld).invert();
    this.updateMarkerInstances(this.cones,this.coneEntities);
    this.updateMarkerInstances(this.delineators,this.delineatorEntities);
    this.updateMarkerInstances(this.barriers,this.barrierEntities);
    if(this.beacon){this.beacon.rotation.y=time*5;this.beacon.visible=this.state.layout.beaconOn&&(this.a11y.reducedMotion||Math.sin(time*8)>.05);}
    this.player.head.getWorldPosition(this.point);this.rain?.update(delta,this.point);this.fleetViewer.copy(this.point);this.session.object3D!.worldToLocal(this.fleetViewer);this.updateIncident(delta);this.player.head.getWorldPosition(this.point);this.player.head.getWorldDirection(this.forward).negate();this.audio.setListenerPose(this.point,this.forward,this.up);
    if(this.animationRunning)this.runSeconds+=delta;
    for(let i=0;i<this.traffic.length;i++) {
      const car=this.traffic[i];const pose=this.trafficPoses[i];
      if(this.animationRunning)sampleRoadTraffic(this.runSeconds,i*7.7,this.route,pose);
      else{pose.x=-20-i*6.5;pose.z=-1.75;pose.yaw=0;pose.reaction='cruise';}
      // Full-scale street: idle traffic waits upstream in the open south lane, never on the trainee.
      car.position.set(pose.x,0,pose.z);car.rotation.y=pose.yaw;car.visible=pose.x>-39.5&&pose.x<39.5;
      this.fleet?.set(i+3,pose.x,.07,pose.z,pose.yaw+Math.PI/2,Math.hypot(pose.x-this.fleetViewer.x,pose.z-this.fleetViewer.z),car.visible,false,false,this.a11y.reducedMotion);
      if(this.animationRunning&&i===0&&this.reaction!==pose.reaction) {
        this.reaction=pose.reaction;this.session.setValue(RoadsSession,'trafficReaction',pose.reaction);
        if(!this.saved)this.text('controls','zone-status',roadTrafficCaption(pose.reaction,this.state.failed));
      }
      if(this.animationRunning&&pose.reaction==='cone-contact'&&!this.nudgedCone&&this.contactCone) {
        this.nudgedCone=this.contactCone;
        if(this.nudgedCone.object3D)this.nudgedCone.object3D.rotation.z=-.52;
      }
    }
    this.fleet?.flush();
    const walking=this.state.crewDispatch==='walking';
    if(walking)this.crewSeconds+=Math.min(delta,.1);
    else if(this.state.crewDispatch==='standby')this.crewSeconds=0;
    const travel=this.state.crewDispatch==='on-station'?1:walking?(this.a11y.reducedMotion?1:Math.min(1,this.crewSeconds/ROADS_CREW_WALK_SECONDS)):0;
    for(let i=0;i<this.flaggerFaces.length;i++) {
      const faces=this.flaggerFaces[i];
      const proceed=this.animationRunning&&this.runSeconds%24>=13&&i===this.upstreamFlaggerIndex;
      const start=ROADS_CREW_STANDBY[i],end=i===0?ROADS_STAGING.upstream:ROADS_STAGING.downstream;
      const x=start.x+(end.x-start.x)*travel;
      const target=faces.target;
      if(target){target.position.set(x,roadsPropHeight(x,end.z),end.z);target.rotation.set(0,walking?-Math.PI/2:end.yaw,0);}
      faces.actor.update(delta,proceed,this.a11y.reducedMotion,walking);
    }
    if(walking&&travel===1)this.act('marshals-arrived');

  }
  private teardown():void {
    if(this.disposed)return;
    if(this.state.completed&&!this.saved)this.finish();
    this.disposed=true;
    for(const faces of this.flaggerFaces)faces.actor.dispose();
    this.flaggerFaces.length=0;
    for(let i=2;i<6;i++)this.fleet?.set(i,0,0,0,0,100,false);
    this.fleet?.flush();this.fleet=undefined;
    for(const entity of this.queries.targets.entities)this.world.getSystem(GrabSystem)?.forceRelease(entity);
    this.rain?.dispose();this.tape?.dispose();this.instructor.dispose();this.audio.dispose();this.world.renderer.toneMappingExposure=1;
    for(const entity of this.generated)entity.dispose({disposeResources:false});
    for(const resource of this.disposedResources)resource.dispose();
  }
}

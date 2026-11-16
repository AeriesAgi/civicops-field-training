import { browserStorage } from './training/browser-storage.js';
import {roadsPropHeight} from './training/roads-surfaces.js';
import {TaxiFleet} from './scene-assets/taxi-fleet.js';
import { AnimationMixer, AssetManager, Color, createSystem, Group, InstancedMesh, LoopOnce, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, ShaderMaterial, Skeleton, SkinnedMesh, Vector3, VisibilityState, type AnimationAction } from '@iwsdk/core';
import { loadSettings } from './training/accessibility-settings.js';
import { TrainingSession } from './training-components.js';
import { streetActorHeight, streetKind, streetRoute, type StreetKind } from './training/street-life.js';

/** Preserve an independent source rig for every anonymous crew member. */
export function cloneCrewRig(source: Object3D): Object3D {
  const copy = source.clone(true), originals: Object3D[] = [], copies: Object3D[] = [];
  source.traverse(o => originals.push(o)); copy.traverse(o => copies.push(o));
  const map = new Map(originals.map((o, i) => [o, copies[i]]));
  for (let i = 0; i < originals.length; i++) {
    const from = originals[i], to = copies[i];
    if (from instanceof SkinnedMesh && to instanceof SkinnedMesh) {
      to.skeleton = new Skeleton(from.skeleton.bones.map(b => map.get(b) as typeof b), from.skeleton.boneInverses);
      to.bindMatrix.copy(from.bindMatrix); to.bindMatrixInverse.copy(from.bindMatrixInverse);
    }
  }
  copy.visible = true; return copy;
}
/** Select prototypes only from their authored asset instance, never a reused rig. */
export function streetActorSource(root:Object3D):Object3D|undefined {
  return root.getObjectByName('street-actors');
}
interface Crew { root: Group; mixer: AnimationMixer; walk?: AnimationAction; wave?: AnimationAction; reacting: boolean; elapsed:number; materials:MeshStandardMaterial[]; }

/** One taxi draw, three rigged crew draws, and one shared contact-shadow draw. */
export class StreetLifeSystem extends createSystem({ sessions: { required: [TrainingSession] } }) {
  private root?: Object3D;
  private kind?: StreetKind;
  private taxis?: TaxiFleet;
  private contactShadows?: InstancedMesh;
  private readonly crew: Crew[] = [];
  private readonly assessedProps:Object3D[]=[];
  private readonly shadowScale = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly viewer = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private elapsed = 0;
  private reducedMotion = false;
  private readonly route = { along: 0, across: 0, heading: 0 };
  init(): void {
    this.cleanupFuncs.push(this.queries.sessions.subscribe('qualify', e => { if (e.object3D) this.mount(e.object3D); }),
      this.queries.sessions.subscribe('disqualify', e => { if (e.object3D === this.root) this.clear(); }), () => this.clear());
  }
  refreshActors(): void { for (const e of this.queries.sessions.entities) if (e.object3D) this.mount(e.object3D); }
  private mount(root: Object3D): void {
    if (this.root===root && this.taxis) return;
    this.clear(); this.root = root; this.kind = streetKind(root.name); this.elapsed = 0;
    this.reducedMotion = loadSettings(browserStorage(), location.search).reducedMotion;
    if (!this.kind) return;
    root.updateMatrixWorld(true);
    // A session can qualify before its children attach. refreshActors retries
    // once the complete level exists; never construct an incomplete source.
    const source=streetActorSource(root);
    if (!source?.getObjectByName('StreetTaxiDistantMesh')) return;
    this.taxis = new TaxiFleet(root, this.kind==='roads'?6:2, 'Live:StreetTaxiTemplateMesh',source);
    root.add(this.taxis.near, this.taxis.distant);
    const rig = source.getObjectByName('StreetWorkerRig');
    const clips = AssetManager.getGLTF('street-actors', {shared:true})?.animations ?? [];
    if (rig) rig.visible = false;
    // Third-party baked motion is not redistributed in the public source tree.
    // Without a Walk clip the wandering background crew is omitted rather than
    // sliding in bind pose; taxis, marshals and all training interactions remain.
    if (rig && clips.some(c => c.name === 'Walk')) {
      for (let i = 0; i < 3; i++) {
        const copy = cloneCrewRig(rig), group = new Group(); group.name = `AnonymousCrew${i}`; group.add(copy); root.add(group);
        const materials:MeshStandardMaterial[]=[];
        copy.traverse(o=>{if(o instanceof Mesh&&o.material instanceof MeshStandardMaterial){const m=o.material.clone();const tint=new Color(...([[.65,.55,.45],[.9,.8,.7],[1.1,.95,.85]][i] as [number,number,number]));m.onBeforeCompile=shader=>{shader.uniforms.crewSkinTint={value:tint};shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 crewSkinTint;').replace('#include <color_fragment>','#include <color_fragment>\n#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)\nfloat skin=step(.25,vColor.r)*step(vColor.g*1.25,vColor.r)*step(vColor.b,vColor.g*.75);diffuseColor.rgb*=mix(vec3(1.0),crewSkinTint,skin);\n#endif');};m.customProgramCacheKey=()=>'anonymous-crew-finish-v1';o.material=m;materials.push(m);}});
        const mixer = new AnimationMixer(copy);
        const walkClip = clips.find(c => c.name === 'Walk'), waveClip = clips.find(c => c.name === 'Wave');
        const walk = walkClip ? mixer.clipAction(walkClip) : undefined, wave = waveClip ? mixer.clipAction(waveClip) : undefined;
        walk?.play(); if (wave) { wave.setLoop(LoopOnce, 1); wave.clampWhenFinished = true; }
        mixer.setTime(i * .32); group.scale.set(1 + (i % 2) * .08, 1 - (i % 3) * .035, 1);
        this.crew.push({root:group,mixer,walk,wave,reacting:false,elapsed:0,materials});
      }
    }
    if(this.kind==='roads')for(const name of ['roads-bakkie','roads-marshal-1','roads-marshal-2']){const prop=root.getObjectByName(name);if(prop)this.assessedProps.push(prop);}
    const geometry = new PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
    const material = new ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 vUv;void main(){float a=.38*(1.0-smoothstep(.12,1.0,length(vUv*2.0-1.0)));gl_FragColor=vec4(.035,.042,.048,a);}'});
    this.contactShadows = new InstancedMesh(geometry, material, this.taxis.capacity+3+this.assessedProps.length); this.contactShadows.name = 'StreetContactShadows'; this.contactShadows.frustumCulled = false; this.contactShadows.raycast = () => {}; root.add(this.contactShadows);
  }
  /** Slots 0/1 belong to background routes; 2–5 to the assessed Roads traffic. */
  assessmentFleet(): TaxiFleet | undefined { this.refreshActors(); return this.kind==='roads'?this.taxis:undefined; }
  private clear(): void {
    this.taxis?.dispose(); this.taxis = undefined;
    for (const c of this.crew) { c.mixer.stopAllAction(); c.mixer.uncacheRoot(c.mixer.getRoot()); c.root.traverse(o => { if (o instanceof SkinnedMesh) o.skeleton.dispose(); }); c.root.removeFromParent();for(const m of c.materials)m.dispose(); }
    this.crew.length = 0;this.assessedProps.length=0;
    this.contactShadows?.removeFromParent(); this.contactShadows?.dispose(); this.contactShadows?.geometry.dispose();
    (this.contactShadows?.material as ShaderMaterial | undefined)?.dispose(); this.contactShadows = undefined; this.root = undefined;
  }
  update(delta: number): void {
    if (!this.kind || !this.root || this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) return;
    const dt = this.reducedMotion ? 0 : Math.min(delta, .1); this.elapsed += dt;
    this.player.head.getWorldPosition(this.viewer); this.root.worldToLocal(this.viewer);
    const roads = this.kind === 'roads';
    for (let family = 0; family < 2; family++) for (let i = 0; i < (family ? this.crew.length : 2); i++) {
      streetRoute(this.kind, !!family, family?i:i===1?2:0, family?this.crew[i].elapsed:this.elapsed, this.route);
      const {along,across,heading} = this.route;
      const ground = streetActorHeight(this.kind,!!family,!family&&i===1);
      this.position.set(roads ? along : across, ground, roads ? across : -along); this.rotation.setFromAxisAngle(this.up, heading);
      if (family) {
        const c = this.crew[i]; c.root.position.copy(this.position); c.root.quaternion.copy(this.rotation);
        const reacting = this.position.distanceToSquared(this.viewer) < 9;
        if (reacting !== c.reacting) {
          c.reacting = reacting;
          if (reacting) { c.walk?.fadeOut(.2); c.wave?.reset().fadeIn(.2).play(); }
          else { c.wave?.fadeOut(.2); c.walk?.reset().fadeIn(.2).play(); }
        }
        if(reacting)c.root.rotation.y=Math.atan2(this.viewer.x-this.position.x,this.viewer.z-this.position.z);else c.elapsed+=dt;
        c.mixer.update(dt);
      } else { this.taxis?.set(i,this.position.x,ground,this.position.z,heading,this.position.distanceTo(this.viewer),true,false,false,this.reducedMotion); }
      this.position.y = ground + .012; this.shadowScale.set(family ? .58 : 2.0,1,family ? .72 : 5.0);
      this.matrix.compose(this.position,this.rotation,this.shadowScale); this.contactShadows?.setMatrixAt(family ? i+(this.taxis?.capacity??2) : i,this.matrix);
    }
    this.taxis?.flush();
    if(this.contactShadows)this.taxis?.writeShadows(this.contactShadows);
    if(this.contactShadows){
      for(let i=0;i<this.assessedProps.length;i++){
        const prop=this.assessedProps[i];prop.getWorldPosition(this.position);this.root.worldToLocal(this.position);
        this.position.y=roadsPropHeight(this.position.x,this.position.z)+.008;
        this.rotation.setFromAxisAngle(this.up,prop.rotation.y+(i===0?Math.PI/2:0));
        this.shadowScale.set(i===0?2.3:.60,1,i===0?5.3:.70);
        this.matrix.compose(this.position,this.rotation,this.shadowScale);
        this.contactShadows.setMatrixAt((this.taxis?.capacity??2)+3+i,this.matrix);
      }
      this.contactShadows.instanceMatrix.needsUpdate = true;
    }
  }
}

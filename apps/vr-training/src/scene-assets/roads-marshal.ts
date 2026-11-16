import { AnimationMixer, Object3D, Quaternion, SkinnedMesh, Vector3, type AnimationAction, type AnimationClip } from '@iwsdk/core';
import { cloneCrewRig } from '../street-life-system.js';

/** One independent crew rig. Only the upstream marshal may signal GO. */
export class RoadsMarshal {
  readonly visual: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly idle?: AnimationAction;
  private readonly signal?: AnimationAction;
  private readonly stop?: Object3D;
  private readonly go?: Object3D;
  private readonly board?: Object3D;
  private proceeding = false;
  private walking = false;
  private readonly walk?: AnimationAction;
  private readonly stopRotation:Quaternion;
  private readonly goRotation:Quaternion;
  constructor(target: Object3D, source: Object3D, clips: readonly AnimationClip[]) {
    this.visual = cloneCrewRig(source);
    target.clear(); target.add(this.visual);
    this.mixer = new AnimationMixer(this.visual);
    const idle = clips.find(c => c.name === 'Idle'), signal = clips.find(c => c.name === 'Interact');
    this.idle = idle ? this.mixer.clipAction(idle) : undefined;
    this.signal = signal ? this.mixer.clipAction(signal) : undefined;
    const walk=clips.find(c=>c.name==='Walk');this.walk=walk?this.mixer.clipAction(walk):undefined;
    this.idle?.play();
    this.stop = this.visual.getObjectByName('StopFace'); this.go = this.visual.getObjectByName('GoFace');
    this.board = this.visual.getObjectByName('HeldTrainingBoard');
    this.stopRotation=this.board?.quaternion.clone()??new Quaternion();
    this.goRotation=this.stopRotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI));
    if (this.go) this.go.visible = false;
    this.mixer.update(0);
  }
  update(delta: number, proceed: boolean, reducedMotion: boolean, walking = false): void {
    if(walking!==this.walking){
      this.walking=walking;
      this.mixer.stopAllAction();(walking?this.walk:this.idle)?.reset().play();this.mixer.update(0);
    }
    if (proceed !== this.proceeding) {
      this.proceeding = proceed;
      if (reducedMotion) {
        this.mixer.stopAllAction(); (proceed ? this.signal : this.idle)?.reset().play(); this.mixer.update(0);
      } else {
        (proceed ? this.idle : this.signal)?.fadeOut(.2);
        (proceed ? this.signal : this.idle)?.reset().fadeIn(.2).play();
      }
    }
    if (this.stop) this.stop.visible = !proceed;
    if (this.go) this.go.visible = proceed;
    if (this.board) this.board.quaternion.copy(proceed ? this.goRotation : this.stopRotation);
    if (!reducedMotion) this.mixer.update(Math.max(0, Math.min(delta, .1)));
  }
  dispose(): void {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.visual);
    this.visual.traverse(o => { if (o instanceof SkinnedMesh) o.skeleton.dispose(); });
    this.visual.removeFromParent();
  }
}

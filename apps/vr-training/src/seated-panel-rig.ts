import { Euler, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { seatedMode, seatedTrayPoses, SEATED, type ReachSettings, type TrayPose } from './training/seated-reach.js';

interface Authored { position: Vector3; quaternion: Quaternion; scale: Vector3 }

/**
 * Applies the seated tray to a module's step and control panels. Panels that replace the controls
 * (Water's network plan, Fire's handover) share the controls slot. Leaving seated restores the
 * authored layout exactly, so standing play is unchanged.
 */
export class SeatedPanelRig {
  seated = false;
  private anchored = false;
  private readonly anchor = new Vector3();
  private anchorYaw = 0;
  private readonly authored = new Map<Object3D, Authored>();
  private readonly head = new Vector3();
  private readonly origin = new Vector3();
  private readonly view = new Vector3();
  private readonly point = new Vector3();
  private readonly world = new Quaternion();
  private readonly parent = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  constructor(private readonly slots: { steps: readonly Object3D[]; controls: readonly Object3D[] }) {}

  /** Returns true on the frame the layout switches between seated and standing. */
  update(origin: Object3D, head: Object3D, settings: ReachSettings): boolean {
    head.getWorldPosition(this.head); origin.getWorldPosition(this.origin);
    const was = this.seated;
    this.seated = seatedMode(was, this.head.y - this.origin.y, settings);
    if (!this.seated) { if (was) this.restore(); return was; }
    head.getWorldDirection(this.view).negate();
    const yaw = this.view.x * this.view.x + this.view.z * this.view.z > 1e-6 ? Math.atan2(-this.view.x, -this.view.z) : this.anchorYaw;
    let turn = Math.abs(yaw - this.anchorYaw) % (Math.PI * 2); if (turn > Math.PI) turn = Math.PI * 2 - turn;
    const moved = Math.hypot(this.head.x - this.anchor.x, this.head.z - this.anchor.z) > SEATED.reanchorM;
    if (this.anchored && !moved && turn <= SEATED.reanchorYaw) return !was;
    this.anchored = true; this.anchor.copy(this.head); this.anchorYaw = yaw;
    const tray = seatedTrayPoses({ x: this.head.x, y: this.head.y, z: this.head.z }, yaw, settings);
    for (const panel of this.slots.steps) this.place(panel, tray.steps, tray.scale);
    for (const panel of this.slots.controls) this.place(panel, tray.controls, tray.scale);
    return !was;
  }

  private place(panel: Object3D, pose: TrayPose, scale: number): void {
    if (!this.authored.has(panel)) this.authored.set(panel, { position: panel.position.clone(), quaternion: panel.quaternion.clone(), scale: panel.scale.clone() });
    const authored = this.authored.get(panel)!;
    this.point.set(pose.x, pose.y, pose.z);
    this.world.setFromEuler(this.euler.set(pose.pitch, pose.yaw, 0, 'YXZ'));
    if (panel.parent) {
      panel.parent.updateWorldMatrix(true, false);
      panel.parent.worldToLocal(this.point);
      this.world.premultiply(panel.parent.getWorldQuaternion(this.parent).invert());
    }
    panel.position.copy(this.point); panel.quaternion.copy(this.world);
    panel.scale.copy(authored.scale).multiplyScalar(scale);
  }

  private restore(): void {
    for (const [panel, authored] of this.authored) { panel.position.copy(authored.position); panel.quaternion.copy(authored.quaternion); panel.scale.copy(authored.scale); }
    this.authored.clear(); this.anchored = false;
  }
}

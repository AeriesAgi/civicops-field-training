import { createSystem, Object3D, PerspectiveCamera, Quaternion, Raycaster, Vector2, Vector3, Euler } from '@iwsdk/core';
import { DESKTOP_TARGETS, TARGET_LABELS } from './ui/desktop-intents.js';
import { isDesktopSession, sendDesktopCommand, sendDesktopPick } from './ui/desktop-bridge.js';
import { desktopFraming, clampToRadius, type Framing } from './ui/desktop-camera.js';

/**
 * Mouse-and-keyboard play for judges without a headset. Active only outside an
 * immersive session. Dragging looks around, WASD steps, the wheel leans in, and a
 * click on equipment is forwarded to the lesson as a physical action.
 */
export class DesktopControlsSystem extends createSystem({}) {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly position = new Vector3();
  private readonly base = new Vector3();
  private readonly worldQuat = new Quaternion();
  private readonly parentQuat = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly move = new Vector3();
  private framing?: Framing;
  private framedModule = '';
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private dragDistance = 0;
  private lastX = 0;
  private lastY = 0;
  private readonly keys = new Set<string>();
  private hoverAt = 0;
  private hoverName = '';
  private pendingHover?: { x: number; y: number };
  private spaceDown = false;
  private elapsed = 0;

  init(): void {
    (window as unknown as { civicOpsDesktopTargets?: () => Record<string, { x: number; y: number }> }).civicOpsDesktopTargets = () => this.screenTargets();
    const canvas = this.world.renderer.domElement;
    const down = (event: PointerEvent) => {
      if (!this.active() || event.button !== 0) return;
      this.dragging = true; this.dragDistance = 0; this.lastX = event.clientX; this.lastY = event.clientY;
    };
    const moveHandler = (event: PointerEvent) => {
      if (!this.active()) return;
      if (this.dragging) {
        const dx = event.clientX - this.lastX, dy = event.clientY - this.lastY;
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
        this.lastX = event.clientX; this.lastY = event.clientY;
        if (this.dragDistance > 6) {
          this.yaw -= dx * 0.0042; this.pitch -= dy * 0.0042;
          this.clampView();
        }
      }
      this.pendingHover = { x: event.clientX, y: event.clientY };
    };
    const up = (event: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.active() && this.dragDistance <= 6 && this.lessonActive()) {
        const name = this.pick(event.clientX, event.clientY);
        if (name) sendDesktopPick(name);
      }
    };
    const wheel = (event: WheelEvent) => {
      if (!this.active() || !this.framing) return;
      event.preventDefault();
      const camera = this.world.camera as PerspectiveCamera;
      camera.fov = Math.min(70, Math.max(30, camera.fov + Math.sign(event.deltaY) * 3));
      camera.updateProjectionMatrix();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!this.active() || this.titleOpen() || (event.target as HTMLElement | null)?.closest?.('input,select,textarea')) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { this.keys.add(key); event.preventDefault(); }
      if (!this.lessonActive()) return;
      if (key === 'escape') sendDesktopCommand('put-down');
      else if (key === 'r') sendDesktopCommand('notify');
      else if (key === 'h') sendDesktopCommand('hint');
      else if (key === ' ' && !this.spaceDown) { this.spaceDown = true; event.preventDefault(); sendDesktopCommand('safe-begin'); }
    };
    const keyup = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (key === ' ' && this.spaceDown) { this.spaceDown = false; sendDesktopCommand('safe-end'); }
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', up); canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
    });
  }

  private active(): boolean { return !this.world.renderer.xr.isPresenting; }
  private titleOpen(): boolean { return !!(window as unknown as { civicOpsTitleOpen?: boolean }).civicOpsTitleOpen; }
  private currentModule(): string { return (window as unknown as { civicOpsModule?: string }).civicOpsModule ?? 'board'; }
  private lessonActive(): boolean {
    const host = window as unknown as { civicOpsHudBlocking?: boolean };
    return isDesktopSession() && !this.titleOpen() && !host.civicOpsHudBlocking && this.currentModule() === 'elec-loto';
  }

  private clampView(): void {
    const f = this.framing; if (!f) return;
    this.yaw = Math.max(f.yaw - f.yawRange, Math.min(f.yaw + f.yawRange, this.yaw));
    this.pitch = Math.max(-1.1, Math.min(0.6, this.pitch));
  }

  private targets(): Object3D[] {
    const out: Object3D[] = [];
    for (const name of DESKTOP_TARGETS) { const object = this.world.getSceneObject<Object3D>(name); if (object) out.push(object); }
    return out;
  }

  private visible(object: Object3D): boolean {
    for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }

  /** Screen positions of the visible lesson targets (read-only; used by smoke tests). */
  screenTargets(): Record<string, { x: number; y: number }> {
    const canvas = this.world.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const out: Record<string, { x: number; y: number }> = {};
    for (const root of this.targets()) {
      if (!this.visible(root)) continue;
      root.getWorldPosition(this.position);
      this.position.project(this.world.camera);
      if (this.position.z > 1) continue;
      out[root.name] = { x: Math.round(rect.left + (this.position.x + 1) / 2 * rect.width), y: Math.round(rect.top + (1 - this.position.y) / 2 * rect.height) };
    }
    return out;
  }

  /** Name of the nearest visible lesson target under the pointer. */
  pick(clientX: number, clientY: number): string {
    const canvas = this.world.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.world.camera);
    const roots = this.targets();
    let best = '', bestDistance = Infinity;
    const held = (window as unknown as { civicOpsHeldTool?: string }).civicOpsHeldTool;
    for (const root of roots) {
      // The tool in hand floats in front of the camera; clicks go through it to the target.
      if (!this.visible(root) || root.name === held) continue;
      const hits = this.raycaster.intersectObject(root, true);
      const hit = hits.find(candidate => this.visible(candidate.object));
      if (hit && hit.distance < bestDistance) { bestDistance = hit.distance; best = root.name; }
    }
    // Zones are small seats on the switch: accept a near miss so placement is forgiving.
    for (const zone of ['lock-zone', 'tag-zone']) {
      const object = this.world.getSceneObject<Object3D>(zone);
      if (!object) continue;
      object.getWorldPosition(this.position);
      const along = this.raycaster.ray.origin.distanceTo(this.position);
      if (this.raycaster.ray.distanceToPoint(this.position) < 0.045 && along < bestDistance + 0.05) { best = zone; bestDistance = along; }
    }
    return best;
  }

  update(delta: number): void {
    if (!this.active()) return;
    this.elapsed += delta;
    const module = this.currentModule();
    if (module !== this.framedModule) this.frame(module);
    const f = this.framing;
    if (!f) return;
    // Keyboard steps, bounded around the framed work position.
    this.move.set(0, 0, 0);
    if (this.keys.has('w') || this.keys.has('arrowup')) this.move.z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.move.z += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.move.x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.move.x += 1;
    if (this.move.lengthSq() > 0 && this.lessonActive()) {
      this.move.normalize().multiplyScalar(Math.min(0.05, delta) * 1.1).applyAxisAngle(new Vector3(0, 1, 0), this.yaw);
      this.base.add(this.move);
      const clamped = clampToRadius([this.base.x, this.base.z], [f.position[0], f.position[2]], f.radius);
      this.base.x = clamped[0]; this.base.z = clamped[1];
    }
    // The title backdrop drifts slowly; lessons hold still unless the trainee looks around.
    const reduced = !!(window as unknown as { civicOpsReducedMotion?: boolean }).civicOpsReducedMotion;
    const drift = this.titleOpen() && !reduced ? Math.sin(this.elapsed * 0.12) * 0.12 : 0;
    this.applyCamera(drift);
    if (this.pendingHover && this.elapsed - this.hoverAt > 0.08) {
      this.hoverAt = this.elapsed;
      const { x, y } = this.pendingHover; this.pendingHover = undefined;
      const name = this.lessonActive() && !this.dragging ? this.pick(x, y) : '';
      if (name !== this.hoverName) {
        this.hoverName = name;
        this.world.renderer.domElement.style.cursor = name ? 'pointer' : 'grab';
      }
      window.dispatchEvent(new CustomEvent('civicops:hover', { detail: { name, label: name ? TARGET_LABELS[name] ?? name : '', x, y } }));
    }
  }

  private frame(module: string): void {
    this.framedModule = module;
    this.framing = desktopFraming(module);
    if (!this.framing) return;
    this.base.fromArray(this.framing.position);
    this.yaw = this.framing.yaw; this.pitch = this.framing.pitch;
    const camera = this.world.camera as PerspectiveCamera;
    camera.fov = this.framing.fov; camera.updateProjectionMatrix();
    this.world.renderer.domElement.style.cursor = 'grab';
  }

  private applyCamera(drift: number): void {
    const camera = this.world.camera;
    this.position.copy(this.base);
    if (camera.parent) { camera.parent.updateWorldMatrix(true, false); camera.parent.worldToLocal(this.position); camera.parent.getWorldQuaternion(this.parentQuat); }
    else this.parentQuat.identity();
    camera.position.copy(this.position);
    this.euler.set(this.pitch, this.yaw + drift, 0, 'YXZ');
    this.worldQuat.setFromEuler(this.euler);
    camera.quaternion.copy(this.parentQuat.invert().multiply(this.worldQuat));
    camera.updateMatrixWorld();
  }
}

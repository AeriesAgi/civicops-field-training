import { Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { dwellTick, type DwellState } from './training/accessibility-settings.js';
import { dwellMsFor, pickGazeTarget, type GazePlane } from './training/gaze-dwell.js';

type Readable = { peek?: () => unknown; value?: unknown };
type DwellElement = Object3D & { size?: Readable; isVisible?: Readable; setProperties?: (properties: Record<string, unknown>) => void };
/** UIKit layout units to metres at panel scale 1 (the IWSDK default pixel size). */
const UI_METRES = 0.01;
const read = (signal?: Readable) => signal ? (signal.peek ? signal.peek() : signal.value) : undefined;

// UIKit sets `visible` on layout rows from whether they need render traversal, so a button's own
// visibility comes from its isVisible signal and only the panel root and its parents are walked.
function shown(element: DwellElement, root: Object3D): boolean {
  if (read(element.isVisible) === false) return false;
  for (let node: Object3D | null = root; node; node = node.parent) if (!node.visible) return false;
  return true;
}

/** Shared gaze dwell for UIKit buttons that a module has already bound for poke and ray. */
export class ModuleDwell {
  target = '';
  progress = 0;
  private state: DwellState = { target: '', sinceMs: 0, fired: false };
  private readonly targets = new Map<string, { element: DwellElement; root: Object3D; select: () => void }>();
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly center = new Vector3();
  private readonly scale = new Vector3();
  private readonly turn = new Quaternion();
  private lit?: DwellElement;

  register(id: string, element: Object3D, root: Object3D, select: () => void): () => void {
    const entry = { element: element as DwellElement, root, select };
    this.targets.set(id, entry);
    return () => { if (this.targets.get(id) === entry) { this.targets.delete(id); if (this.lit === entry.element) this.light(undefined, 0); } };
  }

  /** Returns the id pressed by dwell this frame, if any. */
  tick(enabled: boolean, head: Object3D, nowMs: number): string | undefined {
    if (!enabled || !this.targets.size) { this.state = { target: '', sinceMs: nowMs, fired: false }; this.target = ''; this.progress = 0; this.light(undefined, 0); return undefined; }
    head.getWorldPosition(this.origin); head.getWorldDirection(this.direction).negate();
    const planes: GazePlane[] = [];
    for (const [id, { element, root }] of this.targets) {
      const size = read(element.size) as [number, number] | undefined;
      if (!size || !shown(element, root)) continue;
      root.getWorldScale(this.scale); root.getWorldQuaternion(this.turn); element.getWorldPosition(this.center);
      const axis = (x: number, y: number, z: number) => { const v = new Vector3(x, y, z).applyQuaternion(this.turn); return { x: v.x, y: v.y, z: v.z }; };
      planes.push({ id, center: { x: this.center.x, y: this.center.y, z: this.center.z }, right: axis(1, 0, 0), up: axis(0, 1, 0), normal: axis(0, 0, 1),
        halfWidth: size[0] * UI_METRES * this.scale.x / 2, halfHeight: size[1] * UI_METRES * this.scale.y / 2 });
    }
    const id = pickGazeTarget(this.origin, this.direction, planes);
    const result = dwellTick(this.state, id, nowMs, id ? dwellMsFor(id) : undefined);
    this.state = result.state; this.target = id; this.progress = result.progress;
    (globalThis as { civicOpsDwell?: unknown }).civicOpsDwell = { target: id, progress: result.progress, candidates: planes.length };
    this.light(id ? this.targets.get(id)?.element : undefined, result.progress);
    if (!result.select) return undefined;
    this.targets.get(result.select)?.select();
    return result.select;
  }

  /** Grow the gazed button slightly as the dwell fills, so the trainee sees it is about to press. */
  private light(element: DwellElement | undefined, progress: number): void {
    if (this.lit && this.lit !== element) this.lit.setProperties?.({ transformScaleX: 1, transformScaleY: 1 });
    this.lit = element;
    const grow = 1 + .08 * progress;
    element?.setProperties?.({ transformScaleX: grow, transformScaleY: grow });
  }
}

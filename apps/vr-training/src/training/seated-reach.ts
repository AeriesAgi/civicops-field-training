/**
 * Seated reach for the Water, Roads and Fire programmes. Their standing layouts put the step
 * and control panels 0.85 to 1.65 m away, ray-only from a chair. Seated (or poke-only), the two
 * panels drop into a tilted tray in front of the trainee, every button within the shared reach
 * setting of a seated shoulder. Pure maths here; seated-panel-rig.ts applies it to the scene.
 */
export interface ReachSettings { reachM: number; benchHeightOffset: number; leftHanded: boolean; pokeOnly: boolean }
export interface Point3 { x: number; y: number; z: number }
export interface TrayPose extends Point3 { yaw: number; pitch: number }

export const SEATED = {
  /** Eye height above the floor that switches the tray on, and the height that switches it off. */
  enterEyeM: 1.35, leaveEyeM: 1.45,
  shoulderDropM: 0.25, shoulderSideM: 0.18,
  /** Panel centres sit this far below the eyes and either side of the view line. */
  dropM: 0.22, lateralM: 0.2,
  pitch: -25 * Math.PI / 180,
  scale: 0.75,
  minViewM: 0.3, maxViewM: 0.5,
  /** Re-anchor after a teleport or a clear turn. */
  reanchorM: 0.5, reanchorYaw: 35 * Math.PI / 180,
  /** Largest authored module panel (Fire handover, 36 x 52 UI units), in metres at scale 1. */
  panel: { halfWidthM: 0.18, halfHeightM: 0.26 },
} as const;

export function seatedMode(previous: boolean, eyeHeightM: number, settings: Pick<ReachSettings, 'pokeOnly'>): boolean {
  if (settings.pokeOnly) return true;
  return previous ? eyeHeightM < SEATED.leaveEyeM : eyeHeightM < SEATED.enterEyeM;
}

const forwardOf = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const rightOf = (yaw: number) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

export function workingShoulder(head: Point3, yaw: number, leftHanded: boolean): Point3 {
  const right = rightOf(yaw), side = leftHanded ? -SEATED.shoulderSideM : SEATED.shoulderSideM;
  return { x: head.x + right.x * side, y: head.y - SEATED.shoulderDropM, z: head.z + right.z * side };
}

/** World point of a panel-local offset (u right, v up, metres before scale) for a YXZ-ordered pose. */
export function trayPoint(pose: TrayPose, scale: number, u: number, v: number): Point3 {
  const lu = u * scale, lv = v * scale;
  const y = lv * Math.cos(pose.pitch), zLocal = lv * Math.sin(pose.pitch);
  const right = rightOf(pose.yaw), back = { x: Math.sin(pose.yaw), z: Math.cos(pose.yaw) };
  return { x: pose.x + right.x * lu + back.x * zLocal, y: pose.y + y, z: pose.z + right.z * lu + back.z * zLocal };
}

function poseAt(head: Point3, yaw: number, settings: ReachSettings, distance: number, side: 1 | -1): TrayPose {
  const forward = forwardOf(yaw), right = rightOf(yaw), lateral = side * SEATED.lateralM;
  return {
    x: head.x + forward.x * distance + right.x * lateral,
    y: head.y - SEATED.dropM + settings.benchHeightOffset,
    z: head.z + forward.z * distance + right.z * lateral,
    yaw, pitch: SEATED.pitch,
  };
}

function farthestCorner(head: Point3, settings: ReachSettings, distance: number): number {
  const { halfWidthM: w, halfHeightM: h } = SEATED.panel;
  const shoulder = workingShoulder(head, 0, false);
  const pose = poseAt(head, 0, settings, distance, 1);
  let worst = 0;
  for (const [u, v] of [[-w, -h], [w, -h], [-w, h], [w, h]]) {
    const p = trayPoint(pose, SEATED.scale, u, v);
    worst = Math.max(worst, Math.hypot(p.x - shoulder.x, p.y - shoulder.y, p.z - shoulder.z));
  }
  return worst;
}

/** Farthest comfortable view distance that keeps every panel corner within reach (bench offset excluded). */
export function trayViewDistance(settings: ReachSettings): number {
  const level = { ...settings, benchHeightOffset: 0 }, head = { x: 0, y: 0, z: 0 };
  for (let cm = Math.round(SEATED.maxViewM * 100); cm >= Math.round(SEATED.minViewM * 100); cm -= 1) {
    if (farthestCorner(head, level, cm / 100) <= settings.reachM) return cm / 100;
  }
  return SEATED.minViewM;
}

export function seatedTrayPoses(head: Point3, yaw: number, settings: ReachSettings): { steps: TrayPose; controls: TrayPose; scale: number } {
  const distance = trayViewDistance(settings);
  const controlsSide = settings.leftHanded ? -1 : 1;
  return {
    steps: poseAt(head, yaw, settings, distance, (-controlsSide) as 1 | -1),
    controls: poseAt(head, yaw, settings, distance, controlsSide as 1 | -1),
    scale: SEATED.scale,
  };
}

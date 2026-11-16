/** Wheel distance is measured along the actual route so STOP never spins tyres. */
export function advanceWheelAngle(angle: number, distance: number, radius: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return angle;
  return (angle + distance / radius) % (Math.PI * 2);
}

/** Hysteresis avoids changing silhouettes repeatedly at the detail boundary. */
export function fleetDetail(distance: number, near: boolean): boolean {
  return Number.isFinite(distance) && distance < (near ? 20 : 16);
}

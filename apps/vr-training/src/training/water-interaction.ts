const TAU = Math.PI * 2;

/** Short signed angular distance, so a wrist crossing +/-pi never jumps a turn. */
export function wristRollDelta(previous: number, next: number): number {
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return 0;
  return Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
}

/** Reused throughout a grab. A regrip starts a new sample without inventing motion. */
export class ValveRollTracker {
  private previous = 0;
  private initialized = false;
  private pending = 0;
  private elapsed = 0;
  turns = 0;
  durationMs = 0;

  begin(roll: number): void {
    this.previous = roll;
    this.initialized = Number.isFinite(roll);
    this.pending = 0;
    this.elapsed = 0;
    this.turns = 0;
    this.durationMs = 0;
  }

  sample(roll: number, deltaSeconds: number): void {
    if (!Number.isFinite(roll) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (!this.initialized) { this.begin(roll); return; }
    // Ignore one impossible tracking jump. Reacquisition establishes a new baseline.
    const change = wristRollDelta(this.previous, roll);
    this.previous = roll;
    if (Math.abs(change) > Math.PI * .75) { this.pending = 0; this.elapsed = 0; return; }
    // Waiting with a stationary key must not disguise a fast closure as a slow one.
    if (Math.abs(change) < .0005) return;
    this.pending += change / TAU;
    this.elapsed += deltaSeconds * 1000;
  }

  /** Emit bounded interaction edges, with the actual time spent moving included. */
  take(force = false): boolean {
    if (Math.abs(this.pending) < (force ? .005 : .125)) return false;
    this.turns = this.pending;
    this.durationMs = Math.max(1, this.elapsed);
    this.pending = 0;
    this.elapsed = 0;
    return true;
  }
}

export function valveSnapDistanceSquared(dx: number, dy: number, dz: number): number {
  return dx * dx + dy * dy + dz * dz;
}

/** Full-scale valve key seating radius (5.5 cm). */
export const WATER_KEY_SNAP_RADIUS = .55;
/** Full-scale valve cover lift threshold (40 cm). */
export const WATER_COVER_LIFT_HEIGHT = .4;

/** Prevent an exiting key from being recaptured before the grab system moves it. */
export class KeySocketExitGuard<ValveId extends string> {
  blockedValve: ValveId | '' = '';

  beginExit(valve: ValveId): void { this.blockedValve = valve; }

  /** Observe the key's actual position, never the hand's intended destination. */
  observeExit(distanceSquared: number): void {
    if (Number.isFinite(distanceSquared) && distanceSquared > WATER_KEY_SNAP_RADIUS * WATER_KEY_SNAP_RADIUS) this.blockedValve = '';
  }

  canSeat(valve: ValveId): boolean { return valve !== this.blockedValve; }
  reset(): void { this.blockedValve = ''; }
}

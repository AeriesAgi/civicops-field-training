/** A release action belongs to the pointer that pressed this exact target. */
export class PointerPressLatch {
  private owner: number | undefined;

  /** The latest deliberate press replaces an earlier unfinished contact. */
  press(pointerId: number, target?: { setPointerCapture(pointerId: number): void }): void {
    this.owner = Number.isFinite(pointerId) ? pointerId : undefined;
    if (this.owner !== undefined) target?.setPointerCapture(this.owner);
  }

  /** Orphan/wrong-hand releases never fire; matching releases fire once. */
  release(pointerId: number): boolean {
    if (this.owner === undefined || this.owner !== pointerId) return false;
    this.owner = undefined;
    return true;
  }

  /** A different pointer leaving this target cannot cancel the owner's press. */
  cancel(pointerId: number): boolean {
    return this.release(pointerId);
  }

  /** Clear stale capture when hiding a panel, resetting, or disposing its handlers. */
  reset(): void { this.owner = undefined; }

  get pressed(): boolean { return this.owner !== undefined; }
}

/** Deliberate confirmation: release cancels and a completed hold fires only once. */
export class HoldConfirm {
  readonly duration = 0.8;
  elapsed = 0;
  pressed = false;
  ready = false;
  private startedAt = 0;

  begin(eligible: boolean, nowSeconds = 0): void {
    this.cancel();
    this.pressed = eligible;
    this.startedAt = nowSeconds;
  }

  tick(delta: number): void {
    if (!this.pressed || this.ready) return;
    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, delta));
    this.ready = this.elapsed >= this.duration;
  }

  /** Ignore time before the press, even when the preceding frame was delayed. */
  advanceAt(nowSeconds: number): void {
    this.tick(nowSeconds - this.startedAt - this.elapsed);
  }

  release(eligible: boolean): boolean {
    const confirmed = eligible && this.pressed && this.ready;
    this.cancel();
    return confirmed;
  }

  cancel(): void {
    this.elapsed = 0;
    this.pressed = false;
    this.ready = false;
  }

  get progress(): number { return this.elapsed / this.duration; }
}

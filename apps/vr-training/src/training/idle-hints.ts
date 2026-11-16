/** Hint cadence counts available practice time, never time spent reading or watching. */
export class IdleHintTimer {
  readonly delaySeconds: number;
  private elapsedSeconds = 0;

  constructor(delaySeconds = 15) {
    this.delaySeconds = Number.isFinite(delaySeconds) && delaySeconds > 0 ? delaySeconds : 15;
  }

  /** Pass false during settings, demonstrations, deliberate holds or inactive lessons. */
  tick(deltaSeconds: number, eligible: boolean): boolean {
    if (!eligible) { this.reset(); return false; }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
    this.elapsedSeconds += deltaSeconds;
    if (this.elapsedSeconds < this.delaySeconds) return false;
    this.reset();
    return true;
  }

  /** Explicit learning actions, including Why, start a fresh interval. */
  reset(): void { this.elapsedSeconds = 0; }
}

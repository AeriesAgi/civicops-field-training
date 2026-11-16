/** A narrow high-visibility cuff band; hands and fingertips keep dark fabric. */
export function gloveAccentForDistance(distance: number): number {
  if (!Number.isFinite(distance) || distance <= .014 || distance >= .048) return 0;
  const rise = Math.min(1, (distance - .014) / .005);
  const fall = Math.min(1, (.048 - distance) / .005);
  const t = Math.min(rise, fall);
  return t * t * (3 - 2 * t);
}

/** Soft fingertip cue starts 70 mm before an active poke target and saturates at contact. */
export function fingertipGlowForDistance(distance: number): number {
  if (!Number.isFinite(distance) || distance >= .07) return 0;
  const t = Math.max(0, Math.min(1, (.07 - distance) / .05));
  return t * t * (3 - 2 * t);
}

/** A single calm 450 ms materialisation sweep on each new tracked-hand connection. */
export function handShimmerForAge(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= .45) return 0;
  return 1 - seconds / .45;
}

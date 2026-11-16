/** Original CC0 pose timing for the instructor's four one-time hand demonstrations. */
export type DemoGesture = 'poke' | 'pinch-grab' | 'place' | 'hold-to-confirm';

export interface DemoPose {
  approach: number;
  curl: number;
  pinch: number;
  opacity: number;
  ring: number;
}

/** UIKit depth updates belong on contact edges, never on every animation frame. */
export function createPokeDepression(setPressed: (pressed: boolean) => void): (amount: number) => void {
  let pressed = false;
  return (amount) => {
    const next = amount > 0;
    if (next === pressed) return;
    pressed = next;
    setPressed(next);
  };
}

/** Mutates an existing pose so the scene can animate without frame allocations. */
export function sampleDemoPose(gesture: DemoGesture, elapsed: number, pose: DemoPose): void {
  const phase = (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0) % 3.6;
  const ease = Math.min(1, Math.max(0, phase / .9));
  const withdraw = Math.min(1, Math.max(0, (phase - 2.5) / .8));
  pose.approach = ease * (1 - withdraw);
  pose.curl = gesture === 'poke' || gesture === 'hold-to-confirm' ? .8 : .12;
  pose.pinch = gesture === 'pinch-grab' || gesture === 'place' ? pose.approach : 0;
  pose.opacity = Math.min(1, phase / .22, (3.6 - phase) / .3) * .48;
  pose.ring = gesture === 'hold-to-confirm' ? Math.min(1, Math.max(0, (phase - .9) / 1.6)) : 0;
}

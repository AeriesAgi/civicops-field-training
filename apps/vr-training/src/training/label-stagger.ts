/**
 * AR hazard labels float above each marker and grow with distance. When markers line up from
 * where the worker stands, those labels print over each other. This lifts the farther label in
 * tiers until it clears every nearer one, judged in view angles from the worker's head.
 */
export interface LabelHead { x: number; y: number; z: number }
export interface LabelAnchor { x: number; z: number }
export interface LabelViewBox { bearing: number; halfWidth: number; bottom: number; top: number }

export const HAZARD_LABEL = { baseY: 2.6, widthM: 1.5, heightM: 0.34, maxTiers: 3, gap: 1.15, visibleM: 14 } as const;

/** Labels are drawn at whole-metre distances; this is the same scale the card uses. */
export function hazardLabelScale(roundedDistance: number): number {
  return Math.max(1, roundedDistance / 3.5);
}

function distanceTo(head: LabelHead, anchor: LabelAnchor): number {
  return Math.hypot(anchor.x - head.x, anchor.z - head.z);
}

export function labelViewBox(head: LabelHead, anchor: LabelAnchor, y: number): LabelViewBox {
  const raw = distanceTo(head, anchor);
  const range = Math.max(0.5, raw);
  const scale = hazardLabelScale(Math.round(raw));
  const halfHeight = (HAZARD_LABEL.heightM * scale) / 2;
  return {
    bearing: Math.atan2(anchor.x - head.x, anchor.z - head.z),
    halfWidth: Math.atan((HAZARD_LABEL.widthM * scale) / 2 / range),
    bottom: Math.atan2(y - halfHeight - head.y, range),
    top: Math.atan2(y + halfHeight - head.y, range),
  };
}

export function labelsOverlap(a: LabelViewBox, b: LabelViewBox): boolean {
  let turn = Math.abs(a.bearing - b.bearing) % (Math.PI * 2);
  if (turn > Math.PI) turn = Math.PI * 2 - turn;
  return turn < a.halfWidth + b.halfWidth && a.bottom < b.top && b.bottom < a.top;
}

/** Label heights in input order. The nearest label keeps the authored height; hidden ones are ignored. */
export function staggerLabelHeights(head: LabelHead, anchors: readonly LabelAnchor[]): number[] {
  const heights = anchors.map((): number => HAZARD_LABEL.baseY);
  const order = anchors.map((anchor, index) => ({ index, distance: distanceTo(head, anchor) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index);
  const placed: LabelViewBox[] = [];
  for (const { index, distance } of order) {
    const rounded = Math.round(distance);
    if (rounded > HAZARD_LABEL.visibleM) continue;
    const step = HAZARD_LABEL.heightM * hazardLabelScale(rounded) * HAZARD_LABEL.gap;
    let box = labelViewBox(head, anchors[index], HAZARD_LABEL.baseY);
    for (let tier = 0; tier <= HAZARD_LABEL.maxTiers; tier += 1) {
      const y = HAZARD_LABEL.baseY + tier * step;
      box = labelViewBox(head, anchors[index], y);
      heights[index] = y;
      if (!placed.some(other => labelsOverlap(box, other))) break;
    }
    placed.push(box);
  }
  return heights;
}

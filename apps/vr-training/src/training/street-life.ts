/** Deterministic background routes, physically separated from each work zone. */
export type StreetKind = 'electrical' | 'water' | 'roads' | 'fire';
export interface StreetPose { along: number; across: number; heading: number }
export function streetKind(name: string): StreetKind | undefined {
  return ({ 'bench-rig': 'electrical', 'water-session': 'water', 'roads-session': 'roads', 'fire-session': 'fire' } as const)[name as 'bench-rig'];
}
/** Writes into caller-owned storage: no allocations in the render loop. */
export function streetRoute(kind: StreetKind, pedestrian: boolean, index: number, seconds: number, out: StreetPose): void {
  const half = kind === 'electrical' || kind === 'roads' ? 3.5 : 7;
  const direction = index % 2 ? -1 : 1;
  out.heading = (direction > 0 ? Math.PI : 0) + (kind === 'roads' ? -Math.PI / 2 : 0);
  if (!pedestrian && index === 2) {
    // Authored bays: never reuse the Roads pavement bay beside a field station.
    out.along = kind === 'roads' ? -30 : kind === 'electrical' ? -3 : kind === 'water' ? -14 : 23;
    out.across = kind === 'roads' ? -4.75 : kind === 'electrical' ? -2.4 : kind === 'water' ? -4.7 : -5.5;
    return;
  }
  const distance = seconds * (pedestrian ? .65 : 3.8) * direction + index * 23;
  const wrapped = ((distance % 62) + 62) % 62;
  out.along = pedestrian ? wrapped - 25 : kind === 'roads' ? -85 + wrapped : 24 + wrapped;
  out.across = pedestrian ? direction * (half + 1.05) : -direction * 1.75;
}

/** Match the actual asphalt/shoulder receivers, including the Roads raised rank. */
export function streetActorHeight(kind:StreetKind, pedestrian:boolean, parked:boolean):number {
  if(parked)return kind==='roads'?.42:kind==='water'?.04:kind==='fire'?.08:0;
  if(pedestrian)return kind==='roads'?.42:kind==='water'?.04:kind==='electrical'?.05:.1;
  return kind==='roads'?.07:kind==='fire'?.08:0;
}

/** Keep the hand in seated reach; aim its ray rather than moving it beside a UI target. */
export function roomRayOrigin(head) {
  const p=Array.isArray(head)?head:head&&[head.x,head.y,head.z];
  if (!p || p.length!==3 || !p.every(Number.isFinite)) throw new Error('Missing headset pose');
  return [p[0]+.26,p[1]-.2,p[2]+.12];
}

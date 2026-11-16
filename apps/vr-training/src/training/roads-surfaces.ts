/** Authored receiver heights in metres, including the raised marshal refuge pads.
 * Carriageway .07; kerb .27; pavement .41; refuge pads .465. Small contact bias
 * prevents wet-road z fighting. Placement/scoring continues to use plan X/Z/yaw.
 */
export function roadsPropHeight(x:number,z:number):number {
  const across=Math.abs(z);
  if(z>=4.1&&z<=5.3&&((x>=2.8&&x<=6)||(x>=20.4&&x<=23.6)))return .47;
  return across>=3.805?.42:across>3.5?.28:.07;
}

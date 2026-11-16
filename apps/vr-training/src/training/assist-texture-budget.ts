/** Text retains its current texel density. A decoration with no text needs far less. */
export const ASSIST_TEXT_DENSITY=2400;
export const ASSIST_DECORATION_DENSITY=96;
export function assistCanvasSize(widthM:number,heightM:number,density=ASSIST_TEXT_DENSITY):{width:number;height:number}{
  if(![widthM,heightM,density].every(v=>Number.isFinite(v)&&v>0))throw Error('Finite positive card dimensions and density required.');
  return {width:Math.max(1,Math.min(2048,Math.round(widthM*density))),height:Math.max(1,Math.min(2048,Math.round(heightM*density)))};
}
/** RGBA8 including all generated mip levels. */
export function assistCanvasBytes(width:number,height:number):number{
  let bytes=0;
  do{bytes+=width*height*4;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}while(true);
  return bytes;
}

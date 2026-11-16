import {SessionMode,type WorldOptions} from '@iwsdk/core';
export function isRoomEntry(search:string):boolean{return new URLSearchParams(search).get('mode')==='assist';}
/** Keep the generated project options whole; adjust only the requested session policy. */
export function configureRoomEntry(options:WorldOptions,search:string):boolean {
  if(!isRoomEntry(search))return false;
  if(options.xr===false)throw new Error('Room mode needs WebXR enabled.');
  options.xr??={};options.xr.sessionMode=SessionMode.ImmersiveAR;options.xr.features??={};
  options.xr.features.handTracking=true;options.xr.features.planeDetection=true;options.xr.features.anchors=true;
  options.features??={};options.features.locomotion=false;
  return true;
}

/** One reserved row below every guide's procedure controls. Metres, before root scale. */
export const ROOM_CONTROLS = [
  {action:'room-pin',label:'Pin beside job',w:.2,x:-.12,y:-.31},
  {action:'room-follow',label:'Follow view',w:.2,x:.12,y:-.31},
  {action:'room-floor-down',label:'Floor -',w:.09,x:.28,y:-.31},
  {action:'room-floor-up',label:'Floor +',w:.09,x:.39,y:-.31},
] as const;
/** Both an explicit capture choice and the actual emulator must be present. */
export function useEmulatorRoom(search:string,emulatorPresent:boolean):boolean {
  const params=new URLSearchParams(search);
  return emulatorPresent&&params.get('mode')==='assist'&&params.get('captureRoom')==='1';
}

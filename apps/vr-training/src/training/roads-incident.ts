import { ROADS_STAGING } from './roads-staging';
/** Simulated dispatch only. All decisions concern the scene; no person or media is stored. */
export type RainPhase = 'refuge' | 'radio' | 'traffic' | 'tape' | 'assist' | 'record' | 'schedule' | 'ready';
export type RainEvent = 'incident:refuge' | 'incident:radio' | 'incident:tape' | 'incident:assist' | 'incident:record' | 'incident:schedule' | 'incident:enter-lane';
export const RAIN_STEPS: Readonly<Record<RainPhase, {title:string;instruction:string;action:string}>> = {
  refuge:{title:'Taxi strike / stay safe',instruction:'Rain conceals the pothole. Stay in the kerb refuge. Check escape route, traffic and overhead lines.',action:'Refuge checked'},
  radio:{title:'Call control',instruction:'Control, Roads 3. Taxi tyre damaged. Request upstream traffic protection. No crew in a live lane.',action:'Radio control'},
  traffic:{title:'Protect the approach',instruction:'Park upstream, warn drivers, build the taper and protect both stop/go marshals. Zone check before cordoning.',action:'Set the traffic zone'},
  tape:{title:'Cordon the hazard',instruction:'From the protected side, pinch the tape reel. Stretch to the next barrier and release to tie. Tape supplements rigid barriers.',action:'Place hazard tape'},
  assist:{title:'Check the motorist',instruction:'Approach only within protection. Ask about injuries, request EMS when needed. Keep everyone behind the barrier.',action:'Motorist / EMS check'},
  record:{title:'Incident job card',instruction:'Record tyre damage, rain-hidden depth, protection and EMS decision. This drill stores structured checks; no photos or personal data.',action:'Log site checks'},
  schedule:{title:'Schedule the repair',instruction:'Keep the closure. Assign cut, clean, tack, fill, compact and reopen inspection to an authorised repair crew.',action:'Schedule repair'},
  ready:{title:'Protected / observe traffic',instruction:'Zone clear. Run traffic and watch the stop/go marshals. The authorised supervisor decides when a real road reopens.',action:'Run traffic'},
};
export function nextRainPhase(phase:RainPhase,event:RainEvent,zoneClear:boolean):RainPhase|undefined {
  if(event==='incident:enter-lane')return undefined;
  if(event===`incident:${phase}`&&phase!=='traffic'&&phase!=='tape'&&phase!=='ready')
    return ({refuge:'radio',radio:'traffic',assist:'record',record:'schedule',schedule:'ready'} as const)[phase];
  if(phase==='tape'&&event==='incident:tape'&&zoneClear)return 'assist';
  return undefined;
}
export interface IncidentPose {x:number;z:number;yaw:number;roll:number;hazards:boolean;stage:'approach'|'strike'|'limp'|'shoulder'}
/** One non-graphic tyre/rim strike, then a controlled limp to a protected shoulder. */
export function samplePotholeIncident(seconds:number,out:IncidentPose):void {
  const t=Math.max(0,seconds);
  // Continue straight beyond the protected work area before turning into the
  // clear downstream bay. The old diagonal swept the barrier and marshal.
  const end=ROADS_STAGING.casualtyBay;
  const turn=Math.max(0,Math.min(1,(t-8)/5));
  const blend=turn*turn*(3-2*turn);
  out.x=t<4?-15+t*7:t<8?13+(t-4)*3.75:28+(end.x-28)*turn;
  out.z=t<8?1.65:1.65+(end.z-1.65)*blend;
  out.yaw=t<8?Math.PI/2:Math.PI/2-Math.atan2((end.z-1.65)*6*turn*(1-turn),end.x-28);

  out.roll=t>=4&&t<4.55?Math.sin((t-4)*Math.PI/.55)*.09:t>=4?.025:0;
  out.hazards=t>=4;out.stage=t<4?'approach':t<4.55?'strike':t<13?'limp':'shoulder';
}
/** Only physical protected-side anchors count, at full scale; maximum 4m seated teleport segment. */
export function validTapeSpan(ax:number,az:number,bx:number,bz:number):boolean {
  return [ax,az,bx,bz].every(Number.isFinite)&&Math.hypot(ax-bx,az-bz)>=.8&&Math.hypot(ax-bx,az-bz)<=4
    && az>=3.4&&bz>=3.4&&ax>=7&&ax<=19&&bx>=7&&bx<=19;
}

/** Match the authored 7 cm carriageway and 42 cm raised rank pavement. */
export function incidentRoadHeight(z:number):number {return .07+.35*Math.max(0,Math.min(1,(z-3.45)/.6));}

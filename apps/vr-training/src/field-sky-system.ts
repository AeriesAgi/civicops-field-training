import { Fog, createSystem } from '@iwsdk/core';
import { TrainingSession } from './training-components.js';
import { FIELD_SKY, FIRE_SKY, isFieldModule } from './training/field-sky.js';

/** Outdoor HDRI is scene-authored; this shared system adds atmospheric depth. */
export class FieldSkySystem extends createSystem({ session: { required: [TrainingSession] } }) {
  private readonly fog = new Fog(FIELD_SKY.fog, FIELD_SKY.fogNear, FIELD_SKY.fogFar);
  private outdoor = false;
  private night = false;
  private storm=false;
  private wetWeather=new URLSearchParams(location.search).get('weather')!=='clear';
  init():void {const weather=(event:Event)=>{this.wetWeather=(event as CustomEvent<string>).detail!=='clear';};window.addEventListener('civicops:weather',weather);this.cleanupFuncs.push(()=>window.removeEventListener('civicops:weather',weather));}
  update(): void {
    const moduleId = (window as unknown as { civicOpsModule?: string }).civicOpsModule;
    const outdoor = isFieldModule(moduleId);
    const night = moduleId === 'scene-safety' || moduleId === 'field-assist';
    const storm=moduleId==='roads-zone'&&this.wetWeather;
    if (storm===this.storm && outdoor === this.outdoor && night === this.night) return;
    this.storm=storm;this.fog.near=storm?18:FIELD_SKY.fogNear;this.fog.far=storm?68:FIELD_SKY.fogFar;
    this.outdoor = outdoor; this.night = night;
    this.fog.color.set(storm?'#88979e':night ? FIRE_SKY.fog : FIELD_SKY.fog);
    this.world.scene.fog = outdoor ? this.fog : null;
  }
}

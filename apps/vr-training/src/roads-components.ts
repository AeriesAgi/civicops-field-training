import { createComponent, Types } from '@iwsdk/core';

/** Structured situational simulation only; no media or identifying data. */
export const RoadsTarget = createComponent('RoadsTarget', {
  kind: { type: Types.String, default: 'cone' },
  partId: { type: Types.String, default: '' },
});
export const RoadsSession = createComponent('RoadsSession', {
  crewDispatch: {type:Types.String,default:'standby'},
  incidentStage: {type:Types.String,default:'approach'},
  incidentStep: { type: Types.String, default: '' },
  step: { type: Types.String, default: 'park-vehicle' },
  complete: { type: Types.Boolean, default: false },
  failed: { type: Types.Boolean, default: false },
  score: { type: Types.Float32, default: 100 },
  speedLimit: { type: Types.Int32, default: 60 },
  placed: { type: Types.Int32, default: 0 },
  zoneGood: { type: Types.Boolean, default: false },
  running: { type: Types.Boolean, default: false },
  trafficReaction: { type: Types.String, default: 'waiting' },
  lastFeedback: { type: Types.String, default: '' },
});

export const RoadsTape = createComponent('RoadsTape', {});

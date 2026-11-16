import { createComponent, Types } from '@iwsdk/core';

/** Water targets remain module-local; the shared engine consumes the reducer outcomes. */
export const WaterTarget = createComponent('WaterTarget', {
  kind: { type: Types.String, default: 'button' },
  valve: { type: Types.String, default: '' },
  action: { type: Types.String, default: '' },
  snapped: { type: Types.Boolean, default: false },
});

/** Observable structured simulation state, with no captured media or identities. */
export const WaterSession = createComponent('WaterSession', {
  step: { type: Types.String, default: 'make-area-safe' },
  complete: { type: Types.Boolean, default: false },
  failed: { type: Types.Boolean, default: false },
  score: { type: Types.Float32, default: 100 },
  pressureBar: { type: Types.Float32, default: 4 },
  flow: { type: Types.Float32, default: 1 },
  turnsA: { type: Types.Float32, default: 0 },
  turnsB: { type: Types.Float32, default: 0 },
  turnsC: { type: Types.Float32, default: 0 },
  turnsD: { type: Types.Float32, default: 0 },
  keyValve: { type: Types.String, default: '' },
  lastAction: { type: Types.String, default: '' },
  lastFeedback: { type: Types.String, default: '' },
  drawCalls: { type: Types.Int32, default: 0 },
  peakDrawCalls: { type: Types.Int32, default: 0 },
  triangles: { type: Types.Int32, default: 0 },
  peakTriangles: { type: Types.Int32, default: 0 },
});

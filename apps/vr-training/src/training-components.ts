import { createComponent, Types } from '@iwsdk/core';

/** Scene-authored target data shared by the runtime and editor. */
export const TrainingTarget = createComponent('TrainingTarget', {
  kind: { type: Types.String, default: 'button' },
  action: { type: Types.String, default: '' },
  active: { type: Types.Boolean, default: true },
  snapped: { type: Types.Boolean, default: false },
  highlighted: { type: Types.Boolean, default: false },
});

export const TrainingSession = createComponent('TrainingSession', {
  step: { type: Types.String, default: 'identify-circuit' },
  complete: { type: Types.Boolean, default: false },
  failed: { type: Types.Boolean, default: false },
  score: { type: Types.Float32, default: 100 },
  hints: { type: Types.Int16, default: 0 },
  lastAction: { type: Types.String, default: '' },
  // Dev-only renderer evidence; never copied into training attempt contracts.
  drawCalls: { type: Types.Int32, default: 0 },
  peakDrawCalls: { type: Types.Int32, default: 0 },
  peakTriangles: { type: Types.Int32, default: 0 },
  safeHoldProgress: { type: Types.Float32, default: 0 },
  triangles: { type: Types.Int32, default: 0 },
  textures: { type: Types.Int16, default: 0 },
  rendererFps: { type: Types.Float32, default: 0 },
  // Inspector evidence for hand-contact calibration; no extra scene objects.
  leftIndexTip: { type: Types.Vec3, default: [-100, -100, -100] },
  rightIndexTip: { type: Types.Vec3, default: [-100, -100, -100] },
});

/** First-use and return-loop evidence, readable through the managed ECS bridge. */
export const FirstMinutes = createComponent('FirstMinutes', {
  phase: { type: Types.String, default: 'raise-hands' },
  demo: { type: Types.String, default: '' },
  xrEntryMs: { type: Types.Float64, default: 0 },
  firstActionMs: { type: Types.Float64, default: -1 },
  firstLock: { type: Types.Boolean, default: false },
  dailySeed: { type: Types.Float64, default: 0 },
});

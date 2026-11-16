import { createComponent, Types } from '@iwsdk/core';

/** Object and situation targets only. No person identity and no media. */
export const SceneSafetyTarget = createComponent('SceneSafetyTarget', {
  kind: { type: Types.String, default: 'cone' },
  partId: { type: Types.String, default: '' },
});

export const SceneSafetySession = createComponent('SceneSafetySession', {
  step: { type: Types.String, default: 'place-blocker' },
  complete: { type: Types.Boolean, default: false },
  failed: { type: Types.Boolean, default: false },
  score: { type: Types.Float32, default: 100 },
  found: { type: Types.Int32, default: 0 },
  tagged: { type: Types.Int32, default: 0 },
  lastFeedback: { type: Types.String, default: '' },
});

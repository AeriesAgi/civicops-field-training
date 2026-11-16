import { createComponent, Types } from '@iwsdk/core';

/** A pokeable/pinchable on-site assist control. Actions only; no person or media data. */
export const FieldAssistTarget = createComponent('FieldAssistTarget', {
  action: { type: Types.String, default: '' },
});

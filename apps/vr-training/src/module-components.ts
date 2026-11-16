import { createComponent, Types } from '@iwsdk/core';

/** Offline department board state, shared by the runtime and editor. */
export const ModuleBoard = createComponent('ModuleBoard', {
  selected: { type: Types.String, default: 'elec-loto' },
  status: { type: Types.String, default: 'board' },
  message: { type: Types.String, default: '' },
});

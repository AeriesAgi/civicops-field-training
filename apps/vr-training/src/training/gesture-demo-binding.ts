import type { DemoGesture } from './gesture-feedback.js';
import type { StepId } from './procedure.js';

/** Gesture replay teaches tool handling; it never demonstrates bare-hand testing. */
export type GestureDemoSceneObject =
  | 'breaker-sl-3' | 'padlock' | 'danger-tag' | 'voltage-tester' | 'controls-panel';

export interface GestureDemoBinding {
  readonly gesture: DemoGesture;
  readonly sceneObject: GestureDemoSceneObject;
  readonly uiElementId?: 'notify-control' | 'safe-to-work';
}

const testerBinding: GestureDemoBinding = Object.freeze({
  gesture: 'pinch-grab', sceneObject: 'voltage-tester',
});

/** Exhaustive step coverage; scene/contact-procedure targets are deliberately separate. */
export const GESTURE_DEMO_BINDINGS: Readonly<Record<StepId, GestureDemoBinding>> = Object.freeze({
  'identify-circuit': { gesture: 'poke', sceneObject: 'breaker-sl-3' },
  'notify-control': { gesture: 'poke', sceneObject: 'controls-panel', uiElementId: 'notify-control' },
  'switch-off': { gesture: 'poke', sceneObject: 'breaker-sl-3' },
  'apply-lock': { gesture: 'pinch-grab', sceneObject: 'padlock' },
  'apply-tag': { gesture: 'pinch-grab', sceneObject: 'danger-tag' },
  'try-start': { gesture: 'poke', sceneObject: 'breaker-sl-3' },
  'prove-tester': testerBinding,
  'test-dead': testerBinding,
  're-prove-tester': testerBinding,
  'safe-to-work': { gesture: 'hold-to-confirm', sceneObject: 'controls-panel', uiElementId: 'safe-to-work' },
});

const bindingLookup: ReadonlyMap<string, GestureDemoBinding> = new Map(Object.entries(GESTURE_DEMO_BINDINGS));

/** Shared TrainingStep ids are strings; unknown/finished ids use a safe breaker demo. */
export function gestureDemoBinding(step: string | null | undefined): GestureDemoBinding {
  return (step == null ? undefined : bindingLookup.get(step)) ?? GESTURE_DEMO_BINDINGS['identify-circuit'];
}

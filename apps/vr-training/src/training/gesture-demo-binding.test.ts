import { describe, expect, it } from 'vitest';
import { GESTURE_DEMO_BINDINGS, gestureDemoBinding } from './gesture-demo-binding.js';
import { elecLotoModule } from './modules/elec-loto.js';
import type { StepId } from './procedure.js';

describe('safe generic step gesture replays', () => {
  it('covers every procedure step exactly once with a stable cached binding', () => {
    expect(Object.keys(GESTURE_DEMO_BINDINGS).sort()).toEqual(elecLotoModule.steps.map(step => step.id).sort());
    for (const { id } of elecLotoModule.steps) {
      expect(gestureDemoBinding(id as StepId)).toBe(GESTURE_DEMO_BINDINGS[id as StepId]);
    }
  });
  it('accepts shared string step IDs and safely falls back for unknown or finished states', () => {
    const sharedStepId: string = 'test-dead';
    expect(gestureDemoBinding(sharedStepId)).toBe(GESTURE_DEMO_BINDINGS['test-dead']);
    for (const id of ['', 'finished', 'unknown-step', 'touch-terminals', '__proto__', 'constructor', null, undefined]) {
      expect(gestureDemoBinding(id)).toBe(GESTURE_DEMO_BINDINGS['identify-circuit']);
    }
  });
  it('pokes the actual breaker for identification and switching', () => {
    for (const id of ['identify-circuit', 'switch-off'] as const) {
      expect(gestureDemoBinding(id)).toEqual({ gesture: 'poke', sceneObject: 'breaker-sl-3' });
    }
  });
  it('anchors notification and deliberate confirmation at their actual UI buttons', () => {
    expect(gestureDemoBinding('notify-control')).toEqual({ gesture: 'poke', sceneObject: 'controls-panel', uiElementId: 'notify-control' });
    expect(gestureDemoBinding('safe-to-work')).toEqual({ gesture: 'hold-to-confirm', sceneObject: 'controls-panel', uiElementId: 'safe-to-work' });
  });
  it('pinches the actual personal lock and danger tag instead of their mounting seats', () => {
    expect(gestureDemoBinding('apply-lock')).toEqual({ gesture: 'pinch-grab', sceneObject: 'padlock' });
    expect(gestureDemoBinding('apply-tag')).toEqual({ gesture: 'pinch-grab', sceneObject: 'danger-tag' });
  });
  it('replays a safe tester pinch for prove, dead-test and re-prove steps', () => {
    for (const id of ['prove-tester', 'test-dead', 're-prove-tester'] as const) {
      expect(gestureDemoBinding(id)).toEqual({ gesture: 'pinch-grab', sceneObject: 'voltage-tester' });
      expect(gestureDemoBinding(id)).toBe(gestureDemoBinding('prove-tester'));
    }
  });
  it('never targets exposed terminals or a proving-unit contact with a ghost hand', () => {
    for (const binding of Object.values(GESTURE_DEMO_BINDINGS)) {
      expect(['terminals', 'proving-unit', 'LineContact', 'NeutralContact', 'KnownLiveContact']).not.toContain(binding.sceneObject);
    }
  });
});

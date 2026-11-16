import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { applyModuleAccessibility } from '../module-accessibility';
import { DEFAULT_SETTINGS } from './accessibility-settings';

function fakePanel() {
  const props: Record<string, Record<string, unknown>> = {};
  return { props, panel: { getElementById: (id: string) => ({ setProperties: (p: Record<string, unknown>) => { props[id] = { ...props[id], ...p }; } }) } };
}

describe('module accessibility wiring', () => {
  it('scales captions, applies contrast and swaps panels for left hand', () => {
    const steps = fakePanel(); const controls = fakePanel();
    const panels = new Map([['steps', steps.panel], ['controls', controls.panel]]) as never;
    const a = new Object3D(); a.position.set(-1, 1, 0); const b = new Object3D(); b.position.set(1, 1, 0);
    applyModuleAccessibility({ ...DEFAULT_SETTINGS, captionSize: 'XL', highContrast: true, leftHanded: true }, { panels, captionPanel: 'steps', captionFontSize: 2.7, captionHeight: 12.8, steps: a, controls: b });
    expect(steps.props.caption).toMatchObject({ fontSize: 2.7 * 1.5, height: 12.8 * 2.25 });
    expect(controls.props['panel-root']).toMatchObject({ backgroundColor: '#ffffff', color: '#000000' });
    expect(a.position.x).toBe(1); expect(b.position.x).toBe(-1);
  });
  it('defaults leave layout alone and hides captions only when turned off', () => {
    const steps = fakePanel();
    const panels = new Map([['steps', steps.panel]]) as never;
    applyModuleAccessibility({ ...DEFAULT_SETTINGS }, { panels, captionPanel: 'steps', captionFontSize: 2.7 });
    expect(steps.props.caption).toEqual({ fontSize: 2.7 });
    expect(steps.props['panel-root']).toBeUndefined();
    applyModuleAccessibility({ ...DEFAULT_SETTINGS, captions: false }, { panels, captionPanel: 'steps', captionFontSize: 2.7 });
    expect(steps.props.caption).toMatchObject({ display: 'none' });
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { SeatedPanelRig } from '../seated-panel-rig';
import { DEFAULT_SETTINGS } from './accessibility-settings';
import { workingShoulder } from './seated-reach';

const settings = { ...DEFAULT_SETTINGS };
function scene(eye: number) {
  const root = new Object3D(); const origin = new Object3D(); const head = new Object3D();
  origin.add(head); root.add(origin); head.position.set(0, eye, 0);
  const session = new Object3D(); session.position.set(5, 0, -2); root.add(session);
  const steps = new Object3D(); steps.position.set(-.22, 1.23, -.85); const controls = new Object3D(); controls.position.set(.22, 1.23, -.85);
  const handover = new Object3D(); handover.position.set(0, 1.4, -.9); controls.scale.setScalar(1.15);
  session.add(steps, controls, handover);
  root.updateMatrixWorld(true);
  return { root, origin, head, steps, controls, handover, rig: new SeatedPanelRig({ steps: [steps], controls: [controls, handover] }) };
}
const worldOf = (o: Object3D) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new Vector3()); };

describe('seated panel rig', () => {
  it('brings both panels and the shared controls slot into seated reach', () => {
    const s = scene(1.2);
    expect(s.rig.update(s.origin, s.head, settings)).toBe(true);
    expect(s.rig.seated).toBe(true);
    const shoulder = workingShoulder({ x: 0, y: 1.2, z: 0 }, 0, false);
    for (const panel of [s.controls, s.handover]) expect(worldOf(panel).distanceTo(new Vector3(shoulder.x, shoulder.y, shoulder.z))).toBeLessThan(settings.reachM);
    expect(worldOf(s.steps).x).toBeLessThan(0); expect(worldOf(s.controls).x).toBeGreaterThan(0);
    // The XL controls enlargement is kept, then shrunk with the tray.
    expect(s.controls.scale.x).toBeCloseTo(1.15 * 0.75, 9);
  });
  it('follows a teleport and restores the authored layout when the trainee stands', () => {
    const s = scene(1.2);
    s.rig.update(s.origin, s.head, settings);
    s.origin.position.set(3, 0, 1); s.root.updateMatrixWorld(true);
    expect(s.rig.update(s.origin, s.head, settings)).toBe(false);
    expect(worldOf(s.controls).x).toBeGreaterThan(3);
    s.head.position.y = 1.65; s.root.updateMatrixWorld(true);
    expect(s.rig.update(s.origin, s.head, settings)).toBe(true);
    expect(s.rig.seated).toBe(false);
    expect(s.controls.position.toArray()).toEqual([.22, 1.23, -.85]);
    expect(s.controls.scale.x).toBeCloseTo(1.15, 9);
  });
  it('leaves a standing trainee untouched', () => {
    const s = scene(1.65);
    expect(s.rig.update(s.origin, s.head, settings)).toBe(false);
    expect(s.steps.position.toArray()).toEqual([-.22, 1.23, -.85]);
  });
  it('is wired into Water, Roads and Fire with their controls-slot panels', () => {
    const water = readFileSync('src/water-training-system.ts', 'utf8');
    const roads = readFileSync('src/roads-training-system.ts', 'utf8');
    const fire = readFileSync('src/scene-safety-training-system.ts', 'utf8');
    expect(water).toMatch(/new SeatedPanelRig\(\{ steps: \[this\.panels\.get\('steps'\)!\], controls: \[this\.panels\.get\('controls'\)!, this\.panels\.get\('network'\)!\] \}\)/);
    expect(water).toMatch(/if \(this\.seatedRig\.update\(this\.player, this\.player\.head, this\.a11y\)\) this\.panelAnchorReady = false;\s*if \(!this\.seatedRig\.seated\) this\.syncPanelAnchor\(\);/);
    expect(roads).toMatch(/new SeatedPanelRig\(\{steps:\[this\.panels\.get\('steps'\)!\],controls:\[this\.panels\.get\('controls'\)!\]\}\)/);
    expect(roads).toMatch(/this\.seatedRig\.update\(this\.player,this\.player\.head,this\.a11y\)/);
    expect(fire).toMatch(/new SeatedPanelRig\(\{ steps: \[this\.panels\.get\('steps'\)!\], controls: \[this\.panels\.get\('controls'\)!, this\.panels\.get\('handover'\)!\] \}\)/);
    expect(fire).toMatch(/this\.seatedRig\.update\(this\.player, this\.player\.head, this\.a11y\)/);
  });
});

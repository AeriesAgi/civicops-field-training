import { describe, expect, it, vi } from 'vitest';
// The procedural assets only use Three's math/geometry exports. Avoid initialising
// IWSDK's browser-only XR runtime in Node while keeping production imports on core.
vi.mock('@iwsdk/core', async () => await import('three'));
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from '@iwsdk/core';
import { createGestureFeedback, createGhostHand } from '../scene-assets/gesture-feedback';
import { mergeHoverSilhouette } from '../scene-assets/hover-silhouette';

describe('original instructor gesture art', () => {
  it('builds one finite skinned hand with an anatomical articulated hierarchy', () => {
    const hand = createGhostHand();
    expect(hand.root.parent).toBeNull(); expect(hand.root.children).toHaveLength(1);
    expect(hand.mesh.skeleton.bones).toHaveLength(15);
    expect(hand.fingers).toHaveLength(4); expect(hand.thumb).toHaveLength(2);
    expect(hand.mesh.geometry.index!.count / 3).toBeLessThan(2400);
    const positions = hand.mesh.geometry.getAttribute('position');
    for (const value of positions.array) expect(Number.isFinite(value)).toBe(true);
    const normals = hand.mesh.geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) {
      const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
      expect(length).toBeCloseTo(1, 5);
    }
    hand.mesh.geometry.dispose(); hand.mesh.material.dispose(); hand.mesh.skeleton.dispose();
  });
  it('merges real visible source surfaces in the original object coordinate frame', () => {
    const source = new Group(); source.position.set(3, 2, 1);
    const mesh = new Mesh(new BoxGeometry(.04, .06, .02), new MeshBasicMaterial());
    mesh.position.set(.02, .03, -.01); source.add(mesh);
    const silhouette = mergeHoverSilhouette(source); silhouette.computeBoundingBox();
    expect(silhouette.boundingBox!.min.x).toBeCloseTo(0);
    expect(silhouette.boundingBox!.max.y).toBeCloseTo(.06);
    expect(silhouette.index!.count).toBe(mesh.geometry.index!.count);
    silhouette.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
  });
  it('skips the demo instantly and completes contact springback without keeping effects alive', () => {
    const feedback = createGestureFeedback(); const target = new Vector3(0, 1, -.4);
    feedback.showDemo('poke', target); feedback.update(1.2);
    expect(feedback.root.getObjectByName('InstructorGhostHand')!.visible).toBe(true);
    feedback.hideDemo(); expect(feedback.root.getObjectByName('InstructorGhostHand')!.visible).toBe(false);
    const pressure = vi.fn(); feedback.contact(target, undefined, pressure);
    expect(pressure).toHaveBeenLastCalledWith(1);
    feedback.update(.4); expect(pressure).toHaveBeenLastCalledWith(0);
    expect(feedback.root.getObjectByName('PokeContactRipple')!.visible).toBe(false);
    feedback.unsafe(target); feedback.update(2.3);
    expect(feedback.root.getObjectByName('CalmSafetyPulse')!.visible).toBe(false);
    feedback.dispose();
  });
  it('shows bench pinch demos above/back of the tray and reaches the actual prop top', () => {
    const feedback = createGestureFeedback(), target = new Vector3(-.24, .765, -.06);
    feedback.showDemo('pinch-grab', target); feedback.update(0);
    const ghost = feedback.root.getObjectByName('InstructorGhostHand')!;
    expect(ghost.position.y).toBeCloseTo(target.y + .24);
    expect(ghost.position.z).toBeCloseTo(target.z - .12);
    expect(ghost.rotation.x).toBeCloseTo(Math.PI);
    feedback.update(1.3); ghost.updateMatrixWorld(true);
    const tip = new Vector3(0, .023, 0);
    ghost.getObjectByName('GhostIndex2')!.localToWorld(tip);
    expect(tip.x).toBeCloseTo(target.x, 4);
    expect(tip.y - target.y).toBeGreaterThan(.04);
    expect(tip.y - target.y).toBeLessThan(.055);
    expect(tip.z - target.z).toBeGreaterThan(0);
    expect(tip.z - target.z).toBeLessThan(.012);
    feedback.dispose();
  });
  it('preserves board poke/hold approaches and high-source placement demonstrations', () => {
    const feedback = createGestureFeedback(), board = new Vector3(.045, 1.15, -.438);
    const ghost = feedback.root.getObjectByName('InstructorGhostHand')!;
    for (const gesture of ['poke', 'hold-to-confirm', 'place'] as const) {
      feedback.showDemo(gesture, board); feedback.update(1.3);
      expect(ghost.position.y).toBeCloseTo(board.y);
      expect(ghost.position.z).toBeCloseTo(board.z + .161);
      expect(ghost.rotation.x).toBeCloseTo(-Math.PI / 2);
    }
    const tray = new Vector3(-.24, .765, -.06);
    feedback.showDemo('poke', tray); feedback.update(1.3);
    expect(ghost.position.y).toBeCloseTo(tray.y);
    expect(ghost.rotation.x).toBeCloseTo(-Math.PI / 2);
    feedback.dispose();
  });
  it('lifts a bench-start place demo while following the real snap destination', () => {
    const feedback = createGestureFeedback();
    feedback.showDemo('place', new Vector3(-.24, .765, -.06), new Vector3(0, .985, -.425));
    feedback.update(1.3);
    const ghost = feedback.root.getObjectByName('InstructorGhostHand')!;
    expect(ghost.position.x).toBeCloseTo(.025);
    expect(ghost.position.y).toBeCloseTo(.985 + .18);
    expect(ghost.position.z).toBeCloseTo(-.425 - .045);
    feedback.dispose();
  });
  it('resets unsafe/contact feedback immediately and restores a depressed control once', () => {
    const feedback = createGestureFeedback(), pressure = vi.fn();
    const target = new Vector3(0, 1, -.4);
    feedback.showDemo('hold-to-confirm', target);
    feedback.contact(target, undefined, pressure); feedback.unsafe(target);
    feedback.update(.05); feedback.reset();
    expect(pressure).toHaveBeenLastCalledWith(0);
    const restoredCalls = pressure.mock.calls.length;
    feedback.update(.1); feedback.update(1);
    expect(pressure).toHaveBeenCalledTimes(restoredCalls);
    for (const name of ['InstructorGhostHand', 'HoldDemoProgress', 'PokeContactRipple', 'CalmSafetyPulse']) {
      expect(feedback.root.getObjectByName(name)!.visible).toBe(false);
    }
    feedback.dispose();
  });
  it('reuses cached hover geometry and shows a prop-shaped snap ghost', () => {
    const feedback = createGestureFeedback();
    const tool = new Mesh(new BoxGeometry(.04, .06, .02), new MeshBasicMaterial());
    const target = new Vector3(0, 1, -.4), size = new Vector3(.04, .06, .02);
    feedback.prepareHover(tool); feedback.showHover(target, size, tool);
    const outline = feedback.root.getObjectByName('PinchReadyContour') as Mesh;
    const geometry = outline.geometry;
    for (let i = 0; i < 10; i++) { feedback.update(.016); feedback.showHover(target, size, tool); }
    expect(outline.geometry).toBe(geometry);
    feedback.showSnap(target, size, tool);
    expect(feedback.root.getObjectByName('MagnetObjectSilhouette')!.visible).toBe(true);
    feedback.hideSnap(); expect(feedback.root.getObjectByName('MagnetObjectSilhouette')!.visible).toBe(false);
    feedback.dispose(); tool.geometry.dispose(); tool.material.dispose();
  });
});

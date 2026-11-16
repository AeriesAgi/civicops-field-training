import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { ModuleDwell } from '../module-dwell';
import { DWELL_MS } from './accessibility-settings';
import { dwellMsFor, dwellToggleLabel, gazeDistance, pickGazeTarget, type GazePlane } from './gaze-dwell';

const plane = (id: string, z: number, x = 0): GazePlane => ({ id, center: { x, y: 0, z }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, halfWidth: .07, halfHeight: .03 });
const origin = { x: 0, y: 0, z: 0 }, ahead = { x: 0, y: 0, z: -1 };

describe('gaze dwell picking', () => {
  it('hits a button face straight ahead and misses beside or behind it', () => {
    expect(gazeDistance(origin, ahead, plane('a', -.5))).toBeCloseTo(.5, 9);
    expect(gazeDistance(origin, ahead, plane('a', -.5, .2))).toBeUndefined();
    expect(gazeDistance(origin, ahead, plane('a', .5))).toBeUndefined();
  });
  it('picks the nearest of overlapping buttons, and nothing when the gaze is clear', () => {
    expect(pickGazeTarget(origin, ahead, [plane('far', -.9), plane('near', -.4)])).toBe('near');
    expect(pickGazeTarget(origin, ahead, [plane('side', -.5, .3)])).toBe('');
  });
  it('needs twice as long for reset, leaving the job, unsafe entry and pre-shift answers', () => {
    expect(dwellMsFor('hint')).toBe(DWELL_MS);
    for (const id of ['reset', 'incident-unsafe', 'jobs-lesson', 'handover-jobs', 'programme-choice-1']) expect(dwellMsFor(id)).toBe(DWELL_MS * 2);
    expect(dwellToggleLabel(true)).toBe('Dwell: on'); expect(dwellToggleLabel(false)).toBe('Dwell: off');
  });
});

function rig() {
  const head = new Object3D(); const root = new Object3D(); root.position.set(0, 0, -.5);
  const button = Object.assign(new Object3D(), { size: { value: [14, 6] }, isVisible: { value: true }, props: {} as Record<string, unknown>, setProperties(p: Record<string, unknown>) { Object.assign(this.props, p); } });
  root.add(button); head.updateMatrixWorld(true); root.updateMatrixWorld(true);
  return { head, root, button };
}

describe('module dwell', () => {
  it('presses a gazed button once after the dwell time and shows progress', () => {
    const { head, root, button } = rig(); const dwell = new ModuleDwell(); let presses = 0;
    dwell.register('hint', button, root, () => { presses += 1; });
    expect(dwell.tick(true, head, 0)).toBeUndefined();
    dwell.tick(true, head, DWELL_MS / 2); expect(dwell.progress).toBeCloseTo(.5, 9);
    expect(button.props.transformScaleX).toBeCloseTo(1.04, 9);
    expect(dwell.tick(true, head, DWELL_MS)).toBe('hint');
    dwell.tick(true, head, DWELL_MS * 3);
    expect(presses).toBe(1);
  });
  it('does nothing when dwell is off, the button is hidden, or it was unregistered', () => {
    const { head, root, button } = rig(); const dwell = new ModuleDwell(); let presses = 0;
    const off = dwell.register('hint', button, root, () => { presses += 1; });
    dwell.tick(false, head, 0); dwell.tick(false, head, DWELL_MS * 2);
    button.isVisible.value = false; dwell.tick(true, head, 0); dwell.tick(true, head, DWELL_MS * 2);
    button.isVisible.value = true; off(); dwell.tick(true, head, 0); dwell.tick(true, head, DWELL_MS * 2);
    expect(presses).toBe(0);
  });
  it('counts buttons inside layout rows that UIKit marks as not needing render traversal', () => {
    const head = new Object3D(); const root = new Object3D(); root.position.set(0, 0, -.5);
    const row = new Object3D(); row.visible = false;
    const button = Object.assign(new Object3D(), { size: { value: [14, 6] }, isVisible: { value: true }, setProperties() {} });
    root.add(row); row.add(button); root.updateMatrixWorld(true);
    const dwell = new ModuleDwell(); let presses = 0;
    dwell.register('hint', button, root, () => { presses += 1; });
    dwell.tick(true, head, 0); dwell.tick(true, head, DWELL_MS);
    expect(presses).toBe(1);
    root.visible = false; dwell.tick(true, head, 0); dwell.tick(true, head, DWELL_MS * 3);
    expect(presses).toBe(1);
  });
  it('holds a reset for the longer dwell', () => {
    const { head, root, button } = rig(); const dwell = new ModuleDwell(); let presses = 0;
    dwell.register('reset', button, root, () => { presses += 1; });
    dwell.tick(true, head, 0); dwell.tick(true, head, DWELL_MS * 1.5); expect(presses).toBe(0);
    dwell.tick(true, head, DWELL_MS * 2); expect(presses).toBe(1);
  });
  it('is wired into every module and the work-order board', () => {
    for (const file of ['training-system.ts', 'water-training-system.ts', 'roads-training-system.ts', 'scene-safety-training-system.ts', 'module-board-system.ts']) {
      const source = readFileSync(`src/${file}`, 'utf8').replace(/\s+/g, ' ');
      expect(source, file).toMatch(/private readonly dwell ?= ?new ModuleDwell\(\)/);
      expect(source, file).toMatch(/this\.dwell\.register\(id, ?element,/);
      expect(source, file).toMatch(/this\.dwell\.tick\(this\.a11y\.dwellSelect/);
    }
    const board = readFileSync('src/module-board-system.ts', 'utf8');
    expect(board).toMatch(/this\.bind\('dwell-toggle', \(\) => this\.toggleDwell\(\)\)/);
    expect(board).toMatch(/saveSettings\(browserStorage\(\), \{ \.\.\.current, dwellSelect: !current\.dwellSelect \}\)/);
    expect(readFileSync('public/ui/department-board.uikitml', 'utf8')).toMatch(/<button id="dwell-toggle" class="mode">Dwell: off<\/button>/);
  });
});

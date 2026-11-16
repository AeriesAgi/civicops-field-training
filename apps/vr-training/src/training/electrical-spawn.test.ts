import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = JSON.parse(readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8'));
const equipment = scene.nodes.find((node: { id: string }) => node.id === 'bench-rig').children;
const position = (id: string): number[] => equipment.find((node: { id: string }) => node.id === id).transform.position;

describe('Electrical cold-start station', () => {
  it('starts facing the full-scale electrical panel within seated reach', () => {
    const [x, , z] = scene.player.transform.position;
    const board = position('distribution-board');
    expect(board[2]).toBeLessThan(z);
    expect(Math.hypot(board[0] - x, board[2] - z)).toBeLessThan(.6);
  });

  it.each(['padlock', 'danger-tag', 'voltage-tester'])('%s starts within 0.6 m of a seated working hand', (id) => {
    const [x, , z] = scene.player.transform.position;
    const tool = position(id);
    expect(Math.hypot(tool[0] - x, tool[1] - 1.05, tool[2] - z)).toBeLessThanOrEqual(.6);
  });
});

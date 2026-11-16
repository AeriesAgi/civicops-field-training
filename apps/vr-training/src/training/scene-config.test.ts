import { readFileSync } from 'node:fs';
import { validateSceneDocument } from '@iwsdk/scene-composition';
import { describe, expect, it } from 'vitest';

describe('authored scene contract', () => {
  it('accepts the complete training scene before the managed app boots', () => {
    const document = JSON.parse(readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8'));
    const validation = validateSceneDocument(document);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('enables SDK fingertip touch for breakers and every interactive panel', () => {
    const document = JSON.parse(readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8'));
    const required = new Set([
      'breaker-sl-1', 'breaker-sl-2', 'breaker-sl-3', 'breaker-sl-4',
      'work-order-panel', 'steps-panel', 'controls-panel', 'settings-toggle-panel',
      'settings-panel', 'results-panel', 'jobs-panel',
    ]);
    const visit = (nodes: { id: string; components: Record<string, unknown>; children?: typeof nodes }[]) => {
      for (const node of nodes) {
        if (required.delete(node.id)) {
          expect(node.components).toHaveProperty('PokeInteractable');
          expect(node.components).toHaveProperty('RayInteractable');
        }
        if (node.children) visit(node.children);
      }
    };
    visit(document.nodes);
    expect([...required]).toEqual([]);
  });
});

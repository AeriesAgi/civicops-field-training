import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadGuidance, type GuidanceStore } from './guidance';
import { chooseGuidance, guidanceToggleLabel, nextGuidance, searchWithoutGuidance } from './guidance-toggle';

function memory(): GuidanceStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

describe('in-headset guidance toggle', () => {
  it('flips between guided practice and unguided assessment', () => {
    expect(nextGuidance('guided')).toBe('unguided');
    expect(nextGuidance('unguided')).toBe('guided');
  });
  it('labels the current mode in plain words', () => {
    expect(guidanceToggleLabel('guided')).toBe('Guided practice');
    expect(guidanceToggleLabel('unguided')).toBe('Unguided assessment');
  });
  it('drops only the guidance parameter from the URL', () => {
    expect(searchWithoutGuidance('?guidance=unguided&department=roads')).toBe('?department=roads');
    expect(searchWithoutGuidance('?department=roads&guidance=guided')).toBe('?department=roads');
    expect(searchWithoutGuidance('?guidance=unguided')).toBe('');
    expect(searchWithoutGuidance('')).toBe('');
    expect(searchWithoutGuidance('?module=water')).toBe('?module=water');
  });
  it('makes the headset choice win over a judge URL in every module that loads next', () => {
    const store = memory();
    expect(loadGuidance(store, '?guidance=unguided')).toBe('unguided');
    const search = chooseGuidance(store, '?guidance=unguided&department=water', 'guided');
    expect(search).toBe('?department=water');
    expect(loadGuidance(store, search)).toBe('guided');
    expect(loadGuidance(store, chooseGuidance(store, search, 'unguided'))).toBe('unguided');
  });
});

describe('guidance toggle wiring', () => {
  const board = readFileSync('src/module-board-system.ts', 'utf8');
  const markup = readFileSync('public/ui/department-board.uikitml', 'utf8');
  it('puts a labelled, pokeable mode button on the work-order board', () => {
    expect(markup).toMatch(/<button id="guidance-toggle" class="mode">Guided practice<\/button>/);
    expect(markup).toMatch(/\.mode \{[^}]*cursor: pointer;/);
    // The board no longer claims seated support it has not proven on a headset.
    expect(markup).not.toContain('HANDS / SEATED');
  });
  it('binds the button to save, clear the URL override and re-voice the pre-shift instructor', () => {
    expect(board).toMatch(/this\.bind\('guidance-toggle', \(\) => this\.toggleGuidance\(\)\)/);
    const method = board.slice(board.indexOf('private toggleGuidance(): void'));
    expect(method).toMatch(/chooseGuidance\(browserStorage\(\), location\.search, this\.guidance\)/);
    expect(method).toMatch(/history\.replaceState/);
    expect(method).toMatch(/this\.preShiftInstructor = createInstructor\([^;]*guidance: this\.guidance/);
    expect(board).toMatch(/this\.text\('guidance-toggle', guidanceToggleLabel\(this\.guidance\)\)/);
    expect(board).toMatch(/civicOpsGuidance = this\.guidance/);
  });
});

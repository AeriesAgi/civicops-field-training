import { describe, expect, it } from 'vitest';
import { DESKTOP_KEYS, DESKTOP_TARGETS, desktopIntent, isDesktopTool, TARGET_LABELS } from './desktop-intents';

describe('desktop click intents', () => {
  it('picks up a tool, and clicking the same tool puts it back', () => {
    expect(desktopIntent('padlock', undefined)).toEqual({ kind: 'pick-up', tool: 'padlock' });
    expect(desktopIntent('danger-tag', 'padlock')).toEqual({ kind: 'pick-up', tool: 'danger-tag' });
    expect(desktopIntent('voltage-tester', 'voltage-tester')).toEqual({ kind: 'put-down' });
  });

  it('places the padlock or tag on SL-3 or its hasp, and refuses the wrong switch', () => {
    expect(desktopIntent('breaker-sl-3', 'padlock')).toEqual({ kind: 'place', tool: 'padlock' });
    expect(desktopIntent('lock-zone', 'padlock')).toEqual({ kind: 'place', tool: 'padlock' });
    expect(desktopIntent('tag-zone', 'danger-tag')).toEqual({ kind: 'place', tool: 'danger-tag' });
    const wrong = desktopIntent('breaker-sl-2', 'danger-tag');
    expect(wrong.kind).toBe('warn');
  });

  it('pokes a breaker with an empty hand, including SL-3 for identify, switch-off and try-start', () => {
    for (const id of ['sl-1', 'sl-2', 'sl-3', 'sl-4']) expect(desktopIntent(`breaker-${id}`, undefined)).toEqual({ kind: 'poke-breaker', breakerId: id });
    expect(desktopIntent('breaker-sl-3', 'voltage-tester').kind).toBe('warn');
  });

  it('only tests with the tester in hand and never bare-handed', () => {
    expect(desktopIntent('proving-unit', 'voltage-tester')).toEqual({ kind: 'tester', sensor: 'proving' });
    expect(desktopIntent('terminals', 'voltage-tester')).toEqual({ kind: 'tester', sensor: 'terminals' });
    const bare = desktopIntent('terminals', undefined);
    expect(bare.kind).toBe('warn');
    if (bare.kind === 'warn') expect(bare.message).toMatch(/bare-handed/);
    expect(desktopIntent('proving-unit', 'padlock').kind).toBe('warn');
  });

  it('routes the radio and ignores scenery', () => {
    expect(desktopIntent('controls-panel', undefined)).toEqual({ kind: 'notify' });
    expect(desktopIntent('distribution-board', undefined)).toEqual({ kind: 'none' });
    expect(desktopIntent('sky', undefined)).toEqual({ kind: 'none' });
  });

  it('labels every target and documents the safe-hold key', () => {
    for (const name of DESKTOP_TARGETS) expect(TARGET_LABELS[name]).toBeTruthy();
    expect(isDesktopTool('padlock')).toBe(true);
    expect(isDesktopTool('terminals')).toBe(false);
    expect(DESKTOP_KEYS.some(entry => /Space/.test(entry.keys))).toBe(true);
  });
});

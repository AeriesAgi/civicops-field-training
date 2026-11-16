/**
 * Desktop (mouse and keyboard) mapping from a clicked scene object to a physical
 * training action. Pure and browser-free; the procedure reducer still decides
 * whether the action was correct, out of order or unsafe, exactly as in XR.
 */
export type DesktopTool = 'padlock' | 'danger-tag' | 'voltage-tester';

export type DesktopIntent =
  | { kind: 'pick-up'; tool: DesktopTool }
  | { kind: 'put-down' }
  | { kind: 'place'; tool: 'padlock' | 'danger-tag' }
  | { kind: 'poke-breaker'; breakerId: string }
  | { kind: 'tester'; sensor: 'proving' | 'terminals' }
  | { kind: 'notify' }
  | { kind: 'warn'; message: string }
  | { kind: 'none' };

export const TOOL_LABELS: Readonly<Record<DesktopTool, string>> = {
  padlock: 'personal padlock', 'danger-tag': 'danger tag', 'voltage-tester': 'voltage tester',
};

/** Scene object names that the desktop pointer can target in the Electrical lesson. */
export const DESKTOP_TARGETS = [
  'breaker-sl-1', 'breaker-sl-2', 'breaker-sl-3', 'breaker-sl-4', 'padlock', 'danger-tag', 'voltage-tester',
  'proving-unit', 'terminals', 'lock-zone', 'tag-zone', 'controls-panel', 'distribution-board',
] as const;

export const TARGET_LABELS: Readonly<Record<string, string>> = {
  'breaker-sl-1': 'Breaker SL-1', 'breaker-sl-2': 'Breaker SL-2', 'breaker-sl-3': 'Breaker SL-3 (work order)', 'breaker-sl-4': 'Breaker SL-4',
  padlock: 'Personal padlock', 'danger-tag': 'Danger tag', 'voltage-tester': 'Voltage tester', 'proving-unit': 'Proving unit (known 230 V)',
  terminals: 'SL-3 terminals', 'lock-zone': 'Lock hasp on SL-3', 'tag-zone': 'Tag point on SL-3', 'controls-panel': 'Radio: notify control',
  'distribution-board': 'Distribution board',
};

export function isDesktopTool(name: string): name is DesktopTool {
  return name === 'padlock' || name === 'danger-tag' || name === 'voltage-tester';
}

export function desktopIntent(pick: string, held: DesktopTool | undefined): DesktopIntent {
  if (isDesktopTool(pick)) return held === pick ? { kind: 'put-down' } : { kind: 'pick-up', tool: pick };
  const breaker = /^breaker-(sl-[1-4])$/.exec(pick);
  if (breaker) {
    if (held === 'padlock' || held === 'danger-tag') {
      return breaker[1] === 'sl-3' ? { kind: 'place', tool: held }
        : { kind: 'warn', message: `The work order is SL-3. Place the ${TOOL_LABELS[held]} on SL-3.` };
    }
    if (held === 'voltage-tester') return { kind: 'warn', message: 'Test at the SL-3 terminals below the board, or put the tester down (Esc).' };
    return { kind: 'poke-breaker', breakerId: breaker[1] };
  }
  if (pick === 'lock-zone' || pick === 'tag-zone' || pick === 'distribution-board') {
    if (held === 'padlock' || held === 'danger-tag') return { kind: 'place', tool: held };
    if (held === 'voltage-tester') return { kind: 'warn', message: 'Test at the SL-3 terminals, not the switch.' };
    return { kind: 'none' };
  }
  if (pick === 'proving-unit') {
    return held === 'voltage-tester' ? { kind: 'tester', sensor: 'proving' }
      : { kind: 'warn', message: 'Pick up the voltage tester first, then touch it to the proving unit.' };
  }
  if (pick === 'terminals') {
    return held === 'voltage-tester' ? { kind: 'tester', sensor: 'terminals' }
      : { kind: 'warn', message: 'Never touch terminals bare-handed. Pick up the voltage tester first.' };
  }
  if (pick === 'controls-panel') return { kind: 'notify' };
  return { kind: 'none' };
}

/** Keyboard shortcuts shown in the help panel and handled by the desktop controls. */
export const DESKTOP_KEYS: readonly { keys: string; action: string }[] = [
  { keys: 'Mouse drag', action: 'Look around' },
  { keys: 'Click', action: 'Use a switch, pick up a tool, place it, or touch the tester to a point' },
  { keys: 'W A S D / arrows', action: 'Step around the work site' },
  { keys: 'Mouse wheel', action: 'Lean in or out' },
  { keys: 'Esc', action: 'Put the held tool back' },
  { keys: 'R', action: 'Radio control (when that step is due)' },
  { keys: 'Hold Space', action: 'Confirm safe to work (hold until the ring fills)' },
  { keys: 'H', action: 'Ask for a hint (costs 5 points)' },
];

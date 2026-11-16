import { describe, expect, it } from 'vitest';
import { CAPTION_LINE_CHARACTERS, CAPTION_MAX_LINES, formatTrainingCaption } from './spatial-caption.js';
import { checkRoadsLayout, createFaultyRoadsLayout } from './roads-geometry.js';
import { roadsStepLines } from './modules/roads-zone.js';

function bounded(caption: string): void {
  const lines = caption.split('\n');
  expect(lines.length).toBeLessThanOrEqual(CAPTION_MAX_LINES);
  expect(lines.every(line => line.length <= CAPTION_LINE_CHARACTERS)).toBe(true);
}

describe('readable spatial instruction captions', () => {
  it('keeps the clear zone instruction complete within three conservative lines', () => {
    const caption = formatTrainingCaption('Zone geometry clear.\nRun traffic to test the layout.');
    expect(caption).toBe('Zone geometry clear.\nRun traffic to test\nthe layout.');
    bounded(caption);
  });
  it('retains the full actual six metre taper fault, including its six-cone requirement', () => {
    const issue = checkRoadsLayout(createFaultyRoadsLayout('taper-too-short')).issues.find(item => item.code === 'taper-too-short')!;
    const caption = formatTrainingCaption(issue.message);
    expect(caption).toBe('Use at least six\ncones and a taper of\n6000 mm on this\nfull-scale road.');
    expect(caption.replace(/\n/g, ' ')).toBe(issue.message);
    expect(caption).not.toContain('...');
    bounded(caption);
  });
  it('keeps ordinary words intact when a complete short instruction fits', () => {
    const message = 'Keep the route clear for people outside the work area.';
    const caption = formatTrainingCaption(message);
    expect(caption.replace(/\n/g, ' ')).toBe(message);
    bounded(caption);
  });
  it.each(['cone-taper', 'position-flaggers', 'test-traffic'] as const)('makes omitted %s why-copy explicit rather than showing a fifth line', step => {
    const caption = formatTrainingCaption(roadsStepLines[step].why);
    expect(caption.endsWith('...')).toBe(true);
    expect(caption.split('\n')).toHaveLength(4);
    bounded(caption);
  });
  it('preserves meaningful newlines and an interior blank line while normalising whitespace', () => {
    const caption = formatTrainingCaption('  Park\tupstream.\r\n\r\nSwitch  beacon on.   ');
    expect(caption).toBe('Park upstream.\n\nSwitch beacon on.');
    bounded(caption);
  });
  it('does not add an ellipsis to exactly four fitting lines', () => {
    const message = '12345678901234567890\nPark upstream.\nBeacon on.\nReady.';
    expect(formatTrainingCaption(message)).toBe(message);
    bounded(message);
  });
  it('fits a single extra-long word without creating an empty first line or exceeding the card', () => {
    const caption = formatTrainingCaption('x'.repeat(81));
    expect(caption).toBe(['x'.repeat(20), 'x'.repeat(20), 'x'.repeat(20), '...'].join('\n'));
    bounded(caption);
  });
  it('shows explicit truncation after more than four authored lines', () => {
    const caption = formatTrainingCaption('One\nTwo\nThree\nFour\nFive');
    expect(caption).toBe('One\nTwo\nThree\nFour...');
    bounded(caption);
  });
  it.each(['', '  \t \r\n '])('returns no blank caption block for whitespace-only input %j', message => {
    expect(formatTrainingCaption(message)).toBe('');
  });
});

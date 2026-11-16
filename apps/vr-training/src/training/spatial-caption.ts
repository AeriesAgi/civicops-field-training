/** Conservative body-copy envelope for 29 cm spatial cards at 2.7 cm type. */
export const CAPTION_LINE_CHARACTERS = 20;
export const CAPTION_MAX_LINES = 4;

/** Preserve authored line breaks and whole words; split only words wider than a line.
 * ASCII ellipsis makes omitted copy explicit. Instructor speech retains the full message.
 * This allocates only on instruction/feedback edges, never in a frame loop.
 */
export function formatTrainingCaption(message: string): string {
  const normalized = message.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  const lines: string[] = [];
  for (const paragraph of normalized.split('\n')) {
    let line = '';
    for (let word of paragraph.trim().split(/\s+/)) {
      if (!word) continue;
      while (word.length > CAPTION_LINE_CHARACTERS) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, CAPTION_LINE_CHARACTERS));
        word = word.slice(CAPTION_LINE_CHARACTERS);
      }
      if (line && line.length + 1 + word.length > CAPTION_LINE_CHARACTERS) {
        lines.push(line); line = word;
      } else line += (line ? ' ' : '') + word;
    }
    lines.push(line);
  }
  if (lines.length <= CAPTION_MAX_LINES) return lines.join('\n');
  const visible = lines.slice(0, CAPTION_MAX_LINES);
  const fullLastLine = visible[CAPTION_MAX_LINES - 1];
  const available = CAPTION_LINE_CHARACTERS - 3;
  let last = fullLastLine.slice(0, available).trimEnd();
  // Back up to a whole word when shortening a sentence. If the last word cannot
  // coexist with the ellipsis, omit it instead of leaving a misleading fragment.
  if (fullLastLine.length > available && fullLastLine[available] !== ' ') {
    const breakAt = last.lastIndexOf(' ');
    last = breakAt >= 0 ? last.slice(0, breakAt) : '';
  }
  visible[CAPTION_MAX_LINES - 1] = last.trimEnd() + '...';
  return visible.join('\n');
}

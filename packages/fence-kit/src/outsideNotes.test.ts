import { describe, expect, test } from 'vitest';
import { OUTSIDE_LIMITS, outsideNotesSize, readOutsideNote, renderOutsideNotes } from './outsideNotes.ts';

describe('readOutsideNote', () => {
  test('reads place, colour, bold and \\n line breaks', () => {
    const read = readOutsideNote(['below', 'red', 'bold'], '1 行め\\n2 行め');
    expect(read).toEqual({ ok: true, note: { place: 'below', lines: ['1 行め', '2 行め'], color: expect.any(String), bold: true } });
  });

  test('refuses an unknown word and an empty body', () => {
    expect(readOutsideNote(['below', 'spam'], '字').ok).toBe(false);
    expect(readOutsideNote(['above'], '  ').ok).toBe(false);
    expect(readOutsideNote(['left'], '字').ok).toBe(false);
  });

  test('cuts at the length and line limits', () => {
    const long = readOutsideNote(['below'], 'あ'.repeat(200));
    expect(long.ok && long.note.lines[0]?.length).toBe(OUTSIDE_LIMITS.length);
    const many = readOutsideNote(['below'], Array.from({ length: 12 }, (_, i) => `${i}`).join('\\n'));
    expect(many.ok && many.note.lines.length).toBe(OUTSIDE_LIMITS.lines);
  });
});

describe('outsideNotesSize / renderOutsideNotes', () => {
  const read = readOutsideNote(['below'], 'a\\nb');
  const notes = read.ok ? [read.note] : [];

  test('has no height when nothing is in that place', () => {
    expect(outsideNotesSize(notes, 'above', 12)).toEqual({ width: 0, height: 0 });
    expect(outsideNotesSize(notes, 'below', 12).height).toBeGreaterThan(24);
  });

  test('draws one text per line', () => {
    const svg = renderOutsideNotes(notes, 'below', { x: 0, y: 0, width: 300, height: 50 }, { size: 12, fill: '#000' });
    expect(svg.match(/<text/g)).toHaveLength(2);
  });
});

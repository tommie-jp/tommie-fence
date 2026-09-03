import { describe, expect, test } from 'vitest';
import { applyEdits } from './shared.ts';
import {
  deleteNote, duplicateNote, flipNote, isNoteHandle, moveNote, noteCells, noteFields, noteLineOf, noteSpans,
  setNoteField, turnNote,
} from './note.ts';
import { parseAddress } from '../model/address.ts';

const BOARD = `board: 12x8
parts:
  R1: resistor b2 b6 10k
notes:
  - text c3 ここから電源
  - box e5 g7 blue
`;

const at = (hole: string) => parseAddress(hole)!;

/** 行の出し入れと行の中の差し替えの両方を当てる (`applyRewrite` と同じ順)。 */
const after = (source: string, result: ReturnType<typeof moveNote>): string => {
  if (!result.ok) throw new Error(result.error.message);
  const rows = source.split('\n');
  for (const one of [...(result.value.lines ?? [])].sort((a, b) => b.line - a.line)) {
    if (one.kind === 'delete') rows.splice(one.line - 1, 1);
    else rows.splice(one.line - 1, 0, one.text);
  }
  return applyEdits(rows.join('\n'), result.value.edits);
};

describe('注釈の掴み手', () => {
  test('reads the line out of the handle', () => {
    expect(isNoteHandle('note:5')).toBe(true);
    expect(isNoteHandle('R1')).toBe(false);
    expect(noteLineOf('note:5')).toBe(5);
    expect(noteLineOf('note:x')).toBe(null);
    expect(noteLineOf('R1')).toBe(null);
  });

  test('lists the holes the note sits on, so the ghost can light them', () => {
    expect(noteCells(BOARD, 'note:5')).toEqual(['c3']);
    // 2 点で形が決まる注釈は両方。
    expect(noteCells(BOARD, 'note:6')).toEqual(['e5', 'g7']);
  });

  test('points at the whole line, so clicking it lights the line in the editor', () => {
    expect(noteSpans(BOARD, 'note:5')).toEqual([{ line: 5, column: 0, length: 18 }]);
  });
});

describe('moveNote', () => {
  test('moves the note to the hole that was clicked', () => {
    expect(after(BOARD, moveNote(BOARD, 'note:5', at('g8')))).toContain('- text g8 ここから電源');
  });

  test('carries the second hole along, so the shape does not change', () => {
    // `box` は 2 点で形が決まる。片方だけ動かすと大きさが変わってしまう。
    expect(after(BOARD, moveNote(BOARD, 'note:6', at('a1')))).toContain('- box a1 c3 blue');
  });

  test('refuses a move that takes the note off the board', () => {
    const result = moveNote(BOARD, 'note:6', at('l8'));

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('板の外');
  });

  test('says so when the handle points at no note', () => {
    const result = moveNote(BOARD, 'note:3', at('a1'));

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('注釈がありません');
  });
});

describe('duplicateNote', () => {
  test('writes the copy one hole down, so the new one is visible', () => {
    const text = after(BOARD, duplicateNote(BOARD, 'note:5'));

    expect(text).toContain('- text d3 ここから電源');
    expect(text).toContain('- text c3 ここから電源');
  });
});

describe('deleteNote', () => {
  test('drops the line', () => {
    expect(after(BOARD, deleteNote(BOARD, 'note:5'))).not.toContain('ここから電源');
  });

  test('drops the notes: line too when the last one goes', () => {
    const one = 'board: 12x8\nnotes:\n  - text c3 ここ\n';

    expect(after(one, deleteNote(one, 'note:3'))).not.toContain('notes:');
  });
});

describe('noteFields / setNoteField', () => {
  test('offers the words of a text note, and nothing to edit on the others', () => {
    expect(noteFields(BOARD, 'note:5')).toMatchObject({ type: 'text', value: 'ここから電源', can: ['value'] });
    expect(noteFields(BOARD, 'note:6')).toMatchObject({ type: 'box', can: [] });
  });

  test('rewrites the words, keeping the hole', () => {
    expect(after(BOARD, setNoteField(BOARD, 'note:5', 'value', 'ここは GND')))
      .toContain('- text c3 ここは GND');
  });

  test('refuses a field the grammar does not have', () => {
    const result = setNoteField(BOARD, 'note:5', 'type', 'mark');

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('言葉だけ');
  });
});

describe('turnNote / flipNote', () => {
  const TEXT = 'board: 12x8\nnotes:\n  - text c3 ここ\n';

  test('writes the turn on the kind, so the words stay the words', () => {
    expect(after(TEXT, turnNote(TEXT, 'note:3', 1))).toContain('- text/r90 c3 ここ');
  });

  test('comes back to where it started after four turns', () => {
    let now = TEXT;
    for (let quarter = 0; quarter < 4; quarter += 1) now = after(now, turnNote(now, 'note:3', 1));

    expect(now).toBe(TEXT);
  });

  test('keeps both when both are written', () => {
    const turned = after(TEXT, turnNote(TEXT, 'note:3', 1));

    expect(after(turned, flipNote(turned, 'note:3'))).toContain('- text/r90/mirror c3 ここ');
  });

  test('takes the mirror off again', () => {
    const flipped = after(TEXT, flipNote(TEXT, 'note:3'));

    expect(after(flipped, flipNote(flipped, 'note:3'))).toContain('- text c3 ここ');
  });

  test('refuses a note that has no direction, rather than doing nothing', () => {
    // 黙って何もしないと鍵が壊れて見える。
    const mark = 'board: 12x8\nnotes:\n  - mark c3\n';
    const result = turnNote(mark, 'note:3', 1);

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('text だけ');
  });
});

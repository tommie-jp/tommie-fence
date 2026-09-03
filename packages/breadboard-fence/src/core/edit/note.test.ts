import { describe, expect, test } from 'vitest';
import { applyEdits } from './shared.ts';
import {
  deleteNote, duplicateNote, flipNote, isNoteHandle, moveNote, noteCells, noteFields, noteLineOf, noteSpans,
  setNoteField, turnNote,
} from './note.ts';
import { parseAddress } from '../model/address.ts';

const BOARD = `board: half
parts:
  R1: resistor a5 a10 330
notes:
  - circle R1 blue
  - text d4 red: ここから電源
  - box b2 d8 blue
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

const refused = (result: ReturnType<typeof moveNote>): string => {
  if (result.ok) throw new Error('通ってしまいました');
  return result.error.message;
};

describe('注釈の掴み手', () => {
  test('reads the line out of the handle', () => {
    expect(isNoteHandle('note:6')).toBe(true);
    expect(isNoteHandle('R1')).toBe(false);
    expect(noteLineOf('note:6')).toBe(6);
    expect(noteLineOf('R1')).toBe(null);
  });

  test('lists the holes it points at, and nothing for a note that points at a part', () => {
    expect(noteCells(BOARD, 'note:6')).toEqual(['d4']);
    expect(noteCells(BOARD, 'note:7')).toEqual(['b2', 'd8']);
    expect(noteCells(BOARD, 'note:5')).toEqual([]);
  });

  test('points at the whole line', () => {
    expect(noteSpans(BOARD, 'note:6')[0]?.line).toBe(6);
  });
});

describe('moveNote', () => {
  test('moves the note to the hole that was clicked', () => {
    expect(after(BOARD, moveNote(BOARD, 'note:6', at('g8')))).toContain('- text g8 red: ここから電源');
  });

  test('carries the second hole along, so the shape does not change', () => {
    expect(after(BOARD, moveNote(BOARD, 'note:7', at('a1')))).toContain('- box a1 c7 blue');
  });

  test('refuses to move a note that points at a part, rather than losing the name', () => {
    // 番地に書き換えると名前が外れ、あとで部品を動かしても注釈が付いてこない。
    expect(refused(moveNote(BOARD, 'note:5', at('g8')))).toContain('R1 のほうを動かします');
  });

  test('refuses a move onto a rail, since a rail row is not a number', () => {
    expect(refused(moveNote(BOARD, 'note:6', at('+t5')))).toContain('レール');
  });
});

describe('turnNote / flipNote', () => {
  test('writes the turn in the words, before the colon', () => {
    expect(after(BOARD, turnNote(BOARD, 'note:6', 1))).toContain('- text d4 red r90: ここから電源');
  });

  test('comes back to where it started after four turns', () => {
    let now = BOARD;
    for (let quarter = 0; quarter < 4; quarter += 1) now = after(now, turnNote(now, 'note:6', 1));

    expect(now).toBe(BOARD);
  });

  test('takes the mirror off again', () => {
    const flipped = after(BOARD, flipNote(BOARD, 'note:6'));

    expect(flipped).toContain('- text d4 red mirror: ここから電源');
    expect(after(flipped, flipNote(flipped, 'note:6'))).toBe(BOARD);
  });

  test('refuses a note that has no direction, rather than doing nothing', () => {
    expect(refused(turnNote(BOARD, 'note:7', 1))).toContain('text だけ');
  });
});

describe('duplicateNote / deleteNote / noteFields', () => {
  test('writes the copy one hole down', () => {
    const text = after(BOARD, duplicateNote(BOARD, 'note:6'));

    expect(text).toContain('- text e4 red: ここから電源');
    expect(text).toContain('- text d4 red: ここから電源');
  });

  test('drops the line', () => {
    expect(after(BOARD, deleteNote(BOARD, 'note:6'))).not.toContain('ここから電源');
  });

  test('offers the words of a text note, and nothing to edit on the others', () => {
    expect(noteFields(BOARD, 'note:6')).toMatchObject({ type: 'text', value: 'ここから電源', can: ['value'] });
    expect(noteFields(BOARD, 'note:5')).toMatchObject({ type: 'circle', can: [] });
  });

  test('rewrites the words after the colon', () => {
    expect(after(BOARD, setNoteField(BOARD, 'note:6', 'value', 'ここは GND')))
      .toContain('- text d4 red: ここは GND');
  });
});

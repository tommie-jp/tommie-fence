import { describe, expect, test } from 'vitest';
import { applyEdits } from './shared.ts';
import {
  deleteNote, duplicateNote, flipNote, isNoteHandle, moveNote, noteCells, noteFields, noteLineOf, noteSpans,
  setNoteField, turnNote,
} from './note.ts';
import { parseAddress } from '../model/address.ts';

const RC = `parts:
  R1: resistor a1 a3 10k
  G1: ground b3
notes:
  - circle R1 blue
  - text b1 blue: ここで分圧する
  - box a1 c3 blue
`;

const at = (cell: string) => parseAddress(cell)!;

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
    expect(noteLineOf('note:6')).toBe(6);
    expect(noteLineOf('R1')).toBe(null);
  });

  test('lists the cells it points at, and nothing for a note that points at a part', () => {
    // **`R1` は番地としても読める** (行 r・列 1)。綴りだけで見分けると、
    // 部品を指した注釈を番地に書き換えてしまう。文書の部品名で決める。
    expect(noteCells(RC, 'note:6')).toEqual(['b1']);
    expect(noteCells(RC, 'note:5')).toEqual([]);
  });

  test('points at the whole line', () => {
    expect(noteSpans(RC, 'note:6')[0]?.line).toBe(6);
  });
});

describe('moveNote', () => {
  test('moves the note to the cell that was clicked', () => {
    expect(after(RC, moveNote(RC, 'note:6', at('c4')))).toContain('- text c4 blue: ここで分圧する');
  });

  test('carries the second cell along, so the shape does not change', () => {
    expect(after(RC, moveNote(RC, 'note:7', at('b2')))).toContain('- box b2 d4 blue');
  });

  test('refuses to move a note that points at a part, rather than losing the name', () => {
    expect(refused(moveNote(RC, 'note:5', at('c4')))).toContain('R1 のほうを動かします');
  });
});

describe('turnNote / flipNote', () => {
  test('writes the turn in the words, before the colon', () => {
    expect(after(RC, turnNote(RC, 'note:6', 1))).toContain('- text b1 blue r90: ここで分圧する');
  });

  test('comes back to where it started after four turns', () => {
    let now = RC;
    for (let quarter = 0; quarter < 4; quarter += 1) now = after(now, turnNote(now, 'note:6', 1));

    expect(now).toBe(RC);
  });

  test('says why a text note cannot be flipped here', () => {
    // 字を指し先そのものに置くので、移す側がない (板の 2 つは上に置くので逃がせる)。
    expect(refused(flipNote(RC, 'note:6'))).toContain('移す側がありません');
  });

  test('refuses a note that has no direction', () => {
    expect(refused(turnNote(RC, 'note:7', 1))).toContain('text だけ');
  });
});

describe('duplicateNote / deleteNote / noteFields', () => {
  test('writes the copy one row down, keeping a part name as a name', () => {
    expect(after(RC, duplicateNote(RC, 'note:6'))).toContain('- text c1 blue: ここで分圧する');
    expect(after(RC, duplicateNote(RC, 'note:5'))).toContain('- circle R1 blue\n  - circle R1 blue');
  });

  test('drops the line', () => {
    expect(after(RC, deleteNote(RC, 'note:6'))).not.toContain('ここで分圧する');
  });

  test('offers the words of a text note, and nothing to edit on the others', () => {
    expect(noteFields(RC, 'note:6')).toMatchObject({ type: 'text', value: 'ここで分圧する', can: ['value'] });
    expect(noteFields(RC, 'note:5')).toMatchObject({ type: 'circle', can: [] });
  });

  test('rewrites the words after the colon', () => {
    expect(after(RC, setNoteField(RC, 'note:6', 'value', 'ここは GND')))
      .toContain('- text b1 blue: ここは GND');
  });
});

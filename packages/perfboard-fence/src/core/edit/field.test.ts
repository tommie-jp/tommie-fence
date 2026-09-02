import { describe, expect, test } from 'vitest';
import { partFields, setField } from './field.ts';
import { renamePart } from './rename.ts';
import { applyEdits } from './shared.ts';

const BOARD = `board: 12x7
parts:
  R1: resistor b2 b6 10k
  C1: capacitor b8 b11 100n
wires:
  - a2 -- b2
notes:
  - mark R1 red
`;

const after = (source: string, result: ReturnType<typeof setField>): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('partFields', () => {
  test('reads what the fields hold now, so the form can show it', () => {
    expect(partFields(BOARD, 'R1')).toEqual({
      id: 'R1', type: 'resistor', value: '10k', label: '', can: ['type', 'value'],
    });
  });

  test('offers no label, since the grammar has none', () => {
    // 字を添えたいときは注釈で書く。欄に出しても書けないので載せない。
    expect(partFields(BOARD, 'R1')?.can).not.toContain('label');
  });

  test('has nothing for a part that is not there', () => {
    expect(partFields(BOARD, 'X9')).toBeNull();
  });
});

describe('setField', () => {
  test('changes the value in place', () => {
    expect(after(BOARD, setField(BOARD, 'R1', 'value', '4k7'))).toContain('R1: resistor b2 b6 4k7');
  });

  test('adds a value to a line that has none', () => {
    const bare = 'board: 12x7\nparts:\n  R1: resistor b2 b6\n';

    expect(after(bare, setField(bare, 'R1', 'value', '10k'))).toContain('R1: resistor b2 b6 10k');
  });

  test('clears the value without leaving a gap', () => {
    expect(after(BOARD, setField(BOARD, 'R1', 'value', ''))).toContain('R1: resistor b2 b6\n');
  });

  test('changes the type when the new one takes the same holes', () => {
    expect(after(BOARD, setField(BOARD, 'R1', 'type', 'capacitor')))
      .toContain('R1: capacitor b2 b6 10k');
  });

  test('refuses a type that wants a different number of holes', () => {
    // 穴の数が合わなくなると図が消える。替える前に断る。
    const result = setField(BOARD, 'R1', 'type', 'dip8');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('穴を');
  });

  test('tells the difference between unknown and not-yet-placeable', () => {
    expect(!setField(BOARD, 'R1', 'type', 'resistr').ok).toBe(true);
  });

  test('refuses text that would break the line', () => {
    expect(setField(BOARD, 'R1', 'value', '10k # 手持ち').ok).toBe(false);
  });
});

describe('renamePart', () => {
  test('changes the key', () => {
    expect(after(BOARD, renamePart(BOARD, 'R1', 'R9'))).toContain('R9: resistor b2 b6 10k');
  });

  test('takes the notes that point at it', () => {
    expect(after(BOARD, renamePart(BOARD, 'R1', 'R9'))).toContain('- mark R9 red');
  });

  test('refuses a name that is already taken', () => {
    expect(renamePart(BOARD, 'R1', 'C1').ok).toBe(false);
  });

  test('says nothing changed when the name is the same', () => {
    const result = renamePart(BOARD, 'R1', 'R1');

    expect(result.ok && result.value.edits).toEqual([]);
  });
});

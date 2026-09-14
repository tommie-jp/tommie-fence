import { describe, expect, test } from 'vitest';
import { partFields, setField } from './field.ts';
import { renamePart } from './rename.ts';
import { applyEdits } from './shared.ts';

const LED = `board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red l=状態
wires:
  - a10 -- b12
notes:
  - circle R1 red
`;

const after = (source: string, result: ReturnType<typeof setField>): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

describe('partFields', () => {
  test('reads what the fields hold now, so the form can show it', () => {
    expect(partFields(LED, 'D1')).toEqual({
      id: 'D1', type: 'led', value: 'red', label: '状態', color: '', can: ['id', 'type', 'value', 'label'],
    });
  });

  test('leaves empty what the part does not carry', () => {
    expect(partFields(LED, 'R1')?.label).toBe('');
  });

  test('has nothing for a part that is not there', () => {
    expect(partFields(LED, 'X9')).toBeNull();
  });
});

describe('setField', () => {
  test('changes the type in place, leaving the holes and the value', () => {
    expect(after(LED, setField(LED, 'R1', 'type', 'capacitor')))
      .toContain('R1: capacitor a5 a10 330');
  });

  test('refuses a type the grammar cannot read', () => {
    expect(setField(LED, 'R1', 'type', 'resistor/').ok).toBe(false);
  });

  test('refuses to empty the type, which every part needs', () => {
    expect(setField(LED, 'R1', 'type', '').ok).toBe(false);
  });

  test('changes the value in place', () => {
    expect(after(LED, setField(LED, 'R1', 'value', '1k'))).toContain('R1: resistor a5 a10 1k');
  });

  test('adds a value to a line that has none', () => {
    const bare = 'board: half\nparts:\n  R1: resistor a5 a10\n';

    expect(after(bare, setField(bare, 'R1', 'value', '330'))).toContain('R1: resistor a5 a10 330');
  });

  test('clears the value without leaving a gap', () => {
    expect(after(LED, setField(LED, 'R1', 'value', ''))).toContain('R1: resistor a5 a10\n');
  });

  test('keeps the value in front of the label, the way the line is written', () => {
    const bare = 'board: half\nparts:\n  D1: led b12 b13 l=状態\n';

    expect(after(bare, setField(bare, 'D1', 'value', 'red'))).toContain('D1: led b12 b13 red l=状態');
  });

  test('changes the label in place', () => {
    expect(after(LED, setField(LED, 'D1', 'label', '電源'))).toContain('l=電源');
  });

  test('adds a label to a line that has none', () => {
    expect(after(LED, setField(LED, 'R1', 'label', '分圧'))).toContain('R1: resistor a5 a10 330 l=分圧');
  });

  test('clears the label without leaving a gap', () => {
    expect(after(LED, setField(LED, 'D1', 'label', ''))).toContain('D1: led b12(A) b13(K) red\n');
  });

  test('refuses text that would break the line', () => {
    // `#` は YAML のコメントになり、値が黙って消える。
    expect(setField(LED, 'R1', 'value', '10k # 手持ち').ok).toBe(false);
    expect(setField(LED, 'R1', 'label', 'a: b').ok).toBe(false);
  });
});

describe('renamePart', () => {
  test('changes the key', () => {
    expect(after(LED, renamePart(LED, 'R1', 'R9'))).toContain('R9: resistor a5 a10 330');
  });

  test('takes the notes that point at it', () => {
    expect(after(LED, renamePart(LED, 'R1', 'R9'))).toContain('- circle R9 red');
  });

  test('leaves the wires alone, since they point at holes', () => {
    expect(after(LED, renamePart(LED, 'R1', 'R9'))).toContain('- a10 -- b12');
  });

  test('refuses a name that is already taken', () => {
    expect(renamePart(LED, 'R1', 'D1').ok).toBe(false);
  });

  test('refuses a name the grammar cannot read', () => {
    expect(renamePart(LED, 'R1', 'R 1').ok).toBe(false);
  });

  test('says nothing changed when the name is the same', () => {
    const result = renamePart(LED, 'R1', 'R1');

    expect(result.ok && result.value.edits).toEqual([]);
  });
});

// **1 行に並べた部品 (フロー形式) は、その部品の範囲だけを書き換える。**
// 行まるごとを 1 部品と見ると、隣の部品を消したり区切りの外へ書いたりする。
describe('setField on parts written in flow style', () => {
  const FLOW = 'board: half\nparts: {R1: resistor a5 a10 330, D1: led b12 b13 red}\n';

  test('changes the value of the second part, leaving the first', () => {
    expect(after(FLOW, setField(FLOW, 'D1', 'value', 'blue')))
      .toBe('board: half\nparts: {R1: resistor a5 a10 330, D1: led b12 b13 blue}\n');
  });

  test('changes the value of the first part, keeping the separator', () => {
    expect(after(FLOW, setField(FLOW, 'R1', 'value', '1k')))
      .toBe('board: half\nparts: {R1: resistor a5 a10 1k, D1: led b12 b13 red}\n');
  });

  test('changes the type of the part it names, not the key of the map', () => {
    expect(after(FLOW, setField(FLOW, 'R1', 'type', 'capacitor')))
      .toBe('board: half\nparts: {R1: capacitor a5 a10 330, D1: led b12 b13 red}\n');
  });

  test('adds a label inside the braces', () => {
    expect(after(FLOW, setField(FLOW, 'R1', 'label', 'x')))
      .toBe('board: half\nparts: {R1: resistor a5 a10 330 l=x, D1: led b12 b13 red}\n');
  });

  test('adds a value before the separator, on a line broken after it', () => {
    const source = 'board: half\nparts: {D1: led b12 b13,\n  R1: resistor a5 a10}\n';
    expect(after(source, setField(source, 'D1', 'value', 'red')))
      .toBe('board: half\nparts: {D1: led b12 b13 red,\n  R1: resistor a5 a10}\n');
    expect(after(source, setField(source, 'R1', 'value', '1k')))
      .toBe('board: half\nparts: {D1: led b12 b13,\n  R1: resistor a5 a10 1k}\n');
  });

  test('clears a value without eating the separator', () => {
    expect(after(FLOW, setField(FLOW, 'R1', 'value', '')))
      .toBe('board: half\nparts: {R1: resistor a5 a10, D1: led b12 b13 red}\n');
  });
});

describe('setField on a line with a comment after it', () => {
  const COMMENTED = 'board: half\nparts:\n  D1: led b12 b13 red  # 表示, 赤\n';

  test('adds the label before the comment, not inside it', () => {
    expect(after(COMMENTED, setField(COMMENTED, 'D1', 'label', '状態')))
      .toBe('board: half\nparts:\n  D1: led b12 b13 red l=状態  # 表示, 赤\n');
  });

  test('adds a value before the comment, not inside it', () => {
    const source = 'board: half\nparts:\n  R1: resistor a5 a10  # 電流制限\n';
    expect(after(source, setField(source, 'R1', 'value', '330')))
      .toBe('board: half\nparts:\n  R1: resistor a5 a10 330  # 電流制限\n');
  });
});

// ---- レビューで出た穴 (2026-09-14) ----
// **範囲を読み違えそうな形は、書く前に読み直して確かめ、崩れるなら断る。**
describe('setField refuses what it cannot write back cleanly', () => {
  test('finds a key written with a space before the colon, or in quotes', () => {
    const spaced = 'board: half\nparts: {R1 : resistor a5 a10 330, D1: led b12 b13 red}\n';
    expect(after(spaced, setField(spaced, 'R1', 'type', 'capacitor')))
      .toBe('board: half\nparts: {R1 : capacitor a5 a10 330, D1: led b12 b13 red}\n');
    const quoted = 'board: half\nparts: {R1: resistor a5 a10 330, "D1": led b12 b13 red}\n';
    expect(after(quoted, setField(quoted, 'D1', 'value', 'blue')))
      .toBe('board: half\nparts: {R1: resistor a5 a10 330, "D1": led b12 b13 blue}\n');
  });

  test("does not swallow the next part after a ' in the middle of a value", () => {
    const source = "board: half\nparts: {R1: resistor a5 a10 'x, D1: led b12 b13 red}\n";
    expect(after(source, setField(source, 'R1', 'value', '1k')))
      .toBe('board: half\nparts: {R1: resistor a5 a10 1k, D1: led b12 b13 red}\n');
  });

  test('does not take a key inside the quotes of another part', () => {
    const source = 'board: half\nparts: {R2: "resistor a1 a3 R1: x", R1: resistor a5 a10}\n';
    const result = setField(source, 'R1', 'value', '1k');
    if (result.ok) expect(after(source, result)).toBe('board: half\nparts: {R2: "resistor a1 a3 R1: x", R1: resistor a5 a10 1k}\n');
  });

  test('does not mistake a block line after a value ending in a comma for flow style', () => {
    const source = 'board: half\nparts:\n  R1: resistor a5 a10 1,\n  D1: led b12 b13 2,2\n';
    const result = setField(source, 'D1', 'value', 'red');
    if (result.ok) expect(after(source, result)).toBe('board: half\nparts:\n  R1: resistor a5 a10 1,\n  D1: led b12 b13 red\n');
  });

  test('refuses a part that goes on to the next line', () => {
    expect(setField('board: half\nparts: {R1: resistor a5\n  a10 330, D1: led b12 b13}\n', 'R1', 'value', '1k').ok).toBe(false);
  });
});

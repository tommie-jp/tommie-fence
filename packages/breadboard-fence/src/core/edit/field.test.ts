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

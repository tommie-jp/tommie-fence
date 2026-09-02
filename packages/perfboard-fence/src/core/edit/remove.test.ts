import { describe, expect, test } from 'vitest';
import { deletePart, deleteWire } from './remove.ts';

const BOARD = `board: 12x7
parts:
  R1: resistor b2 b6 10k
  C1: capacitor b8 b11 100n
wires:
  - a2 -- b2
  - b6 -- b8
notes:
  - mark R1 red
`;

/** 消したあとの本文 (行の出し入れを当てる)。 */
const after = (source: string, result: ReturnType<typeof deletePart>): string => {
  if (!result.ok) throw new Error(result.error.message);
  const rows = source.split('\n');
  for (const edit of [...result.value.lines].sort((a, b) => b.line - a.line)) {
    if (edit.kind === 'delete') rows.splice(edit.line - 1, 1);
  }
  return rows.join('\n');
};

describe('deletePart', () => {
  test('drops the line the part is written on', () => {
    const text = after(BOARD, deletePart(BOARD, 'C1'));

    expect(text).not.toContain('C1: capacitor');
    expect(text).toContain('R1: resistor b2 b6 10k');
  });

  test('takes the notes that point at it, which would draw nothing', () => {
    const text = after(BOARD, deletePart(BOARD, 'R1'));

    expect(text).not.toContain('mark R1');
    // 指し先が無くなった注釈は何も描かず、エラーも出ない (黙って効かない行になる)。
    expect(text).not.toContain('notes:');
  });

  test('leaves the wires alone, since they point at holes', () => {
    // circuit は配線が足を指すので連れていくが、こちらの配線は穴を指す。
    const text = after(BOARD, deletePart(BOARD, 'R1'));

    expect(text).toContain('- a2 -- b2');
    expect(text).toContain('- b6 -- b8');
  });

  test('takes the key with the last part, since an empty parts: is unreadable', () => {
    const one = 'board: 12x7\nparts:\n  R1: resistor b2 b6 10k\n';
    const text = after(one, deletePart(one, 'R1'));

    expect(text).not.toContain('parts:');
  });

  test('refuses a part written in flow form, naming the line', () => {
    const flow = 'board: 12x7\nparts: {R1: resistor b2 b6, R2: resistor c2 c6}\n';
    const result = deletePart(flow, 'R1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('フロー形式');
  });

  test('refuses a part it cannot find', () => {
    expect(deletePart(BOARD, 'X9').ok).toBe(false);
  });

  test('tells which connections came apart', () => {
    const result = deletePart(BOARD, 'R1');

    expect(result.ok && result.value.diff.lost.length).toBeGreaterThan(0);
  });
});

describe('deleteWire', () => {
  test('drops the line the wire is written on', () => {
    const text = after(BOARD, deleteWire(BOARD, 6));

    expect(text).not.toContain('- a2 -- b2');
    expect(text).toContain('- b6 -- b8');
  });

  test('takes the key with the last wire', () => {
    const one = 'board: 12x7\nwires:\n  - a1 -- a5\n';
    const text = after(one, deleteWire(one, 3));

    expect(text).not.toContain('wires:');
  });

  test('refuses a line that carries no wire', () => {
    expect(deleteWire(BOARD, 3).ok).toBe(false);
  });
});

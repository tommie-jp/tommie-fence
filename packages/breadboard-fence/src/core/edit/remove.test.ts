import { describe, expect, test } from 'vitest';
import { deletePart, deleteWire } from './remove.ts';

const LED = `board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - a10 -- b12
  - +t5 -- a5 red
notes:
  - circle R1 red
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
    const text = after(LED, deletePart(LED, 'D1'));

    expect(text).not.toContain('D1: led');
    expect(text).toContain('R1: resistor a5 a10 330');
  });

  test('takes the notes that point at it, which would draw nothing', () => {
    const text = after(LED, deletePart(LED, 'R1'));

    expect(text).not.toContain('circle R1');
    // 指し先が無くなった注釈は何も描かず、エラーも出ない (黙って効かない行になる)。
    expect(text).not.toContain('notes:');
  });

  test('leaves the wires alone, since they point at holes', () => {
    // circuit は配線が足を指すので連れていくが、こちらの配線は穴を指す。
    const text = after(LED, deletePart(LED, 'R1'));

    expect(text).toContain('- a10 -- b12');
    expect(text).toContain('- +t5 -- a5 red');
  });

  test('takes the key with the last part, since an empty parts: is unreadable', () => {
    const one = 'board: half\nparts:\n  R1: resistor a5 a10 330\n';
    const text = after(one, deletePart(one, 'R1'));

    expect(text).not.toContain('parts:');
  });

  test('refuses a part written in flow form, naming the line', () => {
    const flow = 'board: half\nparts: {R1: resistor a5 a10, R2: resistor b5 b10}\n';
    const result = deletePart(flow, 'R1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('フロー形式');
  });

  test('refuses a part it cannot find', () => {
    expect(deletePart(LED, 'X9').ok).toBe(false);
  });

  test('tells which connections came apart', () => {
    const result = deletePart(LED, 'R1');

    expect(result.ok && result.value.diff.lost.length).toBeGreaterThan(0);
  });
});

describe('deleteWire', () => {
  test('drops the line the wire is written on', () => {
    const text = after(LED, deleteWire(LED, 6));

    expect(text).not.toContain('- a10 -- b12');
    expect(text).toContain('- +t5 -- a5 red');
  });

  test('takes the key with the last wire', () => {
    const one = 'board: half\nwires:\n  - a5 -- a10\n';
    const text = after(one, deleteWire(one, 3));

    expect(text).not.toContain('wires:');
  });

  test('refuses a line that carries no wire', () => {
    expect(deleteWire(LED, 3).ok).toBe(false);
  });
});

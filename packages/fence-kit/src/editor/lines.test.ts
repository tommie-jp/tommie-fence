import { describe, expect, test } from 'vitest';
import { applyEdits, applyLineEdits, applyRewrite, lineNow, wireEndToken } from './lines.ts';

const SOURCE = 'parts:\n  R1: resistor a9 b9 330\nwires:\n  - a9 -- b9\n';

describe('applyEdits', () => {
  test('replaces the spans it is given, from the right so the columns hold', () => {
    // `a9` → `a10` で 1 桁伸びても、同じ行の `b9` は元の桁で差し替わる。
    const edited = applyEdits(SOURCE, [
      { line: 2, column: 15, length: 2, text: 'a10' },
      { line: 2, column: 18, length: 2, text: 'b10' },
    ]);

    expect(edited).toBe('parts:\n  R1: resistor a10 b10 330\nwires:\n  - a9 -- b9\n');
  });

  test('leaves the source alone when there is nothing to apply', () => {
    expect(applyEdits(SOURCE, [])).toBe(SOURCE);
  });
});

describe('applyRewrite', () => {
  test('applies the column edits before the line edits, since the lines are counted on the original', () => {
    const rewritten = applyRewrite(SOURCE, {
      edits: [{ line: 2, column: 15, length: 2, text: 'c9' }],
      lines: [{ kind: 'insert', line: 3, text: '  R2: resistor c9 d9 1k' }],
    });

    expect(rewritten).toBe('parts:\n  R1: resistor c9 b9 330\n  R2: resistor c9 d9 1k\nwires:\n  - a9 -- b9\n');
  });

  test('accepts a rewrite with either half missing', () => {
    expect(applyRewrite(SOURCE, {})).toBe(SOURCE);
    expect(applyRewrite(SOURCE, { lines: [{ kind: 'delete', line: 4 }] }))
      .toBe(applyLineEdits(SOURCE, [{ kind: 'delete', line: 4 }]));
  });
});

describe('wireEndToken', () => {
  test('finds each end around the operator, so one end can be re-routed', () => {
    // 実機で「配線の先端を選択して、その先端だけ移動できるようにする」。
    const line = '  - a1 -- b2 red';

    expect(wireEndToken(line, ['--'], 'from')).toEqual({ column: 4, length: 2, text: 'a1' });
    expect(wireEndToken(line, ['--'], 'to')).toEqual({ column: 10, length: 2, text: 'b2' });
  });

  test('reads the longer operator first, so a fold is not mistaken for a dash', () => {
    const line = '  - Q1.C -| a5';

    expect(wireEndToken(line, ['--', '-|', '|-'], 'from')).toEqual({ column: 4, length: 4, text: 'Q1.C' });
    expect(wireEndToken(line, ['--', '-|', '|-'], 'to')).toEqual({ column: 12, length: 2, text: 'a5' });
  });

  test('says nothing when the line holds no operator', () => {
    expect(wireEndToken('  - a1', ['--'], 'from')).toBeNull();
  });
});

/**
 * まとめて消すときに、行で指すもの (配線・注釈) の行番号を数え直す道具。
 * **消すのは行ごと**なので、いまの本文は元の行の部分列になっている。
 */
describe('lineNow', () => {
  const WAS = ['a', 'b', 'c', 'd'];

  test('gives the same line back when nothing has been removed', () => {
    expect(lineNow(WAS, WAS, 3)).toBe(3);
  });

  test('counts the line up by however many above it are gone', () => {
    expect(lineNow(WAS, ['b', 'd'], 4)).toBe(2);
    expect(lineNow(WAS, ['b', 'd'], 2)).toBe(1);
  });

  test('says null for a line that is gone, so the caller can skip it', () => {
    expect(lineNow(WAS, ['b', 'd'], 1)).toBeNull();
    expect(lineNow(WAS, ['b', 'd'], 3)).toBeNull();
  });

  test('holds up when the same text is written on two lines', () => {
    // どちらを消したことにしても、消えたあとの本文は同じ。
    expect(lineNow(['a', 'x', 'a', 'b'], ['a', 'a', 'b'], 4)).toBe(3);
  });

  test('says null past the end, since there is no such line', () => {
    expect(lineNow(WAS, WAS, 9)).toBeNull();
  });
});

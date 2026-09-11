import { describe, expect, test } from 'vitest';
import { applyEdits, applyLineEdits, applyRewrite, lineNow, orphanedHeadings, wireEndToken } from './lines.ts';

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

/**
 * **見出しのコメントは、見出していた行が全部消えたら一緒に消える** (52 の docs/47)。
 * 残すと、`parts:` を全部消したあとに `# 増幅段` だけが宙に残る。
 * 1 行でも残っていれば残す — 書き手の見出しを、まだ使っているうちは消さない。
 */
describe('orphanedHeadings', () => {
  const FOLLOWER = [
    'title: 図01', //                  1
    '# 電源は上下の赤レール', //       2
    'board: half', //                  3
    'parts:', //                       4
    '  # 増幅段', //                   5
    '  Q1: transistor h9 h10 h11', //  6
    '  Re: resistor j11 b11 47', //    7
    '  # バイアス', //                 8
    '  R1: resistor d12 d17 10k', //   9
    '  # ボード外', //                10
    '  IN:', //                       11
    '    type: device', //            12
    '    # 左端に置く', //            13
    '    at: top', //                 14
    'wires:', //                      15
    '  # 入力', //                    16
    '  - IN.SIG -- a5 yellow', //     17
    '  - IN.GND -- -t8 black', //     18
    '', //                            19
  ];
  const gone = (...lines: readonly number[]) => orphanedHeadings(FOLLOWER, new Set(lines));

  test('takes a heading once every line under it is gone', () => {
    expect(gone(6, 7)).toEqual([5]);
  });

  test('keeps a heading while one line under it is left', () => {
    expect(gone(6)).toEqual([]);
  });

  test('ends a heading at the next heading of the same depth', () => {
    // `# バイアス` が見出すのは R1 だけ。次の `# ボード外` から先は別の組。
    expect(gone(9)).toEqual([8]);
  });

  test('takes a comment inside a block along with the block', () => {
    expect(gone(11, 12, 14)).toEqual([10, 13]);
  });

  test('takes every heading of a section whose key is gone too', () => {
    expect(gone(4, 6, 7, 9, 11, 12, 14)).toEqual([5, 8, 10, 13]);
  });

  test('ends a top-level heading at the next top-level key', () => {
    // 一番上の鍵はそれぞれが 1 つの物。`# 電源…` は `board:` の見出しで、`parts:` までは見出さない。
    expect(gone(3)).toEqual([2]);
    expect(gone(4, 6, 7, 9, 11, 12, 14)).not.toContain(2);
  });

  test('takes the wires a heading was over, when they go with a part', () => {
    expect(gone(11, 12, 14, 17, 18)).toEqual([10, 13, 16]);
  });

  test('leaves a comment that heads nothing', () => {
    // 空行の前のコメントと、浅い行の前のコメント (塊の終わりに書いた添え書き) は見出しではない。
    const loose = ['parts:', '  # 空行の前', '', '  R1: resistor a1 a3', '  IN:', '    at: top', '    # 終わりの添え書き', 'wires:'];

    expect(orphanedHeadings(loose, new Set([4, 5, 6]))).toEqual([]);
  });

  test('takes a heading written over several lines as one', () => {
    const tall = ['parts:', '  # 増幅段', '  # (コレクタは直結)', '  Q1: npn b5', '  R1: resistor a1 a3'];

    expect(orphanedHeadings(tall, new Set([4, 5]))).toEqual([2, 3]);
  });

  test('reads a list written at the depth of its key as one group', () => {
    const flat = ['wires:', '# 入力', '- a1 -- a2', '- a3 -- a4', 'notes:', '  - source blue'];

    expect(orphanedHeadings(flat, new Set([3]))).toEqual([]);
    expect(orphanedHeadings(flat, new Set([3, 4]))).toEqual([2]);
  });

  test('says nothing when nothing is dropped', () => {
    expect(gone()).toEqual([]);
  });
});

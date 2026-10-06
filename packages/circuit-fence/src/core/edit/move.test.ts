import { describe, expect, test } from 'vitest';
import { anchorOf, movePart, movablePartIds, partSpans } from './move.ts';
import { applyEdits } from './shared.ts';
import { parseAddress } from '../model/address.ts';

/**
 * フロー形式の行に書く番地の名前 (`a1`〜`e9`)。番地 (`1,1`) は `,` を含み、フロー形式では
 * 区切りになるので、フロー形式の試験は名前で書く (旧い綴りの `a1` は、いまは名前に使える)。
 * 本文の**後ろ**に足すので、試験の行番号は変わらない。
 */
const P = `points: {${[...'abcde'].flatMap((row, y) => Array.from({ length: 9 }, (_, x) => `${row}${x + 1}: "${x + 1},${y + 1}"`)).join(', ')}}\n`;

const at = (text: string) => parseAddress(text)!;

const RC = [
  'parts:',
  '  IN:  port 1,1',
  '  R1:  resistor 1,1 3,1 10k',
  '  C1:  capacitor 3,1 3,3 100n',
  '  G1:  ground 3,3',
  'wires:',
  '  - 3,1 -- 4,1',
  '',
].join('\n');

const moved = (source: string, id: string, to: string) => {
  const result = movePart(source, id, at(to));
  if (!result.ok) throw new Error(result.error.message);
  return { ...result.value, source: applyEdits(source, result.value.edits) };
};

describe('movablePartIds', () => {
  test('lists the parts a move can grab', () => {
    expect(movablePartIds(RC)).toEqual(['IN', 'R1', 'C1', 'G1']);
  });

  test('is empty when the fence cannot be read', () => {
    expect(movablePartIds('parts:\n  R1: [unclosed\n')).toEqual([]);
  });
});

describe('movePart', () => {
  test('moves a one-terminal part by rewriting its address', () => {
    expect(moved(RC, 'G1', '3,4').source).toContain('  G1:  ground 3,4');
  });

  test('carries both ends of a two-terminal part by the same step', () => {
    // アンカーは最初の番地。もう一方は**同じ移動量**で動く (形を保つ)。
    expect(moved(RC, 'R1', '1,2').source).toContain('  R1:  resistor 1,2 3,2 10k');
  });

  test('leaves the rest of the line alone, value and all', () => {
    const source = moved(RC, 'C1', '5,1').source;

    expect(source).toContain('  C1:  capacitor 5,1 5,3 100n');
    expect(source).toContain('  R1:  resistor 1,1 3,1 10k');
    expect(source).toContain('  - 3,1 -- 4,1');
  });

  test('keeps the spacing that was written', () => {
    // YAML を組み直さない。手書きの並びとコメントを壊さないため。
    expect(moved(RC, 'G1', '3,4').source.split('\n')).toHaveLength(RC.split('\n').length);
    expect(moved(RC, 'G1', '3,4').source).toContain('  G1:  ground');
  });

  test('moves a part written with a half-step address', () => {
    const source = ['parts:', '  R1:  resistor 1.5,1 3.5,1 1k', ''].join('\n');

    expect(moved(source, 'R1', '1.5,2').source).toContain('resistor 1.5,2 3.5,2 1k');
  });

  test('turns a point name into the new address, and leaves points: alone', () => {
    // 名前の節点から離れるのは**接続の変化**なので、下の差分に出る。
    const source = [
      'points:',
      '  VIN: 1,1',
      'parts:',
      '  R1:  resistor VIN 3,1 10k',
      '',
    ].join('\n');

    const result = moved(source, 'R1', '1,2');

    expect(result.source).toContain('  R1:  resistor 1,2 3,2 10k');
    expect(result.source).toContain('  VIN: 1,1');
  });

  test('says which part it could not find', () => {
    const result = movePart(RC, 'R9', at('1,2'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('R9');
  });

  test('refuses a move that would leave the grid', () => {
    const result = movePart(RC, 'R1', at('99,1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('外');
    expect(!result.ok && result.error.line).toBe(3);
  });

  test('refuses to move a fence it cannot read', () => {
    expect(movePart('parts:\n  R1: [unclosed\n', 'R1', at('1,2')).ok).toBe(false);
  });

  test('says nothing changed when the part is already there', () => {
    const result = movePart(RC, 'G1', at('3,3'));

    expect(result.ok && result.value.edits).toEqual([]);
    expect(result.ok && result.value.diff.lost).toEqual([]);
  });
});

describe('接続の変化', () => {
  test('lists the connections a move breaks', () => {
    // R1 は a1 で IN、a3 で C1 と配線につながっている。動かせば全部離れる。
    const { diff } = moved(RC, 'R1', '1,5');

    expect(diff.lost.length).toBeGreaterThan(0);
    expect(diff.lost.flat()).toContain('R1.1');
    expect(diff.gained).toEqual([]);
  });

  test('lists the connections a move makes', () => {
    const source = [
      'parts:',
      '  R1:  resistor 1,1 3,1 10k',
      '  R2:  resistor 1,3 3,3 1k',
      '',
    ].join('\n');

    const { diff } = moved(source, 'R2', '1,1');

    expect(diff.gained.flat()).toContain('R1.1');
    expect(diff.gained.flat()).toContain('R2.1');
  });

  test('says nothing when a move keeps every connection', () => {
    const source = ['parts:', '  R1:  resistor 1,1 3,1 10k', ''].join('\n');

    expect(moved(source, 'R1', '1,3').diff).toEqual({ lost: [], gained: [] });
  });
});

describe('applyEdits', () => {
  test('applies more than one edit on the same line, right to left', () => {
    const source = 'parts:\n  R1:  resistor 1,1 3,1 10k\n';
    const result = movePart(source, 'R1', at('1,2'));

    expect(result.ok && applyEdits(source, result.value.edits))
      .toBe('parts:\n  R1:  resistor 1,2 3,2 10k\n');
  });

  test('leaves the source alone when there is nothing to do', () => {
    expect(applyEdits(RC, [])).toBe(RC);
  });
});

describe('部品の名前と番地の綴りが同じとき', () => {
  test('rewrites the address, not the part it is named after', () => {
    // `C1:` は番地 `c1` としても読める。**行の頭の名前を書き換えない。**
    const source = ['parts:', '  C1:  capacitor 1,3 3,3 100n', ''].join('\n');

    expect(moved(source, 'C1', '1,4').source).toBe(['parts:', '  C1:  capacitor 1,4 3,4 100n', ''].join('\n'));
  });

  test('moves a part whose id matches its own far end', () => {
    const source = ['parts:', '  A3:  resistor 1,1 3,1 1k', ''].join('\n');

    expect(moved(source, 'A3', '1,2').source).toContain('  A3:  resistor 1,2 3,2 1k');
  });
});

describe('1 行に部品が 2 つ以上あるとき (フロー形式)', () => {
  // フロー形式では `,` が区切りになるので、番地を書いた項目は引用符で囲む。
  const FLOW = 'parts: {R1: "resistor 1,1 3,1", R2: "resistor 3,1 5,1"}\n';

  test('moves the part that was grabbed, not the one written before it', () => {
    // 頭から探し直すと、先に書かれた R1 の `3,1` を二度拾って**掴んでいないほう**が
    // 動く。partSpans は続きの桁から探しているので、光る場所と動く場所が食い違う。
    expect(moved(FLOW, 'R2', '5,2').source).toBe('parts: {R1: "resistor 1,1 3,1", R2: "resistor 5,2 7,2"}\n');
  });

  test('still moves the first part on the line', () => {
    expect(moved(FLOW, 'R1', '1,2').source).toBe('parts: {R1: "resistor 1,2 3,2", R2: "resistor 3,1 5,1"}\n');
  });

  test('lights up the same spelling it rewrites', () => {
    // partSpans が返す桁と、movePart が書き換える桁は同じでなければならない。
    // partSpans の頭は名前 (`R2:` のほう) なので、端子はその次から。
    const terminals = partSpans(FLOW, 'R2').slice(1);
    const result = movePart(FLOW, 'R2', at('5,2'));

    expect(result.ok && result.value.edits.map((edit) => edit.column)).toEqual(
      terminals.map((span) => span.column),
    );
  });

  test('refuses to write an address into a plain flow line, where its comma would split the part', () => {
    // 名前で書いた素の字 (`{R1: resistor a1 a3}`) に番地を書くと、`,` で部品が割れる。
    const named = 'parts: {R1: resistor a1 a3, R2: resistor a3 a5}\n' + P;
    for (const id of ['R1', 'R2']) {
      const result = movePart(named, id, at('5,2'));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.message).toContain('手で');
    }
  });
});

describe('同じ名前が 2 つ以上ある記号', () => {
  const TWO_RAILS = 'parts:\n  VCC: vcc 1,1\n  VCC: vcc 1,3\n  R1: resistor 1,1 3,1\n';

  test('names each of them, so the map can tell them apart', () => {
    expect(movablePartIds(TWO_RAILS)).toEqual(['VCC', 'VCC#2', 'R1']);
  });

  test('moves the one the handle points at, not whichever came first', () => {
    const result = movePart(TWO_RAILS, 'VCC#2', at('1,5'));

    expect(result.ok).toBe(true);
    // 動くのは 3 行目 (2 つ目の VCC) だけ。
    expect(result.ok && result.value.edits.map((edit) => edit.line)).toEqual([3]);
  });

  test('moves the first one when the handle carries no number', () => {
    const result = movePart(TWO_RAILS, 'VCC', at('1,5'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.edits.map((edit) => edit.line)).toEqual([2]);
  });

  test('reads the anchor of the one the handle points at', () => {
    expect(anchorOf(TWO_RAILS, 'VCC#2')).toEqual(at('1,3'));
    expect(anchorOf(TWO_RAILS, 'VCC')).toEqual(at('1,1'));
  });

  test('lights up only that one in the editor', () => {
    expect(partSpans(TWO_RAILS, 'VCC#2').every((span) => span.line === 3)).toBe(true);
  });

  test('says so when the number points at nothing', () => {
    const result = movePart(TWO_RAILS, 'VCC#9', at('1,5'));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('見つかりません');
  });

  test('still moves a part whose name is its own', () => {
    const result = movePart(TWO_RAILS, 'R1', at('5,1'));

    expect(result.ok).toBe(true);
  });
});

// **1 行に 1 部品でも、`{ }` の中ならフロー形式。** 行ごと組み直すと区切りの `,` が消える。
describe('折り返したフロー形式の部品を動かす', () => {
  test('区切りの , を残して番地だけ差し替える', () => {
    const source = 'parts: {\n  R1: "resistor 1,1 3,1",\n  G1: "ground 3,5"\n}\n';
    expect(moved(source, 'R1', '5,6').source).toBe('parts: {\n  R1: "resistor 5,6 7,6",\n  G1: "ground 3,5"\n}\n');
  });
});

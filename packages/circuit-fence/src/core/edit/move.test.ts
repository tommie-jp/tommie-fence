import { describe, expect, test } from 'vitest';
import { anchorOf, movePart, movablePartIds, partSpans } from './move.ts';
import { applyEdits } from './shared.ts';
import { parseAddress } from '../model/address.ts';

const at = (text: string) => parseAddress(text)!;

const RC = [
  'parts:',
  '  IN:  port a1',
  '  R1:  resistor a1 a3 10k',
  '  C1:  capacitor a3 c3 100n',
  '  G1:  ground c3',
  'wires:',
  '  - a3 -- a4',
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
    expect(moved(RC, 'G1', 'd3').source).toContain('  G1:  ground d3');
  });

  test('carries both ends of a two-terminal part by the same step', () => {
    // アンカーは最初の番地。もう一方は**同じ移動量**で動く (形を保つ)。
    expect(moved(RC, 'R1', 'b1').source).toContain('  R1:  resistor b1 b3 10k');
  });

  test('leaves the rest of the line alone, value and all', () => {
    const source = moved(RC, 'C1', 'a5').source;

    expect(source).toContain('  C1:  capacitor a5 c5 100n');
    expect(source).toContain('  R1:  resistor a1 a3 10k');
    expect(source).toContain('  - a3 -- a4');
  });

  test('keeps the spacing that was written', () => {
    // YAML を組み直さない。手書きの並びとコメントを壊さないため。
    expect(moved(RC, 'G1', 'd3').source.split('\n')).toHaveLength(RC.split('\n').length);
    expect(moved(RC, 'G1', 'd3').source).toContain('  G1:  ground');
  });

  test('moves a part written with a half-step address', () => {
    const source = ['parts:', '  R1:  resistor a_1.5 a_3.5 1k', ''].join('\n');

    expect(moved(source, 'R1', 'b_1.5').source).toContain('resistor b_1.5 b_3.5 1k');
  });

  test('turns a point name into the new address, and leaves points: alone', () => {
    // 名前の節点から離れるのは**接続の変化**なので、下の差分に出る。
    const source = [
      'points:',
      '  VIN: a1',
      'parts:',
      '  R1:  resistor VIN a3 10k',
      '',
    ].join('\n');

    const result = moved(source, 'R1', 'b1');

    expect(result.source).toContain('  R1:  resistor b1 b3 10k');
    expect(result.source).toContain('  VIN: a1');
  });

  test('says which part it could not find', () => {
    const result = movePart(RC, 'R9', at('b1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('R9');
  });

  test('refuses a move that would leave the grid', () => {
    const result = movePart(RC, 'R1', at('a99'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('外');
    expect(!result.ok && result.error.line).toBe(3);
  });

  test('refuses to move a fence it cannot read', () => {
    expect(movePart('parts:\n  R1: [unclosed\n', 'R1', at('b1')).ok).toBe(false);
  });

  test('says nothing changed when the part is already there', () => {
    const result = movePart(RC, 'G1', at('c3'));

    expect(result.ok && result.value.edits).toEqual([]);
    expect(result.ok && result.value.diff.lost).toEqual([]);
  });
});

describe('接続の変化', () => {
  test('lists the connections a move breaks', () => {
    // R1 は a1 で IN、a3 で C1 と配線につながっている。動かせば全部離れる。
    const { diff } = moved(RC, 'R1', 'e1');

    expect(diff.lost.length).toBeGreaterThan(0);
    expect(diff.lost.flat()).toContain('R1.1');
    expect(diff.gained).toEqual([]);
  });

  test('lists the connections a move makes', () => {
    const source = [
      'parts:',
      '  R1:  resistor a1 a3 10k',
      '  R2:  resistor c1 c3 1k',
      '',
    ].join('\n');

    const { diff } = moved(source, 'R2', 'a1');

    expect(diff.gained.flat()).toContain('R1.1');
    expect(diff.gained.flat()).toContain('R2.1');
  });

  test('says nothing when a move keeps every connection', () => {
    const source = ['parts:', '  R1:  resistor a1 a3 10k', ''].join('\n');

    expect(moved(source, 'R1', 'c1').diff).toEqual({ lost: [], gained: [] });
  });
});

describe('applyEdits', () => {
  test('applies more than one edit on the same line, right to left', () => {
    const source = 'parts:\n  R1:  resistor a1 a3 10k\n';
    const result = movePart(source, 'R1', at('b1'));

    expect(result.ok && applyEdits(source, result.value.edits))
      .toBe('parts:\n  R1:  resistor b1 b3 10k\n');
  });

  test('leaves the source alone when there is nothing to do', () => {
    expect(applyEdits(RC, [])).toBe(RC);
  });
});

describe('部品の名前と番地の綴りが同じとき', () => {
  test('rewrites the address, not the part it is named after', () => {
    // `C1:` は番地 `c1` としても読める。**行の頭の名前を書き換えない。**
    const source = ['parts:', '  C1:  capacitor c1 c3 100n', ''].join('\n');

    expect(moved(source, 'C1', 'd1').source).toBe(['parts:', '  C1:  capacitor d1 d3 100n', ''].join('\n'));
  });

  test('moves a part whose id matches its own far end', () => {
    const source = ['parts:', '  A3:  resistor a1 a3 1k', ''].join('\n');

    expect(moved(source, 'A3', 'b1').source).toContain('  A3:  resistor b1 b3 1k');
  });
});

describe('1 行に部品が 2 つ以上あるとき (フロー形式)', () => {
  const FLOW = 'parts: {R1: resistor a1 a3, R2: resistor a3 a5}\n';

  test('moves the part that was grabbed, not the one written before it', () => {
    // 頭から探し直すと、先に書かれた R1 の `a3` を二度拾って**掴んでいないほう**が
    // 動く。partSpans は続きの桁から探しているので、光る場所と動く場所が食い違う。
    expect(moved(FLOW, 'R2', 'b5').source).toBe('parts: {R1: resistor a1 a3, R2: resistor b5 b7}\n');
  });

  test('still moves the first part on the line', () => {
    expect(moved(FLOW, 'R1', 'b1').source).toBe('parts: {R1: resistor b1 b3, R2: resistor a3 a5}\n');
  });

  test('lights up the same spelling it rewrites', () => {
    // partSpans が返す桁と、movePart が書き換える桁は同じでなければならない。
    // partSpans の頭は名前 (`R2:` のほう) なので、端子はその次から。
    const terminals = partSpans(FLOW, 'R2').slice(1);
    const result = movePart(FLOW, 'R2', at('b5'));

    expect(result.ok && result.value.edits.map((edit) => edit.column)).toEqual(
      terminals.map((span) => span.column),
    );
  });
});

describe('同じ名前が 2 つ以上ある記号', () => {
  const TWO_RAILS = 'parts:\n  VCC: vcc a1\n  VCC: vcc c1\n  R1: resistor a1 a3\n';

  test('names each of them, so the map can tell them apart', () => {
    expect(movablePartIds(TWO_RAILS)).toEqual(['VCC', 'VCC#2', 'R1']);
  });

  test('moves the one the handle points at, not whichever came first', () => {
    const result = movePart(TWO_RAILS, 'VCC#2', at('e1'));

    expect(result.ok).toBe(true);
    // 動くのは 3 行目 (2 つ目の VCC) だけ。
    expect(result.ok && result.value.edits.map((edit) => edit.line)).toEqual([3]);
  });

  test('moves the first one when the handle carries no number', () => {
    const result = movePart(TWO_RAILS, 'VCC', at('e1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.edits.map((edit) => edit.line)).toEqual([2]);
  });

  test('reads the anchor of the one the handle points at', () => {
    expect(anchorOf(TWO_RAILS, 'VCC#2')).toEqual(at('c1'));
    expect(anchorOf(TWO_RAILS, 'VCC')).toEqual(at('a1'));
  });

  test('lights up only that one in the editor', () => {
    expect(partSpans(TWO_RAILS, 'VCC#2').every((span) => span.line === 3)).toBe(true);
  });

  test('says so when the number points at nothing', () => {
    const result = movePart(TWO_RAILS, 'VCC#9', at('e1'));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('見つかりません');
  });

  test('still moves a part whose name is its own', () => {
    const result = movePart(TWO_RAILS, 'R1', at('a5'));

    expect(result.ok).toBe(true);
  });
});

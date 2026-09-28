import { describe, expect, test } from 'vitest';
import { PIN_NAME_GAP, pinNameInner, pinNameRow, pinNameWidth } from './pinNameRow.ts';

/**
 * 板の外の機器の足の名前は横 1 列に並ぶ。**隣の名前と字が触れない**ことだけを見る
 * (PIR の `GND VCC OUT` が隣の穴へ落ちると `GNDVCCOUT` と地続きに読めた)。
 */
type Name = { readonly x: number; readonly name: string };

/** 同じ段に並ぶ名前どうしの字の隙間 (中央揃えなので、中心の間から幅の半分ずつを引く)。 */
function gaps(names: readonly Name[], size: number, staggered: boolean): number[] {
  const sorted = [...names].sort((a, b) => a.x - b.x);
  const step = staggered ? 2 : 1;
  const result: number[] = [];
  for (let i = step; i < sorted.length; i += 1) {
    const [a, b] = [sorted[i - step]!, sorted[i]!];
    result.push(b.x - a.x - (pinNameWidth(a.name) + pinNameWidth(b.name)) * size / 2);
  }
  return result;
}

const row = (xs: readonly number[], names: readonly string[]): Name[] =>
  names.map((name, index) => ({ x: xs[index]!, name }));

describe('pinNameRow', () => {
  test('間が広ければ既定の大きさのまま 1 段', () => {
    const result = pinNameRow([0, 40, 80], ['GND', 'VCC', 'OUT'], { largest: 8.5, smallest: 6 });
    expect(result).toEqual({ size: 8.5, staggered: false });
  });

  test('隣の穴 (20 おき) に落ちた GND VCC OUT は、縮めて字の間を空ける', () => {
    const xs = [0, 20, 40];
    const names = ['GND', 'VCC', 'OUT'];
    const result = pinNameRow(xs, names, { largest: 12, smallest: 6 });
    expect(result.staggered).toBe(false);
    expect(result.size).toBeLessThan(12);
    expect(result.size).toBeGreaterThanOrEqual(6);
    for (const gap of gaps(row(xs, names), result.size, false)) expect(gap).toBeGreaterThanOrEqual(PIN_NAME_GAP - 1e-9);
  });

  test('下限まで縮めても入らなければ 2 段に互い違いに置き、同じ段の隣とも触れない', () => {
    const xs = [0, 20, 40, 60];
    const names = ['SIGNAL', 'ENABLE', 'SIGNAL', 'ENABLE'];
    const result = pinNameRow(xs, names, { largest: 12, smallest: 6 });
    expect(result.staggered).toBe(true);
    for (const gap of gaps(row(xs, names), result.size, true)) expect(gap).toBeGreaterThanOrEqual(PIN_NAME_GAP - 1e-9);
  });

  test('足が 1 本なら縮めない', () => {
    expect(pinNameRow([10], ['SIGNAL'], { largest: 9, smallest: 6 })).toEqual({ size: 9, staggered: false });
  });

  test('足の並び順に依らない (x で並べ直して隣を決める)', () => {
    const one = pinNameRow([40, 0, 20], ['OUT', 'GND', 'VCC'], { largest: 12, smallest: 6 });
    const other = pinNameRow([0, 20, 40], ['GND', 'VCC', 'OUT'], { largest: 12, smallest: 6 });
    expect(one).toEqual(other);
  });

  test('名前の幅は大文字の見積もり (半角 0.55 より広い)', () => {
    expect(pinNameWidth('GND')).toBeGreaterThan(3 * 0.55);
  });

  test('互い違いの段は x の順で 1 つおき (書いた順ではない)', () => {
    const xs = [40, 0, 20, 60];
    expect(xs.map((_, index) => pinNameInner(xs, index))).toEqual([false, false, true, true]);
  });

  test('within を渡すと、端の名前も箱から出ない大きさにする', () => {
    const result = pinNameRow([6, 40], ['GND', 'VCC'], { largest: 12, smallest: 4, within: { left: 0, right: 50 } });
    expect(6 - pinNameWidth('GND') * result.size / 2).toBeGreaterThanOrEqual(-1e-9);
  });
});

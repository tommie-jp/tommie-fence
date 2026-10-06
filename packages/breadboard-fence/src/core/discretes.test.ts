import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';

/**
 * 3 ピンのディスクリート (52 の docs/117)。穴にピンの名前を書かず、型番が fence-kit の表にあれば、
 * 書いた穴の順 (印字面を手前に、左から) に表の名前で呼ぶ。書いた名前が先。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');
const refsOf = (text: string): readonly string[] => renderBreadboard(text).netlist.flatMap((net) => net.refs);

describe('3 ピンのディスクリートのピンの名前', () => {
  test('names the legs of a 2SC1815 E C B from the left', () => {
    expect(refsOf(fence('parts:', '  Q1: transistor f5 f6 f7 2SC1815'))).toEqual(expect.arrayContaining(['Q1.E', 'Q1.C', 'Q1.B']));
  });

  test('names a 2N3904 E B C and a BS170 D G S, which differ in the same package', () => {
    expect(refsOf(fence('parts:', '  Q1: transistor f5 f6 f7 2N3904', '  Q2: transistor f10 f11 f12 BS170')))
      .toEqual(expect.arrayContaining(['Q1.E', 'Q1.B', 'Q1.C', 'Q2.D', 'Q2.G', 'Q2.S']));
  });

  test('still reaches a leg by its number', () => {
    const result = renderBreadboard(fence('parts:', '  Q1: transistor f5 f6 f7 2SC1815', 'wires:', '  - Q1.1 -- j10 red'));
    expect(result.errors).toEqual([]);
  });

  test('keeps the names written on the holes', () => {
    expect(refsOf(fence('parts:', '  Q1: transistor f5(B) f6(C) f7(E) 2SC1815'))).toEqual(expect.arrayContaining(['Q1.B', 'Q1.C', 'Q1.E']));
  });

  test('numbers the legs for a model that is not in the table', () => {
    expect(refsOf(fence('parts:', '  Q1: transistor f5 f6 f7 BC547'))).toEqual(expect.arrayContaining(['Q1.1', 'Q1.2', 'Q1.3']));
  });

  test('names the legs of a regulator in the order of its package', () => {
    expect(refsOf(fence('parts:', '  U1: regulator f5 f6 f7 7805'))).toEqual(expect.arrayContaining(['U1.IN', 'U1.GND', 'U1.OUT']));
  });
});

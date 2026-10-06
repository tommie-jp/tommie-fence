import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * 3 ピンのディスクリート (52 の docs/119)。型番が fence-kit の表にあれば、書いた穴の順
 * (印字面を手前に、左から) に表の名前で呼ぶ。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');
const refsOf = (text: string): readonly string[] => renderPerfboard(text).netlist.flatMap((net) => net.refs);

describe('3 ピンのディスクリートのピンの名前', () => {
  test('names the legs of a 2SC1815 E C B from the left', () => {
    expect(refsOf(fence('parts:', '  Q1: transistor c3 c4 c5 2SC1815', 'wires:', '  - c3 -- e3', '  - c4 -- e4', '  - c5 -- e5')))
      .toEqual(expect.arrayContaining(['Q1.E', 'Q1.C', 'Q1.B']));
  });

  test('names a 2N7000 S G D and a BS170 D G S', () => {
    expect(refsOf(fence('parts:', '  Q1: transistor c3 c4 c5 2N7000', '  Q2: transistor c9 c10 c11 BS170', 'wires:', '  - c3 -- e3', '  - c9 -- e9')))
      .toEqual(expect.arrayContaining(['Q1.S', 'Q1.G', 'Q1.D', 'Q2.D', 'Q2.G', 'Q2.S']));
  });

  test('numbers the legs for a model that is not in the table', () => {
    expect(refsOf(fence('parts:', '  Q1: transistor c3 c4 c5 BC547'))).toEqual(expect.arrayContaining(['Q1.1', 'Q1.2', 'Q1.3']));
  });

  test('names the legs of a regulator in the order of its package', () => {
    expect(refsOf(fence('parts:', '  U1: regulator c3 c4 c5 78L05'))).toEqual(expect.arrayContaining(['U1.OUT', 'U1.GND', 'U1.IN']));
  });
});

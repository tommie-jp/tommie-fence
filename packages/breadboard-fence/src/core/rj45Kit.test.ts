import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';

/**
 * RJ45 の DIP 化キット (秋月 105404)。**`sip8` + 型番**で、ピンの名前の表から `P1`〜`P8` を引き、
 * ヘッダを銀の帯で描く (ユニバーサル基板と同じ表)。
 */
const texts = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(([, text]) => text ?? '');

describe('RJ45 の DIP 化キット (sip8 + 105404)', () => {
  test('lists the pins by the jack pin names', () => {
    const { errors, netlist } = renderBreadboard('parts:\n  J1: sip8 @ a10 105404\n');

    expect(errors).toEqual([]);
    const refs = netlist.flatMap((net) => net.refs);
    expect(refs).toEqual(expect.arrayContaining(['J1.P1', 'J1.P2', 'J1.P3', 'J1.P6']));
    expect(refs.some((ref) => /^J1\.\d+$/.test(ref))).toBe(false);
  });

  test('draws the header as a silver strip with the pin names', () => {
    const { svg } = renderBreadboard('parts:\n  J1: sip8 @ a10 105404\n');

    expect(svg).toContain('#b9bec5');
    expect(texts(svg)).toEqual(expect.arrayContaining(['P1', 'P3', 'P6', 'P8']));
  });
});

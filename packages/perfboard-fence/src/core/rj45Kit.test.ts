import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * RJ45 の DIP 化キット (秋月 105404)。**`sip8` + 型番**で、ピンの名前の表から `P1`〜`P8` を引き、
 * ヘッダを銀の帯で描く (52 の 05-etc 第 5 章で、ルータの線を基板に引き込む部品)。
 */
const fence = (...lines: string[]): string => ['board: 20x12', ...lines, ''].join('\n');
const texts = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(([, text]) => text ?? '');

describe('RJ45 の DIP 化キット (sip8 + 105404)', () => {
  test('lists the pins by the jack pin names, whichever spelling of the model is written', () => {
    for (const model of ['105404', 'AE-RJ-45-LAN-DIP-A', 'AE-RJ-45-LAN-DIP-A-KIT']) {
      const { errors, netlist } = renderPerfboard(fence('parts:', `  J1: sip8 c3 ${model}`));

      expect(errors, model).toEqual([]);
      const refs = netlist.flatMap((net) => net.refs);
      expect(refs, model).toEqual(expect.arrayContaining(['J1.P1', 'J1.P2', 'J1.P3', 'J1.P6']));
      expect(refs.some((ref) => /^J1\.\d+$/.test(ref)), model).toBe(false);
    }
  });

  test('draws the header as a silver strip with the pin names beside it, also when turned upright', () => {
    for (const where of ['c3', 'c3 r90']) {
      const { svg } = renderPerfboard(fence('parts:', `  J1: sip8 ${where} 105404`));

      expect(svg, where).toContain('#b9bec5');
      expect(texts(svg), where).toEqual(expect.arrayContaining(['P1', 'P3', 'P6', 'P8']));
    }
  });
});

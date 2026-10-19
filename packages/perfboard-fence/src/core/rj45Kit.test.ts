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

const plateX = (svg: string): number => Number(/<rect x="([\d.]+)" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="4"/.exec(svg)?.[1]);
const canvasWidth = (svg: string): number => Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
const rectOf = (svg: string, name: string): { x: number; width: number } | null => {
  const match = new RegExp(`<rect class="${name}" x="([\\d.-]+)" y="[\\d.-]+" width="([\\d.]+)"`).exec(svg);
  return match === null ? null : { x: Number(match[1]), width: Number(match[2]) };
};
const textX = (svg: string, word: string): number => Number(new RegExp(`<text x="([\\d.]+)"[^>]*>${word}</text>`).exec(svg)?.[1]);

describe('キットの基板とジャックの外形', () => {
  test('draws the kit board and the jack beside the header', () => {
    const { svg } = renderPerfboard(fence('parts:', '  J1: sip8 c1 r90 105404'));

    expect(svg).toContain('class="module-board"');
    expect(svg).toContain('class="module-jack"');
    expect(svg).toContain('>RJ45<');
  });

  test('sticks out past the nearer edge of the board, and the canvas grows to keep it in', () => {
    const plain = renderPerfboard(fence('parts:', '  J1: sip8 c1 r90')).svg;
    const { svg } = renderPerfboard(fence('parts:', '  J1: sip8 c1 r90 105404'));
    const jack = rectOf(svg, 'module-jack');

    // 1 列目に立てたので左へ張り出す。基板はそのぶん右へずれ、外形は画布の中に収まる。
    expect(jack).not.toBeNull();
    expect(jack!.x).toBeGreaterThanOrEqual(0);
    expect(jack!.x + jack!.width).toBeLessThan(plateX(svg) + 20);
    expect(plateX(svg)).toBeGreaterThan(plateX(plain));
    expect(canvasWidth(svg)).toBeGreaterThan(canvasWidth(plain));
  });

  test('turns to the right edge when the header stands in the last column, with the pin names on the board side', () => {
    const { svg } = renderPerfboard(fence('parts:', '  J1: sip8 c20 r90 105404'));
    const jack = rectOf(svg, 'module-jack');

    expect(jack!.x).toBeGreaterThan(textX(svg, 'P3'));
  });

  test('keeps the name of an upright header clear of its pin names', () => {
    const { svg } = renderPerfboard(fence('parts:', '  J1: sip8 c10 r90 105404'));
    const caption = /<g transform="translate\(([\d.]+) [\d.]+\) rotate\([-\d.]+\)"><text[^>]*>J1 105404<\/text>/.exec(svg);
    const names = textX(svg, 'P3');

    expect(caption).not.toBeNull();
    // 名札の中心は、ピンの名前の列から字の幅のぶん以上離れる (同じ脇なら名前の外、でなければ反対の脇)。
    expect(Math.abs(Number(caption![1]) - names)).toBeGreaterThan(6);
  });
});

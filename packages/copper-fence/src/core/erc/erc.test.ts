import { describe, expect, test } from 'vitest';
import { renderCopper } from '../index.ts';

const erc = (lines: readonly string[]): string[] => renderCopper(lines.join('\n')).erc.map((said) => said.message);
const THROUGH = ['board: 40x20mm', 'copper:', '  L1: line 0,10 40,10 3'];

describe('checkErc', () => {
  test('says nothing about a well-made through line', () => {
    expect(erc([...THROUGH, 'parts:', '  J1: sma left 10', '  J2: sma right 10', '  C1: capacitor/1608 20,10'])).toEqual([]);
  });

  test('names a pin that sits on no copper', () => {
    expect(erc([...THROUGH, 'parts:', '  C1: capacitor/1608 20,3'])).toEqual([
      'C1 の 1 番の足 (19.36,3) の下に銅がありません',
      'C1 の 2 番の足 (20.64,3) の下に銅がありません',
    ]);
  });

  test('names a chip whose ends share one copper, and says why that happens', () => {
    const shorted = erc([...THROUGH, 'parts:', '  C1: capacitor/3216 20,10 r90']);
    expect(shorted).toEqual([expect.stringMatching(/C1 の 1 番と 2 番が同じ銅 \(L1\) に乗っています \(線路の上に置くと切れ目ができます/)]);
  });

  test('names a two-pin part with both ends on the ground, but not a box with many ground pins', () => {
    const front = ['board:', '  size: 40x20mm', '  ground: front'];
    expect(erc([...front, 'parts:', '  C1: capacitor/1608 30,5'])).toEqual([expect.stringMatching(/C1 の 1 番と 2 番が同じ銅 \(GND\)/)]);
    expect(erc([...front, 'parts:', '  U1: box 30,10 4x4 4'])).toEqual([]);
  });

  test('names an SMA whose centre pin lies on the ground of the front', () => {
    const front = ['board:', '  size: 40x20mm', '  ground: front', 'copper:'];
    expect(erc([...front, '  P1: pad 3,10 4x2', 'parts:', '  J1: sma left 10'])).toEqual([
      'J1 の中心導体 (0.05,10) が表の地に触れています (縁まで島か線路を伸ばします)',
    ]);
    expect(erc([...front, '  P1: pad 2.5,10 5x2', 'parts:', '  J1: sma left 10'])).toEqual([]);
  });

  test('takes a via that touches no copper on a front-ground board as part of the ground', () => {
    const result = renderCopper(['board:', '  size: 40x20mm', '  ground: both', 'copper:', '  V1: via 20,5', 'parts:', '  C1: capacitor/1608 20,5.5'].join('\n'));
    expect(result.netlist.map((net) => net.name)).toEqual(['GND']);
    expect(result.svg).not.toContain('data-net="V1"');
  });

  test('names the end of a jumper that lands on no copper', () => {
    expect(erc([...THROUGH, 'wires:', '  - 5,10 -- 5,3'])).toEqual(['配線の端 (5,3) の下に銅がありません']);
  });

  test('warns about widths, grooves and gaps too narrow to cut by hand', () => {
    const said = erc([
      'board:', '  size: 40x20mm', '  ground: both', 'copper:',
      '  L1: line 0,10 40,10 0.2 gap 0.15',
      '  L2: line 0,4 40,4 1 gap 0.5',
      '  L3: line 0,5.2 40,5.2 1 gap 0.5',
    ]);
    expect(said).toEqual(expect.arrayContaining([
      expect.stringMatching(/L1 の幅 0.2mm は手で残すには細すぎます/),
      expect.stringMatching(/L1 の溝 0.15mm は手で切るには細すぎます/),
      expect.stringMatching(/L2 と L3 の隙間 0.2mm は手で切るには細すぎます/),
    ]));
  });

  test('is not run while something could not be read, and says so', () => {
    const result = renderCopper([...THROUGH, 'parts:', '  C1: capacitor/1608 20,3', '  C2: flux 1,1'].join('\n'));
    expect(result.erc).toEqual([]);
    expect(result.notices.map((said) => said.message)).toContain('読めなかったところがあるので ERC は掛けていません (直すと掛かります)');
  });

  test('is not run when the figure turns it off', () => {
    expect(erc([...THROUGH, 'parts:', '  C1: capacitor/1608 20,3', 'style:', '  check: off'])).toEqual([]);
  });
});

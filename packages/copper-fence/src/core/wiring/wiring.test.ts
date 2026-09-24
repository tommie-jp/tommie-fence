import { describe, expect, test } from 'vitest';
import { renderCopper } from '../index.ts';

const nets = (source: string): Record<string, string[]> =>
  Object.fromEntries(renderCopper(source).netlist.map((net) => [net.name, [...net.refs].sort()]));

describe('the netlist', () => {
  test('puts the two SMA centres on the through line and their shells on the ground', () => {
    expect(nets(['board: 40x20mm', 'copper:', '  L1: line 0,10 40,10 3', 'parts:', '  J1: sma left 10', '  J2: sma right 10'].join('\n')))
      .toEqual({ L1: ['J1.1', 'J2.1'], GND: ['J1.2', 'J2.2'] });
  });

  test('splits the line under a series chip into two nets', () => {
    expect(nets([
      'board: 40x20mm', 'copper:', '  L1: line 0,10 40,10 3',
      'parts:', '  J1: sma left 10', '  J2: sma right 10', '  C1: capacitor/1608 20,10',
    ].join('\n'))).toEqual({ L1: ['C1.1', 'J1.1'], 'L1~2': ['C1.2', 'J2.1'], GND: ['J1.2', 'J2.2'] });
  });

  test('drops a pad to the ground through a via on a board with a back ground', () => {
    const source = [
      'board: 40x20mm', 'copper:', '  L1: line 0,10 40,10 3', '  P1: pad 20,13.5 3x2', '  V1: via 20,14',
      'parts:', '  C1: capacitor/1608 20,12 r90',
    ].join('\n');
    expect(nets(source)).toMatchObject({ L1: ['C1.1'], GND: ['C1.2'] });
    expect(nets(source.replace('board: 40x20mm', 'board:\n  size: 40x20mm\n  ground: none'))).toMatchObject({ P1: ['C1.2'] });
  });

  test('takes the copper around the islands as the ground when the ground is on the front', () => {
    const source = [
      'board:', '  size: 40x20mm', '  ground: front',
      'copper:', '  P1: pad 10,10 4x4',
      'parts:', '  R1: resistor P1 20,10', '  R2: resistor P1 11.5,10',
    ].join('\n');
    expect(nets(source)).toEqual({ P1: ['R1.1', 'R2.1', 'R2.2'], GND: ['R1.2'] });
    // 溝 (島のまわり 0.5mm) の上は地ではない。
    expect(renderCopper(source.replace('20,10', '12.3,10')).erc.map((said) => said.message))
      .toEqual(expect.arrayContaining([expect.stringMatching(/R1 の 2 番の足 \(12.3,10\) の下に銅がありません/)]));
  });

  test('gives the shell of an SMA its own net when there is no ground', () => {
    expect(nets(['board:', '  size: 40x20mm', '  ground: none', 'copper:', '  L1: line 0,10 40,10 3', 'parts:', '  J1: sma left 10'].join('\n')))
      .toEqual({ L1: ['J1.1'], N1: ['J1.2'] });
  });

  test('joins islands with a jumper, and resolves its ends by name or by point', () => {
    const source = [
      'board: 40x20mm', 'copper:', '  P1: pad 5,5', '  P2: pad 30,5',
      'parts:', '  R1: resistor P1 10,15', '  R2: resistor P2 35,15',
      'wires:', '  - P1 -- 30,5',
    ].join('\n');
    expect(nets(source).P1).toEqual(['R1.1', 'R2.1']);
  });

  test('refuses an end that is a line, a slot, a part or nothing at all', () => {
    const said = (end: string) => renderCopper([
      'board: 40x20mm', 'copper:', '  L1: line 0,10 40,10 3', '  X1: slot 20,18 4x1', 'parts:', '  J1: sma left 10',
      'wires:', `  - ${end} -- 5,5`,
    ].join('\n')).errors.map((error) => error.message).join('\n');
    expect(said('L1')).toMatch(/線路の名前は端にできません: L1/);
    expect(said('X1')).toMatch(/切り欠きは銅ではありません/);
    expect(said('J1')).toMatch(/部品の名前は端にできません/);
    expect(said('Q7')).toMatch(/島の名前でも点でもありません: Q7/);
  });
});

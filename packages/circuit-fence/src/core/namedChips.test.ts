import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { gridMap } from './edit/map.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType, lookupPin, partTypeOf } from './parts.ts';
import { parseFence } from './parser/parseFence.ts';

/**
 * ピンに名前のある DIP 型 (リレー・フォトカプラ・7 セグ。52 の docs/66 の段 4・5)。
 * **ピンの名前と番号はブレッドボードとユニバーサル基板と同じ表** (fence-kit)。回路図では、リレーと
 * フォトカプラは記号で、7 セグは名前を刷った箱で描く。
 */

const circuit = (...rows: string[]): string => [...rows, ''].join('\n');

describe('種類', () => {
  test('takes a relay pin by its name or by its DIP number', () => {
    const relay = lookupPartType('relay')!;

    expect(lookupPin(relay, 'COM1')).toBe(lookupPin(relay, '4'));
    expect(lookupPin(relay, 'a1')).toBe(lookupPin(relay, '1'));
    expect(lookupPin(relay, 'NO2')).toBe(lookupPin(relay, '9'));
    expect(lookupPin(relay, '2')).toBeNull();
    expect(PART_NAMES.relay).toBe('リレー');
    expect(PART_PREFIXES.relay).toBe('K');
  });

  test('knows the 4N35 by the same names and DIP numbers as the boards, and leaves NC and the base undrawn', () => {
    const opto = lookupPartType('photocoupler6')!;
    expect(lookupPin(opto, 'E')).toBe(lookupPin(opto, '4'));
    expect(lookupPin(opto, 'C')).toBe(lookupPin(opto, '5'));
    expect(lookupPin(opto, 'K')).toBe(lookupPin(opto, '2'));
    expect(lookupPin(opto, 'A')).toBe(lookupPin(opto, '1'));
    expect(lookupPin(opto, 'NC')).toBeNull();
    expect(PART_NAMES.photocoupler6).toBe('フォトカプラ');
    expect(PART_PREFIXES.photocoupler6).toBe('U');
  });

  test('knows the photocoupler and the display by the same names as the boards', () => {
    expect(lookupPin(lookupPartType('photocoupler')!, 'C')).toBe(lookupPin(lookupPartType('photocoupler')!, '4'));
    expect(lookupPin(lookupPartType('seg7')!, 'dp')).toBe(lookupPin(lookupPartType('seg7')!, '5'));
    expect(PART_PREFIXES.seg7).toBe('DS');
  });
});

describe('図', () => {
  test('draws a relay, wires to its contacts by name and lists them by name', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  K1: relay 5,4',
      '  R1: resistor 9,1 11,1 1k',
      'wires:',
      '  - K1.NO1 |- 9,1',
    ), { erc: true });

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('pgfdeclareshape{relay2c}');
    expect(result.netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('K1.NO1');
    // 使わない接点は言わない (2 回路のうち 1 つしか使わないのが普通)。
    expect(result.erc.map((one) => one.message).join('\n')).not.toContain('K1');
  });

  test('draws a photocoupler and a display', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  U1: photocoupler 5,4 PC817',
      '  DS1: seg7 12,4',
    ));

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('pgfdeclareshape{opto4}');
    expect(result.tex).toContain('{$\\mathrm{PC817}$}');
  });
});

describe('7 セグの箱の幅', () => {
  test('widens the box for a longer part number, as a device does', () => {
    // 箱の中に型番を刷るので、表の 5161AS より長い型番なら箱も広げる。
    const [short, long] = parseFence(circuit('parts:', '  DS1: seg7 4,3 5161AS', '  DS2: seg7 10,3 LTS-547AHR')).doc.parts;
    const shortSymbol = partTypeOf(short!)?.symbol;
    const longSymbol = partTypeOf(long!)?.symbol;

    expect(longSymbol).not.toBe(shortSymbol);
    expect(shortSymbol).toBe(lookupPartType('seg7')?.symbol);
    expect(compileCircuit(circuit('parts:', '  DS2: seg7 10,3 LTS-547AHR')).tex).toContain(`pgfdeclareshape{${longSymbol}}`);
  });
});

describe('升目と ERC', () => {
  test('lays the relay legs out on the map in the order the symbol draws them', () => {
    const map = gridMap(circuit('parts:', '  K1: relay 5,4'));
    const pins = map.chips[0]?.pins ?? [];

    // 上はコイルの A1、接点 1 の NC・NO、接点 2 の NC・NO。下は A2 と共通 2 つ。
    expect(pins.filter((pin) => pin.side === 'top').map((pin) => pin.name)).toEqual(['A1', 'NC1', 'NO1', 'NC2', 'NO2']);
    expect(pins.filter((pin) => pin.side === 'bottom').map((pin) => pin.name)).toEqual(['A2', 'COM1', 'COM2']);
  });

  test('still asks for every photocoupler leg, since all four are needed', () => {
    const result = compileCircuit(circuit(
      'parts:', '  U1: photocoupler 5,4', '  R1: resistor 1,1 3,1 1k', 'wires:', '  - 3,1 -| U1.A',
    ), { erc: true });

    // ピンは名前で言う (番号の鍵が先に並んでも `1` とは言わない)。
    expect(result.erc.map((one) => one.message).join('\n')).toContain('U1 のピン K、C、E をどの配線も指していません');
  });
});

describe('リレーの型番', () => {
  // 回した・反転したリレーの型番 (G5V-2) が記号の真ん中に出て、コイルと接点を結ぶ破線に重なった。
  // 型番は回さない図と同じく**接点の外側** (記号の `value` アンカー) に出し、字は外へ寄せる。
  test.each([
    ['r90', 'north'],
    ['r180', 'east'],
    ['r270', 'south'],
    ['mirror', 'east'],
  ] as const)('keeps the part number off the dashed link when turned %s', (turn, anchor) => {
    const { tex } = compileCircuit(circuit('parts:', `  K1: relay 5,4 ${turn} G5V-2`));

    expect(tex).not.toMatch(/at \(part-K1\.center\) \{\$\\mathrm\{G5V/);
    expect(tex).toContain(`\\node[font=\\scriptsize, anchor=${anchor}] at (part-K1.value) {$\\mathrm{G5V\\mbox{-}2}$};`);
  });

  test('puts the name on another side than the part number', () => {
    const { tex } = compileCircuit(circuit('parts:', '  K1: relay 5,4 r180 G5V-2'));

    expect(tex).not.toMatch(/at \(part-K1\.east\) \{\$K_\{1\}\$\}/);
  });

  test('declares the value anchor beyond the end of the dashed link', () => {
    const tex = compileCircuit(circuit('parts:', '  K1: relay 5,4 r90 G5V-2')).tex ?? '';
    const value = Number(/\\anchor\{value\}\{\\pgfpoint\{([-\d.]+)cm\}/.exec(tex)?.[1]);
    const dash = tex.slice(tex.indexOf('pgfsetdash{{'));
    const dashEnd = Number(/pgfpathlineto\{\\pgfpoint\{([-\d.]+)cm\}/.exec(dash)?.[1]);

    expect(value).toBeGreaterThan(dashEnd);
  });
});

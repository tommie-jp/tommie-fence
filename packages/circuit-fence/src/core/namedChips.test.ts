import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { gridMap } from './edit/map.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType, lookupPin } from './parts.ts';

/**
 * 足に名前のある DIP 型 (リレー・フォトカプラ・7 セグ。52 の docs/66 の段 4・5)。
 * **足の名前と番号は板の 2 つと同じ表** (fence-kit)。回路図では、リレーと
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
      '  K1: relay d5',
      '  R1: resistor a9 a11 1k',
      'wires:',
      '  - K1.NO1 |- a9',
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
      '  U1: photocoupler d5 PC817',
      '  DS1: seg7 d12',
    ));

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('pgfdeclareshape{opto4}');
    expect(result.tex).toContain('{$\\mathrm{PC817}$}');
  });
});

describe('升目と ERC', () => {
  test('lays the relay legs out on the map in the order the symbol draws them', () => {
    const map = gridMap(circuit('parts:', '  K1: relay d5'));
    const pins = map.chips[0]?.pins ?? [];

    // 上はコイルの A1、接点 1 の NC・NO、接点 2 の NC・NO。下は A2 と共通 2 つ。
    expect(pins.filter((pin) => pin.side === 'top').map((pin) => pin.name)).toEqual(['A1', 'NC1', 'NO1', 'NC2', 'NO2']);
    expect(pins.filter((pin) => pin.side === 'bottom').map((pin) => pin.name)).toEqual(['A2', 'COM1', 'COM2']);
  });

  test('still asks for every photocoupler leg, since all four are needed', () => {
    const result = compileCircuit(circuit(
      'parts:', '  U1: photocoupler d5', '  R1: resistor a1 a3 1k', 'wires:', '  - a3 -| U1.A',
    ), { erc: true });

    // 足は名前で言う (番号の鍵が先に並んでも `1` とは言わない)。
    expect(result.erc.map((one) => one.message).join('\n')).toContain('U1 の足 K、C、E をどの配線も指していません');
  });
});

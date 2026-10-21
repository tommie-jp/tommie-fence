import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { PART_PREFIXES, lookupPin, lookupPartType } from './parts.ts';
import { connectorShapeTex } from './tex/shapes.ts';

/**
 * USB コネクタ (52 の docs/58)。**実体配線図の 2 つと同じ綴り・同じピンの名前**で
 * 書ける (表は fence-kit)。回路図ではオス・メスを描き分けない — ピンの意味は同じで、
 * 回路図の慣習でも記号は 1 つ。
 */

const circuit = (...rows: string[]): string => [...rows, ''].join('\n');

describe('種類', () => {
  test('knows both kinds as boxes with every pin of the table', () => {
    expect(lookupPartType('usb-a')?.pinLabels).toEqual(['VBUS', 'GND', 'D+', 'D-']);
    expect(lookupPartType('usb-c')?.pinLabels).toEqual(['VBUS', 'GND', 'D+', 'D-', 'CC1', 'CC2']);
    expect(PART_PREFIXES['usb-c']).toBe('J');
  });

  test('takes a pin by its printed name, in either case, or by its number', () => {
    const c = lookupPartType('usb-c')!;
    const a = lookupPartType('usb-a')!;
    expect(lookupPin(c, 'VBUS')).toBe('pin 1');
    expect(lookupPin(c, 'vbus')).toBe('pin 1');
    expect(lookupPin(c, 'D+')).toBe('pin 3');
    expect(lookupPin(c, 'd-')).toBe('pin 4');
    expect(lookupPin(c, 'CC2')).toBe('pin 6');
    expect(lookupPin(a, '2')).toBe('pin 2');
    expect(lookupPin(a, 'CC1')).toBeNull();
  });
});

describe('図', () => {
  // ネットリストの箱のピンは図に刷ってある名前で出る (52 の docs/66。以前は `J1.pin 1`)。
  test('wires to a named pin and lists it by that name', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  J1: usb-c 2,2',
      '  R1: resistor 6,4 6,6 5.1k',
      'wires:',
      '  - J1.VBUS -- 6,4',
      '  - J1.GND -- 6,6',
    ));

    expect(result.errors).toEqual([]);
    const netOf = (ref: string) => result.netlist.find((net) => net.refs.includes(ref));
    expect(netOf('J1.VBUS')?.refs).toContain('R1.1');
    expect(netOf('J1.GND')?.refs).toContain('R1.2');
  });

  test('declares the symbol only when it is used', () => {
    const used = compileCircuit(circuit('parts:', '  J1: usb-a 2,2')).tex ?? '';
    const unused = compileCircuit(circuit('parts:', '  R1: resistor 2,2 4,2')).tex ?? '';

    expect(used).toContain(connectorShapeTex('usb-a')[1]);
    expect(unused).not.toContain('pgfdeclareshape');
  });

  test('keeps the two kinds apart in the drawing', () => {
    expect(connectorShapeTex('usb-a').join('\n')).not.toBe(connectorShapeTex('usb-c').join('\n'));
  });

  test('does not nag about pins a power-only circuit leaves alone', () => {
    const { erc } = compileCircuit(circuit(
      'parts:',
      '  J1: usb-a 2,2',
      '  R1: resistor 6,4 6,6 1k',
      'wires:',
      '  - J1.VBUS -- 6,4',
      '  - J1.GND -- 6,6',
    ), { erc: true });

    expect(erc.map((one) => one.message).join('\n')).not.toContain('J1');
  });
});

describe('ターミナルブロック (52 の docs/140)', () => {
  test('is a box with a numbered pin per pole', () => {
    expect(lookupPartType('terminal3')?.pinLabels).toEqual(['1', '2', '3']);
    expect(lookupPin(lookupPartType('terminal2')!, '2')).toBe('pin 2');
    expect(PART_PREFIXES.terminal2).toBe('J');
  });

  test('draws a screw head per pole instead of a mouth, under a name without digits', () => {
    const tex = connectorShapeTex('terminal2').join('\n');
    expect(tex).toContain('\\pgfdeclareshape{terminaltwocon}');
    expect(tex.match(/\\pgfpathcircle/g)).toHaveLength(2);
    expect(connectorShapeTex('terminal3').join('\n').match(/\\pgfpathcircle/g)).toHaveLength(3);
  });

  test('wires to its poles by number', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  J1: terminal2 2,2',
      '  R1: resistor 6,4 6,6 1k',
      'wires:',
      '  - J1.1 -- 6,4',
      '  - J1.2 -- 6,6',
    ));

    expect(result.errors).toEqual([]);
    expect(result.netlist.find((net) => net.refs.includes('J1.1'))?.refs).toContain('R1.1');
  });
});

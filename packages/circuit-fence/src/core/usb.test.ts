import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { PART_PREFIXES, lookupPin, lookupPartType } from './parts.ts';
import { usbShapeTex } from './tex/shapes.ts';

/**
 * USB コネクタ (52 の docs/58)。**実体配線図の 2 つと同じ綴り・同じ足の名前**で
 * 書ける (表は fence-kit)。回路図ではオス・メスを描き分けない — 足の意味は同じで、
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
  // ネットリストの足はアンカー名で出る (`J1.pin 1`)。多端子部品はどれもそう (pico も)。
  test('wires to a named pin, landing on the anchor the name stands for', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  J1: usb-c b2',
      '  R1: resistor d6 f6 5.1k',
      'wires:',
      '  - J1.VBUS -- d6',
      '  - J1.GND -- f6',
    ));

    expect(result.errors).toEqual([]);
    const netOf = (ref: string) => result.netlist.find((net) => net.refs.includes(ref));
    expect(netOf('J1.pin 1')?.refs).toContain('R1.1');
    expect(netOf('J1.pin 2')?.refs).toContain('R1.2');
  });

  test('declares the symbol only when it is used', () => {
    const used = compileCircuit(circuit('parts:', '  J1: usb-a b2')).tex ?? '';
    const unused = compileCircuit(circuit('parts:', '  R1: resistor b2 b4')).tex ?? '';

    expect(used).toContain(usbShapeTex('usb-a')[1]);
    expect(unused).not.toContain('pgfdeclareshape');
  });

  test('keeps the two kinds apart in the drawing', () => {
    expect(usbShapeTex('usb-a').join('\n')).not.toBe(usbShapeTex('usb-c').join('\n'));
  });

  test('does not nag about pins a power-only circuit leaves alone', () => {
    const { erc } = compileCircuit(circuit(
      'parts:',
      '  J1: usb-a b2',
      '  R1: resistor d6 f6 1k',
      'wires:',
      '  - J1.VBUS -- d6',
      '  - J1.GND -- f6',
    ), { erc: true });

    expect(erc.map((one) => one.message).join('\n')).not.toContain('J1');
  });
});

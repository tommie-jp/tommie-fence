import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { deviceChip, lookupPin } from './parts.ts';
import { parseAddress } from './model/address.ts';
import { parseFence } from './parser/parseFence.ts';
import { deviceBox, deviceShapeTex } from './tex/shapes.ts';

/**
 * 板の外の機器・モジュール (`device`。52 の docs/66 の段 1)。**実体配線図の 2 つと
 * 同じマップ形式**で書き、足の名前は書き手が並べる。記号は「箱の片側に足」で、
 * 箱の中に名前を刷る。
 */

const circuit = (...rows: string[]): string => [...rows, ''].join('\n');

const SENSOR = [
  'parts:',
  '  M1:',
  '    type: device',
  '    at: d5',
  '    label: HC-SR04',
  '    pins: [VCC, TRIG, ECHO, GND]',
];

describe('種類', () => {
  test('takes a pin by its written name, in either case, or by its number', () => {
    const type = deviceChip(['VCC', 'TRIG', 'ECHO', 'GND']);

    expect(lookupPin(type, 'TRIG')).toBe('pin 2');
    expect(lookupPin(type, 'trig')).toBe('pin 2');
    expect(lookupPin(type, '4')).toBe('pin 4');
    expect(lookupPin(type, 'OUT')).toBeNull();
    expect(type.pinLabels).toEqual(['VCC', 'TRIG', 'ECHO', 'GND']);
  });
});

describe('読む', () => {
  test('reads the map form into a box with the pins in the written order', () => {
    const { doc, errors } = parseFence(circuit(...SENSOR));

    expect(errors).toEqual([]);
    expect(doc.parts).toMatchObject([{
      kind: 'multi-terminal', id: 'M1', type: 'device', value: 'HC-SR04',
      pinNames: ['VCC', 'TRIG', 'ECHO', 'GND'], line: 2,
    }]);
  });

  test('takes the place from a named point and the turn from the same words as one line', () => {
    const { doc, errors } = parseFence(circuit(
      'points:',
      '  here: c3',
      'parts:',
      '  M1:',
      '    type: device',
      '    at: here',
      '    pins: [A, B]',
      '    turn: r90 mirror',
    ));

    expect(errors).toEqual([]);
    expect(doc.parts[0]).toMatchObject({ at: parseAddress('c3'), turn: { rotate: 90, mirror: true }, spelling: ['here'] });
  });

  test('asks for the map form when a device is written on one line', () => {
    const { errors } = parseFence(circuit('parts:', '  M1: device d5'));

    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('type: device');
  });

  test('keeps the map form for devices only', () => {
    const { errors } = parseFence(circuit('parts:', '  R1:', '    type: resistor', '    at: a1'));

    // 指すのは部品の ID の行 (1 行に書き直す所)。
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('device');
  });

  test.each([
    ['no place', ['    pins: [A, B]'], 'at'],
    ['no pins', ['    at: a1'], 'pins'],
    ['one pin', ['    at: a1', '    pins: [A]'], '2'],
    ['a pin name with a space', ['    at: a1', '    pins: [A B, C]'], 'A B'],
    ['a pin name with a dot', ['    at: a1', '    pins: [A.1, C]'], 'A.1'],
    ['the same pin twice', ['    at: a1', '    pins: [GND, gnd]'], 'gnd'],
    ['an unknown key', ['    at: a1', '    pins: [A, B]', '    colour: red'], 'colour'],
    ['a turn it cannot read', ['    at: a1', '    pins: [A, B]', '    turn: r45'], 'r45'],
  ])('reports %s on its line', (_name, rows, word) => {
    const { doc, errors } = parseFence(circuit('parts:', '  M1:', '    type: device', ...rows));

    expect(doc.parts).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(word);
    expect(errors[0]?.line).toBeGreaterThanOrEqual(2);
  });

  test('stops at the pin limit', () => {
    const pins = Array.from({ length: 41 }, (_, index) => `P${index + 1}`).join(', ');
    const { errors } = parseFence(circuit('parts:', '  M1:', '    type: device', '    at: a1', `    pins: [${pins}]`));

    expect(errors[0]?.message).toContain('40');
  });
});

describe('図', () => {
  test('wires to a pin by its name and lists it by that name', () => {
    const result = compileCircuit(circuit(
      ...SENSOR,
      '  R1: resistor a8 a10 1k',
      'wires:',
      '  - M1.TRIG -| a8',
    ));

    expect(result.errors).toEqual([]);
    const net = result.netlist.find((one) => one.refs.includes('R1.1'));
    expect(net?.refs).toContain('M1.TRIG');
  });

  test('says which names the box has when a wire asks for another', () => {
    const result = compileCircuit(circuit(...SENSOR, 'wires:', '  - M1.OUT -- a8'));

    expect(result.errors[0]?.message).toContain('OUT');
    expect(result.errors[0]?.message).toContain('TRIG');
  });

  test('declares each box size once and writes the label inside', () => {
    const tex = compileCircuit(circuit(
      ...SENSOR,
      '  M2:',
      '    type: device',
      '    at: d12',
      '    label: HC-SR04',
      '    pins: [VCC, TRIG, ECHO, GND]',
    )).tex ?? '';
    const declaration = deviceShapeTex(deviceBox(['VCC', 'TRIG', 'ECHO', 'GND'], 'HC-SR04'))[1] ?? '';

    expect(tex.split(declaration).length - 1).toBe(1);
    // 型番の `-` は引き算ではなくハイフンとして組む。
    expect(tex).toContain('{$\\mathrm{HC\\mbox{-}SR04}$}');
  });

  test('widens the box for longer names and keeps the words of a label apart', () => {
    const short = deviceBox(['A', 'B'], 'S');
    const long = deviceBox(['ADC_VREF', 'B'], 'Analog Discovery');

    expect(long.halfWidth).toBeGreaterThan(short.halfWidth);
    expect(long.nameArea).toBeGreaterThan(short.nameArea);
    expect(compileCircuit(circuit('parts:', '  M1:', '    type: device', '    at: d5', '    label: Analog Discovery', '    pins: [A, B]')).tex)
      .toContain('Analog\\ Discovery');
  });

  test('does not nag about pins the circuit leaves alone', () => {
    const { erc } = compileCircuit(circuit(
      ...SENSOR,
      '  R1: resistor a8 a10 1k',
      'wires:',
      '  - M1.TRIG -| a8',
    ), { erc: true });

    expect(erc.map((one) => one.message).join('\n')).not.toContain('M1');
  });
});

describe('ネットリストの足の名前', () => {
  // 箱の足は**図に刷ってある名前**で出す。アンカー名 (`pin 1`) は TeX の都合で、
  // 図にも実物にも無い名前だった (52 の docs/58 で持ち越した件)。
  test('lists a board pin by its printed name', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  U1: pico b2',
      '  R1: resistor a30 a32 330',
      'wires:',
      '  - U1.GP0 -| a30',
    ));

    expect(result.netlist.find((one) => one.refs.includes('R1.1'))?.refs).toContain('U1.GP0');
  });

  test('lists a header pin by its number', () => {
    const result = compileCircuit(circuit(
      'parts:',
      '  J1: sip3 b2',
      '  R1: resistor a8 a10 1k',
      'wires:',
      '  - J1.2 -| a8',
    ));

    expect(result.netlist.find((one) => one.refs.includes('R1.1'))?.refs).toContain('J1.2');
  });
});

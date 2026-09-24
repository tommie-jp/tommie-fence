import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { gridMap } from './edit/map.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType, lookupPin, partTypeOf } from './parts.ts';
import { parseFence } from './parser/parseFence.ts';
import { spellPartBlock } from './write/spellPart.ts';

/**
 * 3 本足の IC (`ic3`。52 の docs/66 の段 7)。ホール素子・LM35・LMF501T・UM66T を
 * 1 つで受ける。**箱は三端子レギュレータと同じ** (1 = 左、2 = 下、3 = 右) で、
 * 足の名前は書き手が `pins:` で与える (品ごとに違うため)。書かなければ番号。
 */

const circuit = (...rows: string[]): string => [...rows, ''].join('\n');

const LM35 = [
  'parts:',
  '  U1:',
  '    type: ic3',
  '    at: c4',
  '    label: LM35',
  '    pins: [+Vs, Vout, GND]',
];

describe('種類', () => {
  test('is a three-pin box numbered like the regulator, when written on one line', () => {
    const type = lookupPartType('ic3')!;

    expect(lookupPin(type, '1')).toBe('pin 1');
    expect(lookupPin(type, '3')).toBe('pin 3');
    expect(lookupPin(type, 'out')).toBeNull();
    expect(PART_NAMES.ic3).toBe('3 本足の IC');
    expect(PART_PREFIXES.ic3).toBe('U');
  });

  test('takes the leg names from pins: in the map form', () => {
    const [part] = parseFence(circuit(...LM35)).doc.parts;
    const type = partTypeOf(part!)!;

    expect(part?.type).toBe('ic3');
    expect(lookupPin(type, 'Vout')).toBe('pin 2');
    expect(lookupPin(type, 'vout')).toBe('pin 2');
    expect(lookupPin(type, '+Vs')).toBe('pin 1');
    expect(lookupPin(type, '3')).toBe('pin 3');
    expect(type.pinLabels).toEqual(['+Vs', 'Vout', 'GND']);
  });

  test('refuses names too long for the box', () => {
    // 箱はレギュレータと同じ大きさ。5 文字から真ん中の縦の名前に触れる (図で確かめた)。
    const result = parseFence(circuit('parts:', '  U1:', '    type: ic3', '    at: c4', '    pins: [VDDA1, Vout, GND]'));

    expect(result.errors.map((one) => one.message).join('\n')).toContain('4 文字まで');
  });

  test('asks for exactly three names', () => {
    const result = parseFence(circuit('parts:', '  U1:', '    type: ic3', '    at: c4', '    pins: [A, B]'));

    expect(result.errors.map((one) => one.message).join('\n')).toContain('3 本');
  });
});

describe('図', () => {
  test('draws the regulator box and lists the legs by the written names', () => {
    const result = compileCircuit(circuit(...LM35, '  R1: resistor c6 e6 1k', 'wires:', '  - U1.Vout |- c6'));

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('pgfdeclareshape{reg3}');
    expect(result.netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('U1.Vout');
  });

  test('draws a one-line ic3 with numbered legs', () => {
    const result = compileCircuit(circuit('parts:', '  U2: ic3 c4 UM66T', '  R1: resistor c6 e6 1k', 'wires:', '  - U2.3 -- c6'));

    expect(result.errors).toEqual([]);
    expect(result.netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('U2.3');
  });

  test('names the leg by its written name when a wire comes in slanted', () => {
    // 足の名前は図に刷ってある字で言う (アンカー名 `pin 2` では図と突き合わせられない)。
    const result = compileCircuit(circuit(...LM35, '  OUT: port c7', 'wires:', '  - U1.Vout -- c7'));

    expect(result.notices.map((one) => one.message).join('\n')).toContain('U1.Vout へ -- で引くと斜めに入ります');
  });

  test('names a transistor leg in the hint the same way the netlist does', () => {
    // 箱でない記号の足はアンカー名のまま (ネットリストの `Q1.base` と同じ字)。
    const result = compileCircuit(circuit('parts:', '  Q1: npn c4', '  R1: resistor a1 a2 1k', 'wires:', '  - a2 -- Q1.B'));

    expect(result.notices.map((one) => one.message).join('\n')).toContain('Q1.base へ -- で引くと斜めに入ります');
  });

  test('shows the written names on the map', () => {
    const map = gridMap(circuit(...LM35));

    expect(map.chips[0]?.pins.map((pin) => pin.name)).toEqual(['+Vs', 'Vout', 'GND']);
  });
});

describe('書き戻す', () => {
  test('writes the map form back with its own type', () => {
    const [part] = parseFence(circuit(...LM35)).doc.parts;

    expect(spellPartBlock(part!)).toEqual([
      'U1:', '  type: ic3', '  at: c4', '  label: LM35', '  pins: [+Vs, Vout, GND]',
    ]);
  });
});

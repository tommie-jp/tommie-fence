import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { createBoard } from './model/board.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';

/**
 * DIP の足の名前 (52 の docs/95 の段 3)。**型番が fence-kit の足の名前の表にあれば**、
 * 胴に番号と名前を 2 段で刷り、配線は名前でも番号でも指せ、ネットリストは名前で出る
 * (回路図と同じ)。表に無い型番は今までどおり番号だけ。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

const pinsOf = (line: string) =>
  placeParts(parseFence(fence('parts:', `  ${line}`)).doc.parts, createBoard('half')).parts[0]?.pins ?? [];

const texts = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(([, text]) => text ?? '');

describe('置き方', () => {
  test('names the pins of a model in the table and keeps their numbers', () => {
    const pins = pinsOf('U1: dip8 @ e10 NE555');

    expect(pins.map((pin) => pin.name)).toEqual(['GND', 'TRIG', 'OUT', 'RESET', 'CONT', 'THRES', 'DISCH', 'VCC']);
    expect(pins.map((pin) => pin.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  test('calls a pin with a shared printed name (NC) by its number', () => {
    expect(pinsOf('U1: dip8 @ e10 TL071').map((pin) => pin.name)).toEqual(['1', 'IN-', 'IN+', 'VCC-', '5', 'OUT', 'VCC+', '8']);
  });

  test('leaves the numbers alone for an unknown model or none', () => {
    for (const line of ['U1: dip8 @ e10 LM741', 'U1: dip8 @ e10', 'U1: dip14 @ e10 NE555']) {
      expect(pinsOf(line).map((pin) => pin.name).slice(0, 2)).toEqual(['1', '2']);
    }
  });

  test('keeps the names with their pins when the chip is turned', () => {
    const upright = pinsOf('U1: dip8 @ e10 NE555');
    const turned = pinsOf('U1: dip8 @ e10 r180 NE555');
    const holeOf = (pins: typeof upright, name: string) => pins.find((pin) => pin.name === name)?.address;

    expect(holeOf(turned, 'GND')).not.toEqual(holeOf(upright, 'GND'));
    expect(turned.find((pin) => pin.name === 'GND')?.number).toBe('1');
  });
});

describe('配線とネットリスト', () => {
  const timer = (wire: string) => renderBreadboard(fence(
    'parts:',
    '  U1: dip8 @ e10 NE555',
    '  R1: resistor a5 a8 10k',
    'wires:',
    `  - ${wire}`,
  ));

  test('wires to a pin by its name or its number and lists it by its name', () => {
    for (const wire of ['U1.TRIG -- b5', 'U1.2 -- b5']) {
      const { errors, netlist } = timer(wire);
      expect(errors, wire).toEqual([]);
      expect(netlist.find((net) => net.refs.includes('R1.1'))?.refs, wire).toContain('U1.TRIG');
    }
  });

  test('says which pins it has when the name is wrong', () => {
    const { errors } = timer('U1.TRG -- b5');
    expect(errors.map((one) => one.message).join('\n')).toContain('TRIG');
  });

  test('takes a relay pin by its DIP number too, as the schematic does', () => {
    const { errors, netlist } = renderBreadboard(fence(
      'parts:',
      '  K1: relay @ e5',
      '  R1: resistor a8 a14 1k',
      'wires:',
      '  - K1.4 -- b8',
    ));
    expect(errors).toEqual([]);
    expect(netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('K1.COM1');
  });
});

describe('絵', () => {
  test('prints the numbers and the names on the body', () => {
    const shown = texts(renderBreadboard(fence('parts:', '  U1: dip8 @ e10 NE555')).svg);

    expect(shown).toEqual(expect.arrayContaining(['1', '8', 'GND', 'TRIG', 'VCC', 'NE555']));
  });

  test('prints only the numbers for a model not in the table, and says so', () => {
    const result = renderBreadboard(fence('parts:', '  U1: dip8 @ e10 LM741'));
    const shown = texts(result.svg);
    const said = result.notices.map((one) => one.message).join('\n');

    expect(said).toContain('LM741');
    expect(said).toContain('NE555');
    expect(renderBreadboard(fence('parts:', '  U1: dip8 @ e10')).notices).toEqual([]);

    expect(shown).toEqual(expect.arrayContaining(['1', '8']));
    expect(shown).not.toContain('GND');
  });

  test('prints the numbers on a relay as well as its names', () => {
    const shown = texts(renderBreadboard(fence('parts:', '  K1: relay @ e5')).svg);

    expect(shown).toEqual(expect.arrayContaining(['COM1', '4', '16']));
  });
});

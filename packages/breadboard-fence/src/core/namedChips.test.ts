import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { createBoard } from './model/board.ts';
import { formatAddress } from './model/address.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { variantsOf } from './parts/variants.ts';
import { knownPartTypes, lookupFootprint, placeableTypes } from './placement/footprints.ts';

/**
 * 足に名前のある DIP 型の部品 (リレー・フォトカプラ・7 セグ。52 の docs/66 の段 3)。
 * **表は fence-kit** — DIP の足の位置のうち、足のある所に名前が付いた物で、
 * 違うのは列の間の穴数と足のある位置だけ。置き方は DIP と同じ (1 番ピンの穴 1 つ)。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

const placed = (line: string) => {
  const result = placeParts(parseFence(fence('parts:', `  ${line}`)).doc.parts, createBoard('half'));
  return { errors: result.errors.map((one) => one.message), pins: result.parts[0]?.pins ?? [] };
};

const holeOf = (pins: readonly { name: string; address: Parameters<typeof formatAddress>[0] | null }[], name: string): string => {
  const address = pins.find((pin) => pin.name === name)?.address;
  return address === undefined || address === null ? '' : formatAddress(address);
};

describe('種類と姿', () => {
  test('knows the three kinds, placed from one hole like a DIP', () => {
    for (const type of ['relay', 'photocoupler', 'seg7']) {
      expect(lookupFootprint(type)?.kind, type).toBe('named');
      expect(placeableTypes(), type).toContain(type);
      expect(knownPartTypes(), type).toContain(type);
      expect(holesOf(type), type).toBe(1);
    }
    expect(variantsOf('relay')).toEqual(['g5v-2']);
    expect(partName('relay')).toBe('リレー');
    expect(partPrefix('relay')).toBe('K');
    expect(partPrefix('seg7')).toBe('DS');
  });
});

describe('置き方', () => {
  test('puts the G5V-2 across the gap on eight of the sixteen places, named after the table', () => {
    const { errors, pins } = placed('K1: relay @ e5');

    expect(errors).toEqual([]);
    expect(pins.map((pin) => pin.name)).toEqual(['A1', 'COM1', 'NC1', 'NO1', 'NO2', 'NC2', 'COM2', 'A2']);
    expect(holeOf(pins, 'A1')).toBe('e5');
    expect(holeOf(pins, 'NO1')).toBe('e12');
    expect(holeOf(pins, 'NO2')).toBe('f12');
    expect(holeOf(pins, 'A2')).toBe('f5');
  });

  test('lets a wire say K1.COM1 and lists the pins by name', () => {
    const { errors, netlist } = renderBreadboard(fence(
      'parts:',
      '  K1: relay @ e5',
      '  R1: resistor a8 a14 1k',
      'wires:',
      '  - K1.COM1 -- b8',
    ));

    expect(errors).toEqual([]);
    expect(netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('K1.COM1');
  });

  test('puts the seven-segment display on rows six holes apart', () => {
    const { errors, pins } = placed('DS1: seg7 @ b5');

    expect(errors).toEqual([]);
    expect(holeOf(pins, 'e')).toBe('b5');
    expect(holeOf(pins, 'dp')).toBe('b9');
    expect(holeOf(pins, 'b')).toBe('f9');
    expect(holeOf(pins, 'g')).toBe('f5');
  });

  test('says which rows fit when the gap cannot be spanned from there', () => {
    expect(placed('K1: relay @ d5').errors.join('\n')).toContain('e 行か f 行');
    expect(placed('DS1: seg7 @ a5').errors.join('\n')).toContain('b・c・d・e 行か f・g・h・i 行');
    // e 行からは 6 ピッチ先の i 行に届く。
    expect(placed('DS1: seg7 @ e5').errors).toEqual([]);
  });

  test('turns half way round like a DIP, pin 1 going to the far corner', () => {
    const { errors, pins } = placed('K1: relay @ e5 r180');

    expect(errors).toEqual([]);
    expect(holeOf(pins, 'NO2')).toBe('e5');
    expect(holeOf(pins, 'A1')).toBe('f12');
    expect(holeOf(pins, 'A2')).toBe('e12');
  });

  test('shows the part name in the drawing when nothing else is written', () => {
    const { svg } = renderBreadboard(fence('parts:', '  U1: photocoupler @ e5'));

    expect(svg).toContain('PC817');
  });
});

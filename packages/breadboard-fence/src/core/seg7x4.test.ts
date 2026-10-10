import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { createBoard } from './model/board.ts';
import { formatAddress } from './model/address.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { knownPartTypes, lookupFootprint, placeableTypes } from './placement/footprints.ts';

/**
 * 4 桁の 7 セグ (`seg7x4`、OptoSupply OSL40562-LR)。**表は fence-kit の名前つきの DIP 型** —
 * 1 列 6 本、列の間 6 ピッチ (1 桁の `seg7` と同じ置き方)。胴は外形どおり横長で、面を 4 つ描く。
 */

const fence = (...lines: string[]): string => ['board: full', ...lines, ''].join('\n');

const placed = (line: string) => {
  const result = placeParts(parseFence(fence('parts:', `  ${line}`)).doc.parts, createBoard('full'));
  const pins = result.parts[0]?.pins ?? [];
  const hole = (name: string): string => {
    const address = pins.find((pin) => pin.name === name)?.address;
    return address === undefined || address === null ? '' : formatAddress(address);
  };
  return { errors: result.errors.map((one) => one.message), pins, hole };
};

describe('種類', () => {
  test('knows the four-digit display, placed from one hole like the one-digit one', () => {
    expect(lookupFootprint('seg7x4')?.kind).toBe('named');
    expect(placeableTypes()).toContain('seg7x4');
    expect(knownPartTypes()).toContain('seg7x4');
    expect(holesOf('seg7x4')).toBe(1);
    expect(partName('seg7x4')).toBe('4 桁 7 セグメント LED');
    expect(partPrefix('seg7x4')).toBe('DS');
  });
});

describe('置き方', () => {
  test('puts pins 1〜6 on the lower row from the left and 7〜12 back along the upper row, six holes apart', () => {
    const { errors, pins, hole } = placed('DS1: seg7x4 @ b20');

    expect(errors).toEqual([]);
    expect(pins).toHaveLength(12);
    expect([hole('e'), hole('DIG4'), hole('b'), hole('DIG1')]).toEqual(['f20', 'f25', 'b25', 'b20']);
    // DIP の番号でも指せる (`DS1.12` = DIG1)。
    expect(pins.find((pin) => pin.name === 'DIG1')?.number).toBe('12');
    expect(placed('DS1: seg7x4 @ a20').errors.join('\n')).toContain('b・c・d・e 行か f・g・h・i 行');
  });
});

describe('ネットリストと絵', () => {
  test('names the nets by the pin names and draws four faces inside one long body', () => {
    const { errors, netlist, svg } = renderBreadboard(fence(
      'parts:',
      '  DS1: seg7x4 @ b20',
      '  R1: resistor a20 a10 1k',
    ));

    expect(errors).toEqual([]);
    expect(netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('DS1.DIG1');
    // 面は 1 桁ずつ `<g transform="translate(…) rotate(…)">` に消えたセグメントの灰色の棒。
    expect(svg.match(/rotate\([\d.-]+\)"><rect[^>]*fill="#9aa0a8"/g)).toHaveLength(4);
    expect(svg).toContain('>DIG1<');
  });
});

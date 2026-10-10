import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { footprintOf, pinsOf } from './parts/footprint.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { isKnownType, placeableNames, splitPartType } from './parts/types.ts';

/**
 * 4 桁の 7 セグ (`seg7x4`、OptoSupply OSL40562-LR)。**表は fence-kit で breadboard と同じ** —
 * 1 列 6 本、列の間 6 穴 (1 桁の `seg7` と同じ置き方)。胴は外形どおり横長 (50.30 mm) で、
 * 描くのも重なりの判定も同じ胴 (`namedChipBox`)。
 */

const fence = (...lines: string[]): string => ['board: 40x10', ...lines, ''].join('\n');
const at = (row: number, col: number) => ({ row, col });

describe('種類', () => {
  test('knows the four-digit display, placed from one hole like a DIP', () => {
    expect(isKnownType('seg7x4')).toBe(true);
    expect(placeableNames()).toContain('seg7x4');
    expect(holesOf('seg7x4')).toBe(1);
    expect(partName('seg7x4')).toBe('4 桁 7 セグメント LED');
    expect(partPrefix('seg7x4')).toBe('DS');
    expect(splitPartType('seg7x4/osl40562').problem).toBeNull();
    expect(footprintOf('seg7x4')).toMatchObject({ kind: 'named', pins: 12, holes: 1 });
  });

  test('puts pins 1〜6 on the lower row and 7〜12 back along the upper row, six holes apart', () => {
    expect(pinsOf(footprintOf('seg7x4')!, [at(1, 20)])).toEqual([
      at(7, 20), at(7, 21), at(7, 22), at(7, 23), at(7, 24), at(7, 25),
      at(1, 25), at(1, 24), at(1, 23), at(1, 22), at(1, 21), at(1, 20),
    ]);
  });
});

describe('図とネットリスト', () => {
  test('names the nets by the pin names and draws four faces', () => {
    const { errors, netlist, svg } = renderPerfboard(fence(
      'parts:',
      '  DS1: seg7x4 b20',
      '  R1: resistor j20 j23 1k',
      'wires:',
      '  - j20 -- h20',
    ));

    expect(errors).toEqual([]);
    // h20 は 1 番 (e)。
    expect(netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('DS1.e');
    expect(svg.match(/rotate\([\d.-]+\)"><rect[^>]*fill="#9aa0a8"/g)).toHaveLength(4);
    expect(svg).toContain('>DIG1<');
  });

  test('says a part under the long body overlaps it, though its holes are off the pins', () => {
    // ピンの列 (20〜25) の左 5 列目。胴は左右へ約 7 列はみ出すので、その下にある。
    const { errors, notices } = renderPerfboard(fence(
      'parts:',
      '  DS1: seg7x4 b20',
      '  R1: resistor d14 d16 1k',
    ));
    const messages = [...errors, ...notices].map((one) => one.message).join('\n');

    expect(messages).toContain('DS1 と R1 の胴が重なっています');
  });
});

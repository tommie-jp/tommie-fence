import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { createBoard } from './model/board.ts';
import { formatAddress } from './model/address.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { knownPartTypes, lookupFootprint, placeableTypes } from './placement/footprints.ts';

/**
 * DIP スイッチ (`dip-switch4` / `dip-switch8`)。**表は fence-kit の名前つきの DIP 型** —
 * 溝をまたぐ DIP の姿で、k 番のスイッチは向かい合うピン `Ak` と `Bk` の間の接点。
 * **ピンどうしは図の上ではつながない** (開いた接点。タクトスイッチの bridges にあたる物は無い)。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

const placed = (line: string) => {
  const result = placeParts(parseFence(fence('parts:', `  ${line}`)).doc.parts, createBoard('half'));
  const pins = result.parts[0]?.pins ?? [];
  const hole = (name: string): string => {
    const address = pins.find((pin) => pin.name === name)?.address;
    return address === undefined || address === null ? '' : formatAddress(address);
  };
  return { errors: result.errors.map((one) => one.message), pins, hole };
};

describe('種類', () => {
  test('knows the four-way and the eight-way switch, placed from one hole like a DIP', () => {
    for (const type of ['dip-switch4', 'dip-switch8']) {
      expect(lookupFootprint(type)?.kind, type).toBe('named');
      expect(placeableTypes(), type).toContain(type);
      expect(knownPartTypes(), type).toContain(type);
      expect(holesOf(type), type).toBe(1);
      expect(partName(type), type).toBe('DIP スイッチ');
      expect(partPrefix(type), type).toBe('SW');
    }
  });
});

describe('置き方', () => {
  test('puts switch k between the facing holes of column k, A below the gap and B above', () => {
    const { errors, pins, hole } = placed('SW1: dip-switch4 @ e5');

    expect(errors).toEqual([]);
    expect(pins).toHaveLength(8);
    expect([hole('A1'), hole('B1')]).toEqual(['f5', 'e5']);
    expect([hole('A4'), hole('B4')]).toEqual(['f8', 'e8']);
    // DIP の番号でも指せる (`SW1.8` = B1)。
    expect(pins.find((pin) => pin.name === 'B1')?.number).toBe('8');
  });

  test('takes eight columns for the eight-way switch and refuses the rows off the gap', () => {
    expect(placed('SW1: dip-switch8 @ e5').hole('A8')).toBe('f12');
    expect(placed('SW1: dip-switch8 @ e5').hole('B8')).toBe('e12');
    expect(placed('SW1: dip-switch4 @ c5').errors.join('\n')).toContain('溝をまたぐ');
  });
});

describe('ネットリスト', () => {
  test('keeps the two legs of a switch on separate nets (an open contact)', () => {
    const { errors, netlist } = renderBreadboard(fence(
      'parts:',
      '  SW1: dip-switch4 @ e5',
      '  R1: resistor j5 -b5 10k',
      'wires:',
      '  - a5 -- +t5 red',
    ));

    expect(errors).toEqual([]);
    const netOf = (ref: string) => netlist.find((net) => net.refs.includes(ref));
    expect(netOf('SW1.B1')?.refs).not.toContain('SW1.A1');
    expect(netOf('SW1.A1')?.refs).toContain('R1.1');
    // 隣のスイッチともつながらない。
    expect(netOf('SW1.A2')?.refs).toEqual(['SW1.A2']);
  });

  test('draws one slider per switch', () => {
    const { svg } = renderBreadboard(fence('parts:', '  SW1: dip-switch8 @ e5'));

    expect(svg.match(/class="dip-switch-slot"/g)).toHaveLength(8);
  });
});

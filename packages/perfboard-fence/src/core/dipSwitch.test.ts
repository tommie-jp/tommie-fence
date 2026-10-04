import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { footprintOf, pinsOf } from './parts/footprint.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { isKnownType, placeableNames } from './parts/types.ts';

/**
 * DIP スイッチ (`dip-switch4` / `dip-switch8`)。**表は fence-kit で breadboard と同じ** —
 * DIP の姿で、k 番のスイッチは向かい合うピン `Ak` と `Bk` の間の接点。
 * **ピンどうしは図の上ではつながない** (開いた接点)。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');
const at = (row: number, col: number) => ({ row, col });

describe('種類', () => {
  test('knows the four-way and the eight-way switch, placed from one hole like a DIP', () => {
    for (const type of ['dip-switch4', 'dip-switch8']) {
      expect(isKnownType(type), type).toBe(true);
      expect(placeableNames(), type).toContain(type);
      expect(holesOf(type), type).toBe(1);
      expect(partName(type), type).toBe('DIP スイッチ');
      expect(partPrefix(type), type).toBe('SW');
    }
    expect(footprintOf('dip-switch4')).toMatchObject({ kind: 'named', pins: 8, holes: 1 });
    expect(footprintOf('dip-switch8')).toMatchObject({ kind: 'named', pins: 16, holes: 1 });
  });

  test('puts A1〜A4 on the lower row and B4〜B1 back along the upper row, three holes apart', () => {
    expect(pinsOf(footprintOf('dip-switch4')!, [at(2, 3)])).toEqual([
      at(5, 3), at(5, 4), at(5, 5), at(5, 6), at(2, 6), at(2, 5), at(2, 4), at(2, 3),
    ]);
  });
});

describe('ネットリスト', () => {
  test('keeps the two legs of a switch on separate nets (an open contact)', () => {
    const { errors, netlist, svg } = renderPerfboard(fence(
      'parts:',
      '  SW1: dip-switch4 c3',
      '  R1: resistor h3 h6 10k',
      'wires:',
      '  - f3 -- h3',
    ));

    expect(errors).toEqual([]);
    const netOf = (ref: string) => netlist.find((net) => net.refs.includes(ref));
    expect(netOf('SW1.A1')?.refs).toContain('R1.1');
    expect(netOf('SW1.A1')?.refs).not.toContain('SW1.B1');
    expect(svg.match(/class="dip-switch-slot"/g)).toHaveLength(4);
  });
});

import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { footprintOf, pinsOf } from './parts/footprint.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { isKnownType, placeableNames, splitPartType } from './parts/types.ts';
import { orientOf } from './parts/orient.ts';

/**
 * 足に名前のある DIP 型の部品 (リレー・フォトカプラ・7 セグ。52 の docs/66 の段 3)。
 * **表は fence-kit で breadboard と同じ**。置き方は DIP と同じ (1 番ピンの穴 1 つ) で、
 * 列の間は表の穴数、足があるのは表の位置だけ。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');
const at = (row: number, col: number) => ({ row, col });

describe('種類と姿', () => {
  test('knows the three kinds, placed from one hole like a DIP', () => {
    for (const type of ['relay', 'photocoupler', 'seg7']) {
      expect(isKnownType(type), type).toBe(true);
      expect(placeableNames(), type).toContain(type);
      expect(holesOf(type), type).toBe(1);
      expect(orientOf(type), type).not.toBe('none');
    }
    expect(partName('photocoupler')).toBe('フォトカプラ');
    expect(partPrefix('relay')).toBe('K');
    expect(splitPartType('relay/g5v-2').problem).toBeNull();
    expect(splitPartType('relay/g5v-1').problem).toContain('g5v-2');
  });

  test('puts the pins only where the table has them, the rows as far apart as the table says', () => {
    const relay = footprintOf('relay');
    const display = footprintOf('seg7');

    expect(relay).toMatchObject({ kind: 'named', pins: 8, holes: 1 });
    // A1 COM1 NC1 NO1 / NO2 NC2 COM2 A2 (DIP16 の 1・4・6・8 / 9・11・13・16)。
    // 実物を上から見た並び: 1〜8 の位置が下の列を右へ、9〜16 が上の列を左へ。
    expect(pinsOf(relay!, [at(2, 3)])).toEqual([
      at(5, 3), at(5, 6), at(5, 8), at(5, 10), at(2, 10), at(2, 8), at(2, 6), at(2, 3),
    ]);
    expect(pinsOf(display!, [at(1, 3)]).map((one) => one.row)).toEqual([7, 7, 7, 7, 7, 1, 1, 1, 1, 1]);
  });
});

describe('図とネットリスト', () => {
  test('names the pins after the table in the netlist', () => {
    const { errors, netlist, svg } = renderPerfboard(fence(
      'parts:',
      '  K1: relay c3',
      '  R1: resistor h6 h9 1k',
      'wires:',
      // COM1 は下の列 (実物を上から見た並びで、1〜8 の位置が下の列)。
      '  - h6 -- f6',
    ));

    expect(errors).toEqual([]);
    expect(netlist.find((net) => net.refs.includes('R1.1'))?.refs).toContain('K1.COM1');
    expect(svg).toContain('G5V-2');
  });

  test('draws the face of the display', () => {
    const { errors, svg } = renderPerfboard(fence('parts:', '  DS1: seg7 b3'));

    expect(errors).toEqual([]);
    expect(svg).toMatch(/rotate\(/);
  });
});

describe('板の縁', () => {
  test('refuses a named chip whose legs run off the board, like a DIP', () => {
    // 20 列の板の 16 列目から G5V-2 (8 列) を置くと、右の足が 21〜23 列目に来る
    // (1 番から数えて最初にはみ出すのは、下の列の d21)。
    const relay = renderPerfboard(fence('parts:', '  K1: relay a16'));
    // 7 セグの向こうの列 (6 行先) は 10 行の板からはみ出す。
    const display = renderPerfboard(fence('parts:', '  DS1: seg7 h3'));

    expect(relay.errors.map((one) => one.message).join('\n')).toContain('K1 の足 d21 が板の穴ではありません');
    expect(display.errors.map((one) => one.message).join('\n')).toContain('DS1 の足');
  });
});

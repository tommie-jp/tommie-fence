import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { createBoard } from './model/board.ts';
import { formatAddress } from './model/address.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { lookupFootprint, placeableTypes } from './placement/footprints.ts';
import { applyRewrite } from 'fence-kit';
import { insertPart } from './edit/insert.ts';

/**
 * Tang Nano 9K。**列の間は 22.8 mm = 9 ピッチ**なので、溝をまたぐと a↔h・b↔i・c↔j の
 * 3 組にだけ落ちる (Pico の 7 ピッチは全部の行で落ちる)。
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
  test('is a board placed from one hole, named and prefixed like the pico', () => {
    expect(lookupFootprint('tang-nano-9k')?.kind).toBe('board');
    expect(placeableTypes()).toContain('tang-nano-9k');
    expect(holesOf('tang-nano-9k')).toBe(1);
    expect(partName('tang-nano-9k')).toBe('Tang Nano 9K');
    expect(partPrefix('tang-nano-9k')).toBe('U');
  });
});

describe('置き方', () => {
  test('puts pin 1 on the lower row and pin 48 on the upper row, nine pitches apart', () => {
    const { errors, pins, hole } = placed('U1: tang-nano-9k @ b5');

    expect(errors).toEqual([]);
    expect(pins).toHaveLength(48);
    // 下の列は 1〜24 番を右へ、上の列は 25〜48 番を左へ戻る。
    expect([hole('IO38'), hole('IO69'), hole('3V3'), hole('IO63')]).toEqual(['i5', 'i28', 'b28', 'b5']);
  });

  test('takes the three pairs a↔h, b↔i and c↔j from either side', () => {
    expect(placed('U1: tang-nano-9k @ a5').hole('IO38')).toBe('h5');
    expect(placed('U1: tang-nano-9k @ j5').hole('IO63')).toBe('c5');
    expect(placed('U1: tang-nano-9k @ i5').errors).toEqual([]);
  });

  test('refuses the rows with no partner and names the rows that work', () => {
    const { errors } = placed('U1: tang-nano-9k @ e5');

    expect(errors.join('\n')).toContain('9 ピッチ');
    expect(errors.join('\n')).toContain('b 行と i 行');
  });

  test('refuses a board that runs off the right edge', () => {
    expect(placed('U1: tang-nano-9k @ b50').errors.join('\n')).toContain('はみ出します');
  });

  test('moves a click on d to g to the recommended row of the same side', () => {
    const upper = insertPart(fence('parts:'), { id: 'U1', type: 'tang-nano-9k', at: [{ kind: 'hole', row: 'e', col: 5 }] });
    const lower = insertPart(fence('parts:'), { id: 'U1', type: 'tang-nano-9k', at: [{ kind: 'hole', row: 'f', col: 5 }] });

    expect(upper.ok && applyRewrite(fence('parts:'), upper.value)).toContain('tang-nano-9k b5');
    expect(lower.ok && applyRewrite(fence('parts:'), lower.value)).toContain('tang-nano-9k i5');
  });
});

describe('図', () => {
  test('draws the board with the HDMI connector at the far end and keeps the names of the legs', () => {
    const { errors, svg } = renderBreadboard(fence('parts:', '  U1: tang-nano-9k @ b5'));

    expect(errors).toEqual([]);
    expect(svg).toContain('GW1NR-9');
    expect(svg).toMatch(/>IO38 01<|>01 IO38</);
  });
});

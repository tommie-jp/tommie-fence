import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { variantsOf } from './parts/variants.ts';
import { knownPartTypes, placeableTypes } from './placement/footprints.ts';

/**
 * 3 本足の IC (`ic3`。52 の docs/66 の段 7)。ホール素子・LM35・LMF501T・UM66T の
 * TO-92 を 1 つで受ける。**置き方はトランジスタと同じ 3 つの穴**で、足の名前は
 * 穴に書く (`h9(Vout)`)。書かなければ左から `1` `2` `3`。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

describe('3 本足の IC', () => {
  test('is a three-lead part named like the schematic', () => {
    expect(placeableTypes()).toContain('ic3');
    expect(knownPartTypes()).toContain('ic3');
    expect(holesOf('ic3')).toBe(3);
    expect(partName('ic3')).toBe('3 本足の IC');
    expect(partPrefix('ic3')).toBe('U');
    expect(variantsOf('ic3')).toEqual(['to92', 'to220']);
  });

  test('takes the leg names written on the holes', () => {
    const result = renderBreadboard(fence(
      'parts:', '  U1: ic3 h9(+Vs) h10(Vout) h11(GND) LM35', 'wires:', '  - j10 -- j14 blue',
    ));

    expect(result.errors).toEqual([]);
    expect(result.netlist.find((net) => net.refs.includes('U1.Vout'))).toBeDefined();
  });

  test('numbers the legs when no names are written', () => {
    const result = renderBreadboard(fence('parts:', '  U2: ic3/to92 f3 f4 f5 UM66T'));

    expect(result.errors).toEqual([]);
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['U2.1', 'U2.2', 'U2.3']));
  });
});

describe('足の名前の大きさ', () => {
  /** 足の名前の字の大きさ (`>名前<` の直前の font-size)。 */
  const sizeOf = (svg: string, name: string): number => {
    const found = new RegExp(`font-size="([\\d.]+)"[^>]*>${name.replace('+', '\\+')}<`).exec(svg);
    return Number(found?.[1] ?? NaN);
  };

  test('shrinks long leg names so neighbours do not run into each other', () => {
    const long = renderBreadboard(fence('parts:', '  U1: ic3 f4(+Vs) f5(Vout) f6(GND) LM35')).svg;
    const short = renderBreadboard(fence('parts:', '  Q1: transistor f4(B) f5(C) f6(E)')).svg;

    // 隣の足までは 1 ピッチ。4 文字の名前は収まらないので縮める。1 文字は既定のまま。
    expect(sizeOf(long, 'Vout')).toBeLessThan(sizeOf(short, 'B'));
    expect(sizeOf(long, 'GND')).toBe(sizeOf(long, 'Vout'));
  });

  test('measures the gap between the nearest legs, whatever order they are written in', () => {
    // 書いた順 (9, 12, 10) で差を取ると 3 と 2 になるが、9 と 10 は 1 ピッチしか離れていない。
    const shuffled = renderBreadboard(fence('parts:', '  U1: ic3 h9(Vout) h12(GND) h10(Vs) LM35')).svg;
    const adjacent = renderBreadboard(fence('parts:', '  U1: ic3 h9(Vout) h10(Vs) h11(GND) LM35')).svg;

    expect(sizeOf(shuffled, 'Vout')).toBe(sizeOf(adjacent, 'Vout'));
  });

  test('keeps the size when the legs are spread apart', () => {
    const spread = renderBreadboard(fence('parts:', '  U1: ic3 f3(+Vs) f5(Vout) f7(GND) LM35')).svg;
    const short = renderBreadboard(fence('parts:', '  Q1: transistor f4(B) f5(C) f6(E)')).svg;

    expect(sizeOf(spread, 'Vout')).toBe(sizeOf(short, 'B'));
  });
});

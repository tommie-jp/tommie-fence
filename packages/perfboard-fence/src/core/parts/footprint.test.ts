import { describe, expect, test } from 'vitest';
import { DIP_ROW_SPAN, edgeSideOf, footprintOf, mirroredTip, pinsOf } from './footprint.ts';
import { parseAddress } from '../model/address.ts';

const at = (text: string) => parseAddress(text)!;

describe('footprintOf', () => {
  test('knows a two-lead part is written with two holes', () => {
    expect(footprintOf('resistor')).toEqual({ kind: 'two-lead', pins: 2, holes: 2 });
  });

  test('knows a three-lead part is written with three', () => {
    // **足の位置は書かれたとおり。** TO-92 は列に並べても三角に開いても挿さる。
    expect(footprintOf('transistor')).toEqual({ kind: 'three-lead', pins: 3, holes: 3 });
  });

  test('reads the pin count out of a dip', () => {
    expect(footprintOf('dip8')).toEqual({ kind: 'dip', pins: 8, holes: 1 });
    expect(footprintOf('dip40')).toEqual({ kind: 'dip', pins: 40, holes: 1 });
  });

  test('refuses a dip with an odd or impossible pin count', () => {
    for (const type of ['dip7', 'dip2', 'dip42', 'dip0']) {
      expect(footprintOf(type)).toBeNull();
    }
  });

  test('reads a sip, which may have an odd pin count', () => {
    // 片側だけの列なので、dip と違って奇数でよい。
    expect(footprintOf('sip3')).toEqual({ kind: 'sip', pins: 3, holes: 1 });
  });

  test('knows nothing about a type it cannot place', () => {
    expect(footprintOf('nosuch')).toBeNull();
  });
});

describe('pinsOf', () => {
  test('takes the written holes as the pins for a two-lead part', () => {
    expect(pinsOf({ kind: 'two-lead', pins: 2, holes: 2 }, [at('b3'), at('b7')]))
      .toEqual([at('b3'), at('b7')]);
  });

  test('takes all three written holes for a three-lead part', () => {
    const holes = [at('b3'), at('b4'), at('b5')];

    expect(pinsOf({ kind: 'three-lead', pins: 3, holes: 3 }, holes)).toEqual(holes);
  });

  test('walks a dip anti-clockwise seen from above, pin 1 at the bottom left', () => {
    // アンカー (b3 = 2 行 3 列) は胴の左上の穴。切り欠きを左にした実物を上から見ると
    // 1 番は左下で、1〜4 が下の列を右へ、5〜8 が上の列を**左へ**戻る (52 の docs/71)。
    // 以前は 1 番を左上に置いていて、上から見て時計回り (実物の鏡像) だった。
    const pins = pinsOf({ kind: 'dip', pins: 8, holes: 1 }, [at('b3')]);

    expect(pins.map((pin) => `${pin.row},${pin.col}`)).toEqual([
      `${2 + DIP_ROW_SPAN},3`, `${2 + DIP_ROW_SPAN},4`, `${2 + DIP_ROW_SPAN},5`, `${2 + DIP_ROW_SPAN},6`,
      '2,6', '2,5', '2,4', '2,3',
    ]);
  });

  test('puts the far row of a dip 300 mil away, as the package is made', () => {
    expect(DIP_ROW_SPAN).toBe(3);
  });

  test('lays a sip along one row', () => {
    const pins = pinsOf({ kind: 'sip', pins: 3, holes: 1 }, [at('c2')]);

    expect(pins.map((pin) => `${pin.row},${pin.col}`)).toEqual(['3,2', '3,3', '3,4']);
  });

  test('gives nothing when the anchor is missing', () => {
    expect(pinsOf({ kind: 'dip', pins: 8, holes: 1 }, [])).toEqual([]);
  });
});

describe('端面実装の凹の先端', () => {
  const at = (text: string) => parseAddress(text)!;
  const board = { cols: 16, rows: 8 };
  const edge = footprintOf('sma', 'female-edge')!;

  test('is a three-pin footprint that lets one tip be left out', () => {
    expect(edge).toMatchObject({ kind: 'edge', pins: 3, holes: 3, minHoles: 2 });
  });

  test('fills in the other tip across the centre line on a side edge', () => {
    // 左の縁: 中心導体 e1、書いた先端 f0 → 反対側は d0。
    expect(pinsOf(edge, [at('e1'), at('f0')], board)).toEqual([at('e1'), at('f0'), at('d0')]);
    expect(pinsOf(edge, [at('e1'), at('d0')], board)).toEqual([at('e1'), at('d0'), at('f0')]);
  });

  test('fills in across the centre column on a top or bottom edge', () => {
    // 上の縁: 中心導体 b5、書いた先端 a4 → 反対側は a6。
    expect(mirroredTip(at('b5'), at('a4'), board)).toEqual(at('a6'));
    expect(edgeSideOf(at('b5'), at('a4'), board)).toBe('top');
  });

  test('keeps three written tips as they are', () => {
    expect(pinsOf(edge, [at('e1'), at('d0'), at('f0')], board)).toEqual([at('e1'), at('d0'), at('f0')]);
  });

  test('cannot mirror a tip that sits on the centre line', () => {
    expect(mirroredTip(at('e1'), at('e0'), board)).toBeNull();
    expect(pinsOf(edge, [at('e1'), at('e0')], board)).toHaveLength(2);
  });

  test('picks the side the tip faces when the corner is equally near', () => {
    // 左上の角: 中心導体 b1 は左の縁にも上の縁にも同じだけ近い。
    expect(edgeSideOf(at('b1'), at('c0'), board)).toBe('left');
    expect(edgeSideOf(at('b1'), at('a2'), board)).toBe('top');
  });
});


/**
 * 向きは**ピンの並べ方**で表す。箱も切り欠きもキャプションもピンから決まるので
 * (`placement/geometry.ts`)、ここが回れば図も付いてくる (52 の docs/14)。
 */
describe('回した DIP のピン', () => {
  const at = (row: number, col: number) => ({ row, col });
  const dip8 = { kind: 'dip', pins: 8, holes: 1 } as const;
  const anchor = [at(3, 3)];

  test('lays the pins out along the rows when nothing is written', () => {
    const pins = pinsOf(dip8, anchor, null, { rotate: 0, mirror: false });

    // 1 番は胴の左下 (アンカーの 3 行下)、4 番は右下。
    expect(pins[0]).toEqual(at(6, 3));
    expect(pins[3]).toEqual(at(6, 6));
    // 反対側の列は逆順 (1 番の向かいが 8 番。8 番がアンカーの穴)。
    expect(pins[7]).toEqual(at(3, 3));
  });

  test('turns the pins a quarter clockwise, leaving the anchor put', () => {
    const pins = pinsOf(dip8, anchor, null, { rotate: 90, mirror: false });

    // **アンカーは動かない。** 動かすと「回す」が「移動」になる。
    expect(pins[7]).toEqual(at(3, 3));
    // 下へ 3 だった 1 番は、時計回りで左へ 3。
    expect(pins[0]).toEqual(at(3, 0));
    expect(pins[3]).toEqual(at(6, 0));
  });

  test('turns them half way round', () => {
    const pins = pinsOf(dip8, anchor, null, { rotate: 180, mirror: false });

    expect(pins[0]).toEqual(at(0, 3));
    expect(pins[3]).toEqual(at(0, 0));
  });

  test('mirrors left to right, which flips the column side only', () => {
    // 裏返せるのは 1 列の形だけ (DIP は実物を裏返して挿せない)。
    const pins = pinsOf({ kind: 'sip', pins: 4, holes: 1 }, anchor, null, { rotate: 0, mirror: true });

    expect(pins[3]).toEqual(at(3, 0));
  });

  test('mirrors first and turns after, the way the word reads', () => {
    // circuit と同じ意味 (52 の docs/11)。反転で左右が入れ替わってから回る。
    const pins = pinsOf({ kind: 'sip', pins: 4, holes: 1 }, anchor, null, { rotate: 90, mirror: true });

    expect(pins[3]).toEqual(at(0, 3));
  });

  test('turns a sip along its one row', () => {
    const pins = pinsOf({ kind: 'sip', pins: 4, holes: 1 }, anchor, null, { rotate: 90, mirror: false });

    expect(pins[1]).toEqual(at(4, 3));
  });
});

describe('タクトスイッチ', () => {
  test('places four legs in a square from one anchor', () => {
    // 6mm 角のタクトスイッチ。**足の位置はパッケージが決める**ので、
    // 書くのはアンカー 1 つだけ (DIP と同じ考え方)。
    const footprint = footprintOf('button');

    expect(footprint).toEqual({ kind: 'switch', pins: 4, holes: 1 });
    expect(pinsOf(footprint!, [{ row: 2, col: 3 }])).toEqual([
      { row: 2, col: 3 }, { row: 2, col: 5 },
      { row: 4, col: 3 }, { row: 4, col: 5 },
    ]);
  });

  test('turns the square around the anchor', () => {
    const footprint = footprintOf('button-nc');
    const turned = pinsOf(footprint!, [{ row: 2, col: 3 }], null, { rotate: 90, mirror: false });

    // **アンカーは動かない。** 残りがその周りを回る。
    expect(turned[0]).toEqual({ row: 2, col: 3 });
    expect(new Set(turned.map((one) => `${one.row},${one.col}`)).size).toBe(4);
  });
});

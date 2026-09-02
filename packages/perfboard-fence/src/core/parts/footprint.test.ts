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

  test('walks a dip anti-clockwise from pin 1, the way the package is numbered', () => {
    // pin 1 が左上 (b3 = 2 行 3 列)。1〜4 は右へ、5〜8 は下の列を**左へ**戻る。
    const pins = pinsOf({ kind: 'dip', pins: 8, holes: 1 }, [at('b3')]);

    expect(pins.map((pin) => `${pin.row},${pin.col}`)).toEqual([
      '2,3', '2,4', '2,5', '2,6',
      `${2 + DIP_ROW_SPAN},6`, `${2 + DIP_ROW_SPAN},5`, `${2 + DIP_ROW_SPAN},4`, `${2 + DIP_ROW_SPAN},3`,
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


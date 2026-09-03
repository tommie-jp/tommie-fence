import { describe, expect, test } from 'vitest';
import { placeableTypes } from '../placement/footprints.ts';
import { PART_NAMES, PART_PREFIXES, holesOf, isAnchored, isTwoLead, partName, partPrefix } from './catalog.ts';

/**
 * **表と表の食い違いを見張る。** 種類を足したときに片方だけ古くなると、
 * パレットに出ない部品や、名前の付かない部品ができる。
 */
describe('置ける部品の表', () => {
  const types = placeableTypes();

  test('every placeable type has a Japanese name', () => {
    expect(types.filter((type) => partName(type) === type)).toEqual([]);
  });

  test('every placeable type has an id prefix', () => {
    expect(types.filter((type) => partPrefix(type) === null)).toEqual([]);
  });

  test('carries nothing the fence cannot place', () => {
    // 逆向きも見る。置けない種類の名前が残っていると、パレットから選べて置けない。
    expect(Object.keys(PART_NAMES).filter((type) => !types.includes(type))).toEqual([]);
    expect(Object.keys(PART_PREFIXES).filter((type) => !types.includes(type))).toEqual([]);
  });

  test('names a package by rule, so a size the palette does not list still has one', () => {
    // `dipN` はピン数がいくつでも読める。表に書き並べると「表に無い数」が名無しになる。
    expect(partName('dip8')).toBe('DIP 8 ピン');
    expect(partName('dip22')).toBe('DIP 22 ピン');
    expect(partName('sip4')).toBe('ピンヘッダ 4 ピン');
    expect(partName('pico-w')).toBe('Pico W');
    expect(partName('resistor')).toBe('抵抗');
    // 読めない綴りは、そのまま返して名前を騙らない。
    expect(partName('resistr')).toBe('resistr');
  });

  test('numbers a package with the prefix its schematic symbol would use', () => {
    expect(partPrefix('dip8')).toBe('U');
    expect(partPrefix('pico')).toBe('U');
    expect(partPrefix('sip4')).toBe('J');
    expect(partPrefix('resistor')).toBe('R');
    expect(partPrefix('resistr')).toBeNull();
  });

  test('offers the packages the palette can place with one click', () => {
    expect(types).toContain('dip8');
    expect(types).toContain('sip4');
    expect(types).toContain('pico-w');
    for (const type of ['dip8', 'sip4', 'pico']) expect(holesOf(type)).toBe(1);
  });

  test('every prefix is upper case letters, the way ids are written', () => {
    expect(Object.values(PART_PREFIXES).filter((prefix) => !/^[A-Z]{1,2}$/.test(prefix))).toEqual([]);
  });

  test('says how many holes each shape takes', () => {
    expect(holesOf('resistor')).toBe(2);
    expect(holesOf('transistor')).toBe(3);
    // タクトスイッチはアンカー 1 つ (足の位置はパッケージが決める)。
    expect(holesOf('button')).toBe(1);
    expect(holesOf('resistr')).toBe(0);
  });

  test('tells apart the ones dragged across from the ones anchored', () => {
    expect(isTwoLead('resistor')).toBe(true);
    expect(isTwoLead('transistor')).toBe(false);
    expect(isAnchored('button')).toBe(true);
    expect(isAnchored('resistor')).toBe(false);
  });
});

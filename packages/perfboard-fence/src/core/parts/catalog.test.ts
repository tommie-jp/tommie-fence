import { describe, expect, test } from 'vitest';
import { placeableNames } from './types.ts';
import { PART_NAMES, PART_PREFIXES, holesOf, isTwoLead, partName, partPrefix } from './catalog.ts';

/**
 * **表と表の食い違いを見張る。** 種類を足したときに片方だけ古くなると、
 * パレットに出ない部品や、名前の付かない部品ができる。
 */
describe('置ける部品の表', () => {
  const types = placeableNames();

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

  test('every prefix is upper case letters, the way ids are written', () => {
    expect(Object.values(PART_PREFIXES).filter((prefix) => !/^[A-Z]{1,2}$/.test(prefix))).toEqual([]);
  });

  test('says how many holes each shape takes', () => {
    expect(holesOf('resistor')).toBe(2);
    expect(holesOf('transistor')).toBe(3);
    expect(holesOf('resistr')).toBe(0);
  });

  test('tells apart the ones dragged across from the ones placed by one hole', () => {
    expect(isTwoLead('resistor')).toBe(true);
    expect(isTwoLead('transistor')).toBe(false);
  });

  test('names a package by rule, so a size the palette does not list still has one', () => {
    expect(partName('dip8')).toBe('DIP 8 ピン');
    expect(partName('sip4')).toBe('ピンヘッダ 4 ピン');
    expect(partName('resistor')).toBe('抵抗');
    expect(partName('resistr')).toBe('resistr');
  });

  test('numbers a package with the prefix its schematic symbol would use', () => {
    expect(partPrefix('dip8')).toBe('U');
    expect(partPrefix('sip4')).toBe('J');
    expect(partPrefix('resistor')).toBe('R');
    expect(partPrefix('resistr')).toBeNull();
  });

  test('offers the packages the palette can place with one click', () => {
    expect(placeableNames()).toContain('dip8');
    expect(placeableNames()).toContain('sip4');
    for (const type of ['dip8', 'sip4']) expect(holesOf(type)).toBe(1);
  });
});

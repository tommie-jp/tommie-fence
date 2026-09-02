import { describe, expect, test } from 'vitest';
import { darken, isLandColor, isPlateColor, plateValue, wireOn } from './finish.ts';

describe('板の仕上げの色', () => {
  test('reads the resist colours by name, green first among them', () => {
    expect(isPlateColor('green')).toBe(true);
    expect(plateValue('GREEN')).toBe(plateValue('green'));
  });

  test('reads the plating by name, silver among them', () => {
    expect(isLandColor('silver')).toBe(true);
    expect(isLandColor('gold')).toBe(true);
  });

  test('takes a hex spelling for a colour it has no name for', () => {
    expect(isPlateColor('#123456')).toBe(true);
    expect(plateValue('#123456')).toBe('#123456');
  });

  test('refuses anything else, since the colour reaches the attribute as written', () => {
    for (const bad of ['chartreuse', 'red" onload="x', 'url(#a)', '']) {
      expect(isPlateColor(bad)).toBe(false);
      expect(isLandColor(bad)).toBe(false);
    }
  });

  test('does not take a plating name as a resist colour, or the other way round', () => {
    // 表を分けてあるのは、板に `gold`、ランドに `green` と書けてしまわないため。
    expect(isPlateColor('gold')).toBe(false);
    expect(isLandColor('green')).toBe(false);
  });
});

describe('darken', () => {
  test('makes a darker shade of the colour it was given', () => {
    expect(darken('#ffffff')).toBe('#a6a6a6');
    expect(darken('#000000')).toBe('#000000');
  });

  test('takes the short spelling too', () => {
    expect(darken('#fff')).toBe(darken('#ffffff'));
  });
});

describe('配線の既定色', () => {
  test('is light on a dark board and dark on a light board', () => {
    // 既定を 1 つの灰色に固定すると、同じ濃さの板で線が沈む。
    expect(wireOn('#2c7a4b')).not.toBe(wireOn('#e8eaec'));
  });

  test('follows the board, so changing the resist changes the default line', () => {
    expect(wireOn('#ffffff')).toBe(wireOn('#e8eaec'));
    expect(wireOn('#000000')).toBe(wireOn('#2c7a4b'));
    expect(wireOn('#ffffff')).not.toBe(wireOn('#000000'));
  });
});

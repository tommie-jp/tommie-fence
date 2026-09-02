import { describe, expect, test } from 'vitest';
import { colorValue, isColor, wireStroke } from './color.ts';

describe('isColor', () => {
  test('takes the names of the wire colours it has', () => {
    for (const name of ['red', 'BLACK', 'blue']) expect(isColor(name)).toBe(true);
  });

  test('takes a hex spelling, in either length', () => {
    for (const hex of ['#f00', '#FF0000', '#0a7c3b']) expect(isColor(hex)).toBe(true);
  });

  test('refuses anything that is not exactly one of those two', () => {
    // 色は属性へそのまま流れるので、**ここが唯一の関所**。
    for (const bad of ['chartreuse', '#ff00', '#gggggg', 'red" onload="x', 'rgb(1,2,3)', '#', 'url(#a)']) {
      expect(isColor(bad)).toBe(false);
    }
  });
});

describe('colorValue', () => {
  test('keeps a hex spelling as written, in lower case', () => {
    expect(colorValue('#FF0000')).toBe('#ff0000');
  });

  test('looks a name up in the table of real wire colours', () => {
    expect(colorValue('red')).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('answers null for a spelling it cannot read, rather than passing it through', () => {
    expect(colorValue('chartreuse')).toBeNull();
  });
});

describe('wireStroke', () => {
  test('falls back to the default grey when nothing was written', () => {
    expect(wireStroke(null)).toBe(wireStroke('nosuch'));
  });
});

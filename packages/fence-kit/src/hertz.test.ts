import { describe, expect, test } from 'vitest';
import { formatHertz, formatHertzShort, isBareNumber, parseHertz, parsePrefixedHertz } from './values.ts';

describe('parseHertz', () => {
  test.each([
    ['50k', 50e3],
    ['1M', 1e6],
    ['2.4G', 2.4e9],
    ['1575MHz', 1.575e9],
    ['433 MHz', 433e6],
    ['10000000', 1e7],
    ['.5G', 0.5e9],
    ['100Hz', 100],
    ['1kHz', 1e3],
  ])('reads %s', (text, hz) => {
    expect(parseHertz(text)).toBeCloseTo(hz, 3);
  });

  // `m` を M と読むと、ミリと取り違えたときに 10^9 倍違う値を黙って描く。
  test.each(['', 'abc', '1MHz2', '-5M', '0', '1T', '300m', '2.4m', '1K', '1g', '10hz', '10HZ'])('refuses %s', (text) => {
    expect(parseHertz(text)).toBeNull();
  });

});

describe('formatHertz', () => {
  test('writes readings with fixed decimals, three by default', () => {
    expect(formatHertz(10e6)).toBe('10.000 MHz');
    expect(formatHertz(1.5e9)).toBe('1.500 GHz');
    expect(formatHertz(500)).toBe('500.000 Hz');
    expect(formatHertz(1e3, 1)).toBe('1.0 kHz');
  });

  test('drops trailing zeros on the axis, with or without a space', () => {
    expect(formatHertzShort(150.5e6)).toBe('150.5 MHz');
    expect(formatHertzShort(1e6)).toBe('1 MHz');
    expect(formatHertzShort(2.4e9, '')).toBe('2.4GHz');
    expect(formatHertzShort(1e4, '')).toBe('10kHz');
  });
});

describe('parsePrefixedHertz — フェンスの周波数の欄', () => {
  test('reads a prefix, and Hz with or without one', () => {
    expect(parsePrefixedHertz('100M')).toBe(100e6);
    expect(parsePrefixedHertz('2.4GHz')).toBe(2.4e9);
    expect(parsePrefixedHertz('900Hz')).toBe(900);
  });

  test('refuses a bare number, which may be a slip of 1 kHz or 1 GHz', () => {
    expect(parsePrefixedHertz('10000000')).toBeNull();
    expect(isBareNumber('10000000')).toBe(true);
    expect(isBareNumber('10M')).toBe(false);
  });
});

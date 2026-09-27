import { describe, expect, test } from 'vitest';
import { formatHertz, formatHertzShort, parseHertz } from './values.ts';

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

  test('refuses a bare number or a bare prefix when the unit is required', () => {
    expect(parseHertz('1000', { unit: 'required' })).toBeNull();
    expect(parseHertz('1k', { unit: 'required' })).toBeNull();
    expect(parseHertz('1kHz', { unit: 'required' })).toBe(1e3);
    expect(parseHertz('100 Hz', { unit: 'required' })).toBe(100);
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

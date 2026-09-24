import { describe, expect, test } from 'vitest';
import { formatHertz, formatHertzShort, parseHertz } from './frequency.ts';

describe('parseHertz', () => {
  test.each([
    ['50k', 50e3],
    ['1M', 1e6],
    ['2.4G', 2.4e9],
    ['1575MHz', 1.575e9],
    ['433 MHz', 433e6],
    ['10000000', 1e7],
    ['300m', 300e6],
    ['.5G', 0.5e9],
  ])('reads %s', (text, hz) => {
    expect(parseHertz(text)).toBeCloseTo(hz, 3);
  });

  test.each(['', 'abc', '1MHz2', '-5M', '0', '1T'])('refuses %s', (text) => {
    expect(parseHertz(text)).toBeNull();
  });
});

describe('formatHertz', () => {
  test('writes marker frequencies the way the NanoVNA screen does', () => {
    expect(formatHertz(10e6)).toBe('10.000 MHz');
    expect(formatHertz(1.5e9)).toBe('1.500 GHz');
    expect(formatHertz(50e3)).toBe('50.000 kHz');
    expect(formatHertz(500)).toBe('500.000 Hz');
  });

  test('drops trailing zeros on the axis', () => {
    expect(formatHertzShort(150.5e6)).toBe('150.5 MHz');
    expect(formatHertzShort(1.5e9)).toBe('1.5 GHz');
    expect(formatHertzShort(1e6)).toBe('1 MHz');
  });
});

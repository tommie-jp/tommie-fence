import { describe, expect, test } from 'vitest';
import { formatReading, parseNumber, parseQuantity, threeDigits, withPrefix } from './quantity.ts';

describe('parseNumber', () => {
  test('reads plain numbers, exponents and SI prefixes', () => {
    expect(parseNumber('0.38')).toBe(0.38);
    expect(parseNumber('-40')).toBe(-40);
    expect(parseNumber('1.5e3')).toBe(1500);
    expect(parseNumber('2k')).toBe(2000);
    expect(parseNumber('15.9k')).toBeCloseTo(15900);
    expect(parseNumber('25.9m')).toBeCloseTo(0.0259);
    expect(parseNumber('4.4n')).toBeCloseTo(4.4e-9);
    expect(parseNumber('1u')).toBeCloseTo(1e-6);
    expect(parseNumber('1µ')).toBeCloseTo(1e-6);
  });

  test('tells m (milli) from M (mega)', () => {
    expect(parseNumber('10m')).toBeCloseTo(0.01);
    expect(parseNumber('10M')).toBe(1e7);
  });

  test('refuses words, units and empty text', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('2kHz')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('1e999')).toBeNull();
  });
});

describe('parseQuantity', () => {
  test('takes the number with or without the axis unit', () => {
    expect(parseQuantity('2k', 'Hz')).toEqual({ ok: true, value: 2000 });
    expect(parseQuantity('2kHz', 'Hz')).toEqual({ ok: true, value: 2000 });
    expect(parseQuantity('17.6mA', 'mA')).toEqual({ ok: true, value: 17.6 });
    expect(parseQuantity('-45°', 'deg')).toEqual({ ok: true, value: -45 });
    expect(parseQuantity('-45deg', 'deg')).toEqual({ ok: true, value: -45 });
  });

  test('refuses another unit instead of reading it as something else', () => {
    const read = parseQuantity('0.0176A', 'mA');
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toContain('軸は mA');
    expect(parseQuantity('hello', 'mA')).toEqual({ ok: false, reason: '数が読めません' });
  });
});

describe('threeDigits and withPrefix', () => {
  test('keep three significant digits with trailing zeros', () => {
    expect(threeDigits(-45)).toBe('-45.0');
    expect(threeDigits(0.868)).toBe('0.868');
    expect(threeDigits(17.6)).toBe('17.6');
    expect(threeDigits(0)).toBe('0');
    expect(withPrefix(15900)).toBe('15.9k');
    expect(withPrefix(0.6)).toBe('600m');
    expect(withPrefix(0)).toBe('0');
  });
});

describe('formatReading', () => {
  test('writes the value with its unit the way the textbook does', () => {
    expect(formatReading(15900, 'Hz')).toBe('15.9 kHz');
    expect(formatReading(100, 'Hz')).toBe('100 Hz');
    expect(formatReading(0.6, 'V')).toBe('0.600 V');
    expect(formatReading(-3.0103, 'dB')).toBe('−3.01 dB');
    expect(formatReading(-45, 'deg')).toBe('−45.0°');
    expect(formatReading(2.5, '')).toBe('2.50');
  });

  test('does not stack a prefix on a unit that already has one', () => {
    expect(formatReading(1200, 'mA')).toBe('1200 mA');
  });
});

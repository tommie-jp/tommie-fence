import { describe, expect, test } from 'vitest';
import { DBM_OVER_DBV, dbvFromPeak, formatLevel, formatSetting, formatTick, fromUnit, powerSum, toUnit } from './level.ts';

describe('level', () => {
  test('puts 1 V rms at +13.01 dBm in 50 Ω', () => {
    expect(DBM_OVER_DBV).toBeCloseTo(13.0103, 4);
    expect(toUnit(0, 'dBm')).toBeCloseTo(13.0103, 4);
    expect(fromUnit(toUnit(-3, 'dBm'), 'dBm')).toBeCloseTo(-3, 12);
    expect(toUnit(-3, 'dBV')).toBe(-3);
  });

  test('turns a peak into dBV rms, and zero into the bottom', () => {
    expect(dbvFromPeak(Math.SQRT2)).toBeCloseTo(0, 12);
    expect(dbvFromPeak(0)).toBe(-200);
  });

  test('adds powers', () => {
    expect(powerSum([-10, -10])).toBeCloseTo(-6.99, 2);
    expect(powerSum([])).toBe(-200);
  });

  test('writes the reading with two decimals and a true minus', () => {
    expect(formatLevel(-7.9, 'dBm')).toBe('−7.90 dBm');
    expect(formatLevel(-0.001, 'dBV')).toBe('0.00 dBV');
    expect(formatLevel(3, 'dBV')).toBe('3.00 dBV');
    expect(formatTick(-12.5)).toBe('−12.5');
    expect(formatSetting(-10, 'dBm')).toBe('−10 dBm');
  });
});

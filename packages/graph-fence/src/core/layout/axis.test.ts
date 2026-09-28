import { describe, expect, test } from 'vitest';
import { fraction, linearAxis, logAxis, startsAtZero, tickLabel } from './axis.ts';

const values = (axis: { readonly ticks: readonly { readonly value: number }[] }): number[] => axis.ticks.map((tick) => tick.value);

describe('linearAxis', () => {
  test('starts a magnitude at 0 and picks a 1-2-5 step with 4 to 8 ticks', () => {
    const axis = linearAxis([0.38, 24.9], null, 'mA', true);
    expect([axis.min, axis.max]).toEqual([0, 25]);
    expect(values(axis)).toEqual([0, 5, 10, 15, 20, 25]);
  });

  test('wraps dB values without forcing 0 at the bottom', () => {
    const axis = linearAxis([-36, -0.02], null, 'dB', startsAtZero('dB'));
    expect([axis.min, axis.max]).toEqual([-40, 0]);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(5);
    expect(axis.ticks.length).toBeLessThanOrEqual(9);
  });

  test('uses 15° steps for a phase axis', () => {
    const axis = linearAxis([-89.1, -3.6], null, 'deg', startsAtZero('deg'));
    expect([axis.min, axis.max]).toEqual([-90, 0]);
    expect(values(axis)).toEqual([-90, -75, -60, -45, -30, -15, 0]);
  });

  test('keeps a written range and puts ticks on the step inside it', () => {
    const axis = linearAxis([], [0.2, 0.8], 'V', false);
    expect([axis.min, axis.max]).toEqual([0.2, 0.8]);
    expect(values(axis)).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  });

  test('opens a flat line so the axis has a height', () => {
    const axis = linearAxis([5, 5], null, 'V', true);
    expect([axis.min, axis.max]).toEqual([0, 5]);
    const flat = linearAxis([-3, -3], null, 'dB', false);
    expect(flat.min).toBeLessThan(-3);
    expect(flat.max).toBeGreaterThan(-3);
    expect(linearAxis([], null, 'V', true).max).toBe(1);
    expect(linearAxis([-2, -1], null, 'V', true).max).toBe(0);
  });
});

describe('logAxis', () => {
  test('puts majors at powers of ten and minors at 2 and 5', () => {
    const axis = logAxis([], [2000, 32000]);
    expect(axis.ticks.filter((tick) => tick.major).map((tick) => tick.value)).toEqual([10000]);
    expect(axis.ticks.filter((tick) => !tick.major).map((tick) => tick.value)).toEqual([2000, 5000, 20000]);
  });

  test('wraps the values in whole decades when no range is written', () => {
    const axis = logAxis([0.38, 24.9], null);
    expect([axis.min, axis.max]).toEqual([0.1, 100]);
    expect(logAxis([], null).max).toBe(10);
  });
});

describe('fraction', () => {
  test('places values on linear and log axes, and clamps outside', () => {
    expect(fraction(linearAxis([], [0, 10], 'V', false), 5)).toBe(0.5);
    expect(fraction(logAxis([], [100, 100000]), 1000)).toBeCloseTo(1 / 3);
    expect(fraction(linearAxis([], [0, 10], 'V', false), 20)).toBe(1);
    expect(fraction(linearAxis([], [0, 10], 'V', false), Number.NaN)).toBe(0);
  });
});

describe('tickLabel', () => {
  const log = logAxis([], [100, 100000]);
  const linear = linearAxis([], [-40, 0], 'dB', false);

  test('writes log ticks with prefixes and no trailing zeros', () => {
    expect(tickLabel(2000, log)).toBe('2k');
    expect(tickLabel(10000, log)).toBe('10k');
    expect(tickLabel(100, log)).toBe('100');
  });

  test('writes powers of ten on a log axis whose unit has a prefix', () => {
    const current = logAxis([], [1e-6, 10]);
    expect(tickLabel(1e-3, current, 'mA')).toBe('10⁻³');
    expect(tickLabel(10, current, 'mA')).toBe('10¹');
    expect(tickLabel(2e-3, current, 'mA')).toBe('0.002');
  });

  test('writes linear ticks as plain numbers with a real minus sign', () => {
    expect(tickLabel(-40, linear)).toBe('−40');
    expect(tickLabel(0.5, linear)).toBe('0.5');
    expect(tickLabel(20000, linearAxis([], [0, 20000], 'Hz', false))).toBe('20k');
  });
});

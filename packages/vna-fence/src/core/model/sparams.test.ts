import { describe, expect, test } from 'vitest';
import { complex, div, inverse, isFiniteComplex, polar } from './complex.ts';
import { DB_FLOOR, OHM_CEILING, SWR_CEILING, groupDelay, impedanceFrom, logMag, phaseDeg, swr } from './sparams.ts';
import type { SPoint } from './sparams.ts';

describe('formats', () => {
  test('logMag floors |S| = 0 instead of writing −Infinity', () => {
    expect(logMag(complex(0))).toBe(DB_FLOOR);
    expect(logMag(complex(1e-20))).toBe(DB_FLOOR);
    expect(logMag(complex(0.5))).toBeCloseTo(-6.02, 2);
  });

  test('SWR of Γ = 0.5 is 3, and a full reflection is capped', () => {
    expect(swr(complex(0.5))).toBeCloseTo(3, 9);
    expect(swr(complex(1))).toBe(SWR_CEILING);
    expect(swr(complex(0.999))).toBe(SWR_CEILING);
  });

  test('impedance from Γ, with the open capped', () => {
    expect(impedanceFrom(complex(0.5)).re).toBeCloseTo(150, 9);
    expect(impedanceFrom(complex(-1)).re).toBeCloseTo(0, 9);
    expect(impedanceFrom(complex(1)).re).toBe(OHM_CEILING);
  });

  test('phase in degrees', () => {
    expect(phaseDeg(complex(0, 1))).toBeCloseTo(90, 9);
  });
});

describe('groupDelay', () => {
  const delayLine = (tau: number, fs: readonly number[]): SPoint[] =>
    fs.map((f) => ({ f, s11: polar(1, -2 * Math.PI * f * tau), s21: polar(1, -2 * Math.PI * f * tau), s12: null, s22: null }));

  test('a pure delay reads back its delay, across the ±180° wrap', () => {
    const fs = Array.from({ length: 50 }, (_, index) => 1e6 + index * 20e6);
    const delays = groupDelay(delayLine(5e-9, fs), 'S21');
    for (const delay of delays) expect(delay).toBeCloseTo(5e-9, 12);
  });

  test('gives nothing when a point has no value', () => {
    const points: SPoint[] = [{ f: 1, s11: complex(1), s21: null, s12: null, s22: null }, { f: 2, s11: complex(1), s21: null, s12: null, s22: null }];
    expect(groupDelay(points, 'S21')).toEqual([null, null]);
  });

  test('gives nothing for a single point', () => {
    expect(groupDelay(delayLine(1e-9, [1e6]), 'S21')).toEqual([null]);
  });
});

describe('complex', () => {
  test('division by zero is not finite (callers cap it)', () => {
    expect(isFiniteComplex(div(complex(1), complex(0)))).toBe(false);
    expect(inverse(complex(0, 2)).im).toBeCloseTo(-0.5, 12);
  });
});

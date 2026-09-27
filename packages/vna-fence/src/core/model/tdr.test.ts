import { describe, expect, test } from 'vitest';
import { polar } from './complex.ts';
import { tdrOf } from './tdr.ts';

describe('tdrOf', () => {
  test('an open cable of 1 m (vf 0.66) peaks at 1 m, near 1', () => {
    const tau = (2 * 1) / (0.66 * 299_792_458);
    const fs = Array.from({ length: 401 }, (_, index) => 1e6 + index * 2.4975e6);
    const tdr = tdrOf(fs, fs.map((f) => polar(1, -2 * Math.PI * f * tau)), 0.66);
    expect(tdr?.peak?.distance).toBeCloseTo(1, 1);
    expect(tdr?.peak?.value).toBeGreaterThan(0.9);
    expect(tdr?.range).toBeCloseTo(39.6, 0);
  });

  test('refuses what it cannot transform', () => {
    expect(tdrOf([1], [polar(1, 0)], 0.66)).toBeNull();
    expect(tdrOf([2, 1], [polar(1, 0), polar(1, 0)], 0.66)).toBeNull();
    expect(tdrOf([1, 2], [polar(1, 0)], 0.66)).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import { polar } from './complex.ts';
import { inverseFft, kaiser, tdrOf } from './tdr.ts';

describe('inverseFft', () => {
  test('a single frequency line becomes a rotating phasor of 1/n', () => {
    const n = 8;
    const input = Array.from({ length: n }, (_, index) => (index === 1 ? { re: 1, im: 0 } : { re: 0, im: 0 }));
    const out = inverseFft(input);
    expect(out[0]?.re).toBeCloseTo(1 / n, 12);
    expect(out[2]?.im).toBeCloseTo(1 / n, 12);
  });

  test('does not touch its input', () => {
    const input = [{ re: 1, im: 0 }, { re: 0, im: 0 }];
    inverseFft(input);
    expect(input).toEqual([{ re: 1, im: 0 }, { re: 0, im: 0 }]);
  });
});

describe('kaiser', () => {
  test('is 1 in the middle and small at the edges', () => {
    const window = kaiser(101);
    expect(window[50]).toBeCloseTo(1, 9);
    expect(window[0]).toBeLessThan(0.1);
    expect(kaiser(1)).toEqual([1]);
  });
});

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

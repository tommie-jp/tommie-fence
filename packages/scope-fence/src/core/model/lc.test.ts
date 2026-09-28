import { describe, expect, test } from 'vitest';
import { expm2, lcSettleOf, secondOrderLowPass } from './lc.ts';
import { applyOps, needsPeriod, tauOf } from './ops.ts';

const maxOf = (values: Float64Array, from = 0): number => {
  let max = -Infinity;
  for (let index = from; index < values.length; index += 1) max = Math.max(max, values[index] ?? 0);
  return max;
};

describe('expm2', () => {
  test('is the identity for the zero matrix and e^a on a diagonal', () => {
    expect(expm2([0, 0, 0, 0])).toEqual([1, 0, 0, 1]);
    const [a, b, c, d] = expm2([3, 0, 0, -2]);
    expect(a).toBeCloseTo(Math.exp(3), 10);
    expect(d).toBeCloseTo(Math.exp(-2), 12);
    expect([b, c]).toEqual([0, 0]);
  });

  test('rotates for [[0, θ], [−θ, 0]]', () => {
    const [a, b, c, d] = expm2([0, 2, -2, 0]);
    expect(a).toBeCloseTo(Math.cos(2), 12);
    expect(b).toBeCloseTo(Math.sin(2), 12);
    expect(c).toBeCloseTo(-Math.sin(2), 12);
    expect(d).toBeCloseTo(Math.cos(2), 12);
  });
});

describe('lc — 2nd-order low-pass', () => {
  test('overshoots a step by exp(−π/√(4Q²−1)) = 16.3 % for Q = 1', () => {
    const dt = 1e-6;
    const step = new Float64Array(5000).fill(1);
    step[0] = 0;
    const output = applyOps(step, dt, [{ kind: 'lc', f0: 1000, q: 1 }]);
    expect(output[0]).toBe(0);
    expect(maxOf(output) - 1).toBeCloseTo(Math.exp(-Math.PI / Math.sqrt(3)), 3);
    // 5 ms (≈ 16 τ) で 1 に落ち着く。
    expect(output[4999]).toBeCloseTo(1, 3);
  });

  test('passes a sine at f0 at 0.707 of its amplitude for Q = 1/√2 (−3 dB)', () => {
    const dt = 1e-6;
    const n = 20000;
    const sine = Float64Array.from({ length: n }, (_, index) => Math.sin(2 * Math.PI * 1000 * index * dt));
    const output = applyOps(sine, dt, [{ kind: 'lc', f0: 1000, q: Math.SQRT1_2 }], { warmup: 15000, period: 1e-3 });
    // 助走 15 ms (≈ 66 τ) の後の 5 ms の山。
    expect(Math.abs(maxOf(output, 15000) - Math.SQRT1_2) / Math.SQRT1_2).toBeLessThan(0.02);
  });

  test('stays bounded however coarse the step (exact discretisation)', () => {
    const step = new Float64Array(100).fill(1);
    step[0] = 0;
    for (const [f0, dt] of [[1000, 1e-2], [1e9, 1e-3], [1, 1e-9]] as const) {
      const output = secondOrderLowPass(step, dt, f0, 100, 0);
      expect(output.every((value) => Number.isFinite(value) && Math.abs(value) <= 3)).toBe(true);
    }
  });

  test('starts from the mean of the warm-up, at rest', () => {
    const square = Float64Array.from({ length: 1000 }, (_, index) => (index % 10 < 5 ? 5 : 0));
    const output = secondOrderLowPass(square, 1e-7, 100, 10, 500);
    expect(output[0]).toBeCloseTo(2.5, 12);
  });

  test('counts its settling time in the warm-up: 2Q/ω0, or the slow pole when overdamped', () => {
    expect(tauOf([{ kind: 'lc', f0: 1000, q: 10 }])).toBeCloseTo(10 / (Math.PI * 1000), 15);
    expect(lcSettleOf(1000, 0.5)).toBeCloseTo(1 / (2 * Math.PI * 1000), 15);
    // Q = 0.1: 遅い極 ω0 (5 − √24) の逆数。
    expect(lcSettleOf(1000, 0.1)).toBeCloseTo(1 / (2 * Math.PI * 1000 * (5 - Math.sqrt(24))), 12);
    expect(needsPeriod([{ kind: 'lc', f0: 1000, q: 1 }])).toBe(true);
  });
});

import { describe, expect, test } from 'vitest';
import { applyOps, delayOf, needsPeriod, tauOf } from './ops.ts';

const of = (values: readonly number[]): Float64Array => Float64Array.from(values);

describe('applyOps', () => {
  test('returns a new array and leaves the input alone', () => {
    const input = of([1, -2, 3]);
    const output = applyOps(input, 1e-6, [{ kind: 'abs' }]);
    expect([...output]).toEqual([1, 2, 3]);
    expect([...input]).toEqual([1, -2, 3]);
  });

  test('clips both sides, or only the low side', () => {
    expect([...applyOps(of([-5, 0.2, 5]), 1, [{ kind: 'clip', low: -0.7, high: 0.7 }])]).toEqual([-0.7, 0.2, 0.7]);
    expect([...applyOps(of([-5, 0.2, 5]), 1, [{ kind: 'clip', low: 0, high: null }])]).toEqual([0, 0.2, 5]);
  });

  test('shifts, scales and chains in order', () => {
    const output = applyOps(of([1, -1]), 1, [{ kind: 'gain', factor: 0.5 }, { kind: 'offset', volts: 4.3 }]);
    expect(output[0]).toBeCloseTo(4.8, 12);
    expect(output[1]).toBeCloseTo(3.8, 12);
  });

  test('gain never lets Infinity or NaN through, even with a factor the parser should have refused', () => {
    const output = applyOps(of([1, 0, -1]), 1, [{ kind: 'gain', factor: Number.POSITIVE_INFINITY }]);
    expect([...output]).toEqual([0, 0, 0]);
  });

  test('rc follows a step: 1 tau after the edge reaches 63.2 %', () => {
    const dt = 1e-6;
    const n = 1001;
    const step = new Float64Array(n).fill(1);
    step[0] = 0;
    const output = applyOps(step, dt, [{ kind: 'rc', tau: 1e-3 }]);
    expect(output[0]).toBe(0);
    // 段は 0 と 1 の点の間 (0.5 dt) にある。1000 点目はそこから 999.5 dt。
    expect(output[1000]).toBeCloseTo(1 - Math.exp(-0.9995), 6);
  });

  test('peak holds the highest value and lets it fall with tau', () => {
    const dt = 1e-3;
    const output = applyOps(of([0, 1, 0.2, 0.2, 0.9]), dt, [{ kind: 'peak', tau: 10e-3 }]);
    expect(output[0]).toBe(0);
    expect(output[1]).toBe(1);
    expect(output[2]).toBeCloseTo(Math.exp(-0.1), 12);
    expect(output[3]).toBeCloseTo(Math.exp(-0.2), 12);
    // 入力が落ちた値より上に来れば追いつく (コンデンサがダイオード越しに充電される)。
    expect(output[4]).toBeCloseTo(Math.max(0.9, Math.exp(-0.3)), 12);
  });
});

describe('applyOps — stage 3b', () => {
  const dt = 1e-6;
  const stepOf = (n: number): Float64Array => {
    const step = new Float64Array(n).fill(1);
    step[0] = 0;
    return step;
  };

  test('hp of a step decays with tau: 36.8 % one tau after the edge', () => {
    const output = applyOps(stepOf(1001), dt, [{ kind: 'hp', tau: 1e-3 }]);
    expect(output[0]).toBe(0);
    expect(output[1000]).toBeCloseTo(Math.exp(-0.9995), 6);
  });

  test('hp and rc with the same tau add back to the input (V_R + V_C = V_in)', () => {
    const input = Float64Array.from({ length: 500 }, (_, index) => Math.sin(index / 30) + (index > 200 ? 1 : 0));
    const low = applyOps(input, dt, [{ kind: 'rc', tau: 50e-6 }]);
    const high = applyOps(input, dt, [{ kind: 'hp', tau: 50e-6 }]);
    for (let index = 0; index < input.length; index += 1) expect((low[index] ?? 0) + (high[index] ?? 0)).toBeCloseTo(input[index] ?? 0, 12);
  });

  test('integrate divides by tau and keeps volts: a 1 V step for 1 tau rises by 1 V', () => {
    const output = applyOps(stepOf(1001), dt, [{ kind: 'integrate', tau: 1e-3 }]);
    expect(output[0]).toBe(0);
    // 段は 0 と 1 の点の間。台形なので最初の刻みは 0.5 dt ぶん。
    expect(output[1000]).toBeCloseTo(0.9995, 9);
  });

  test('integrate sets the constant so the last warm-up period averages 0', () => {
    const n = 400;
    const input = Float64Array.from({ length: n }, (_, index) => (Math.floor(index / 50) % 2 === 0 ? 1 : -1));
    const output = applyOps(input, dt, [{ kind: 'integrate', tau: 100e-6 }], { warmup: 200, period: 100e-6 });
    let sum = 0;
    for (let index = 100; index < 200; index += 1) sum += output[index] ?? 0;
    expect(sum / 100).toBeCloseTo(0, 12);
  });

  test('delay shifts by whole and fractional samples, holding the first value before the start', () => {
    const input = of([0, 1, 2, 3, 4]);
    expect([...applyOps(input, 1, [{ kind: 'delay', seconds: 2 }])]).toEqual([0, 0, 0, 1, 2]);
    expect([...applyOps(input, 1, [{ kind: 'delay', seconds: 0.5 }])]).toEqual([0, 0.5, 1.5, 2.5, 3.5]);
    expect([...applyOps(input, 1, [{ kind: 'delay', seconds: 0 }])]).toEqual([0, 1, 2, 3, 4]);
  });

  test('invert flips the sign', () => {
    expect([...applyOps(of([1, -2, 0]), 1, [{ kind: 'invert' }])]).toEqual([-1, 2, -0]);
  });
});

describe('tauOf / delayOf / needsPeriod', () => {
  test('counts rc, hp and peak, so all get the same warm-up; integrate is a scale, not a settling time', () => {
    expect(tauOf([{ kind: 'rc', tau: 1e-3 }, { kind: 'abs' }, { kind: 'peak', tau: 2e-3 }, { kind: 'hp', tau: 4e-3 }])).toBeCloseTo(7e-3, 12);
    expect(tauOf([{ kind: 'integrate', tau: 1 }])).toBe(0);
  });

  test('sums the delays and says when a period of warm-up is needed', () => {
    expect(delayOf([{ kind: 'delay', seconds: 1e-3 }, { kind: 'delay', seconds: 2e-3 }])).toBeCloseTo(3e-3, 12);
    expect(needsPeriod([{ kind: 'integrate', tau: 1e-3 }])).toBe(true);
    expect(needsPeriod([{ kind: 'delay', seconds: 1e-3 }, { kind: 'invert' }])).toBe(false);
  });
});

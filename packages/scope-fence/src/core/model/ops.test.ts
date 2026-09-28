import { describe, expect, test } from 'vitest';
import { applyOps, tauOf } from './ops.ts';

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

describe('tauOf', () => {
  test('counts rc and peak, so both get the same warm-up', () => {
    expect(tauOf([{ kind: 'rc', tau: 1e-3 }, { kind: 'abs' }, { kind: 'peak', tau: 2e-3 }])).toBeCloseTo(3e-3, 12);
  });
});

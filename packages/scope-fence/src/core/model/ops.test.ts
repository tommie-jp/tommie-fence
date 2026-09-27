import { describe, expect, test } from 'vitest';
import { applyOps } from './ops.ts';

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
});

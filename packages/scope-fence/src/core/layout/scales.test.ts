import { describe, expect, test } from 'vitest';
import { parseWave } from 'fence-kit';
import type { ChannelSpec } from '../model/channel.ts';
import { autoRange, autoTimePerDiv, fractionY, niceStep125 } from './scales.ts';

const ch = (text: string): ChannelSpec => {
  const read = parseWave(text);
  if (!read.ok) throw new Error(read.reason);
  return { name: 'ch1', source: { kind: 'wave', wave: read.value }, ops: [], range: null, position: null, line: null };
};

describe('niceStep125', () => {
  test.each([
    [0.333, 0.5], [0.5, 0.5], [0.51, 1], [1.5, 2], [2e-4, 2e-4], [3e-6, 5e-6], [7, 10], [0, 1],
  ])('rounds %s up to %s', (raw, step) => {
    expect(niceStep125(raw)).toBeCloseTo(step, 12);
  });
});

describe('autoRange', () => {
  test('fits Vpp into six divisions and puts 0 V on a whole division', () => {
    expect(autoRange(Float64Array.from([-1, 1]))).toEqual({ perDiv: 0.5, position: 0 });
    // 0〜2 V の方形波: 500 mV/div、0 V の基準は中央から −2 目盛 (4 目盛の高さ)。
    expect(autoRange(Float64Array.from([0, 2]))).toEqual({ perDiv: 0.5, position: -2 });
  });

  test('gives dc a scale from its value', () => {
    expect(autoRange(Float64Array.from([5, 5]))).toEqual({ perDiv: 2, position: -3 });
    expect(autoRange(Float64Array.from([0, 0]))).toEqual({ perDiv: 1, position: 0 });
    expect(autoRange(new Float64Array())).toEqual({ perDiv: 1, position: 0 });
  });
});

describe('autoTimePerDiv', () => {
  test('shows two periods of the slowest wave in ten divisions', () => {
    expect(autoTimePerDiv([ch('square 100Hz 1V')])).toBeCloseTo(2e-3, 15);
    expect(autoTimePerDiv([ch('sine 1kHz 1V'), ch('sine 5kHz 1V')])).toBeCloseTo(200e-6, 15);
    expect(autoTimePerDiv([ch('dc 5V')])).toBe(1e-3);
    expect(autoTimePerDiv([])).toBe(1e-3);
  });
});

describe('fractionY', () => {
  test('maps volts to the height of the grid and pins the outside to the edges', () => {
    expect(fractionY(0, 0.5, -2)).toBe(0.25);
    expect(fractionY(2, 0.5, -2)).toBe(0.75);
    expect(fractionY(100, 0.5, 0)).toBe(1);
    expect(fractionY(-100, 0.5, 0)).toBe(0);
  });
});

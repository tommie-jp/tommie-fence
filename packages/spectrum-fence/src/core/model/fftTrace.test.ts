import { describe, expect, test } from 'vitest';
import type { WindowName } from 'fence-kit';
import { fftTrace, resolutionOf, sampleRate } from './fftTrace.ts';
import { nearestPoint, peakPoint } from './markers.ts';
import { wave } from './testWave.ts';

const trace = (text: string, window: WindowName, stop = 20e3, floor: number | null = null) =>
  fftTrace({ signal: [wave(text)], start: 0, stop, samples: 8192, window, floor });

describe('fftTrace — AD の 4-2 (Python で検算した値)', () => {
  test('samples at 2.56 × the stop, so 0–20 kHz with 8192 samples has bins of 6.25 Hz', () => {
    expect(sampleRate(20e3)).toBe(51.2e3);
    expect(resolutionOf(20e3, 8192)).toBe(6.25);
  });

  test('reads the odd harmonics of square 1kHz 1V at −0.91 / −10.45 / −14.89 / −17.81 dBV (hann)', () => {
    const points = trace('square 1kHz 1V', 'hann');
    const levels = [1e3, 3e3, 5e3, 7e3].map((f) => nearestPoint(points, f)?.level ?? NaN);
    [-0.91, -10.45, -14.89, -17.81].forEach((expected, index) => {
      expect(Math.abs((levels[index] ?? 0) - expected)).toBeLessThan(0.1);
    });
  });

  test('reads sine 1kHz 1V at −3.01 dBV, and keeps the bins inside the sweep', () => {
    const points = trace('sine 1kHz 1V', 'hann');
    expect(peakPoint(points)?.level).toBeCloseTo(-3.01, 2);
    expect(points[0]?.f).toBe(0);
    expect(points.at(-1)?.f).toBe(20e3);
    expect(points).toHaveLength(3201);
  });

  test('puts dc on the 0 Hz bin as its own value', () => {
    expect(trace('dc 1V', 'hann')[0]?.level).toBeCloseTo(0, 6);
  });

  test('stops at −200 dB and adds floor: as power', () => {
    const points = trace('sine 1kHz 1V', 'flattop', 20e3, -90);
    expect(Math.min(...points.map((point) => point.level))).toBeCloseTo(-90, 1);
    expect(Math.min(...trace('sine 1kHz 1V', 'rect').map((point) => point.level))).toBeGreaterThanOrEqual(-200);
  });
});

describe('fftTrace — AD の 4-3 (窓)', () => {
  // 1003.125 Hz は bin 160 と 161 のちょうど間 (6.25 Hz の半分ずれ)。
  const between = (window: WindowName) => trace('sine 1003.125Hz 1V', window);
  const error = (window: WindowName): number => Math.abs((peakPoint(between(window))?.level ?? 0) + 3.0103);
  const width = (window: WindowName): number => {
    const points = between(window);
    const top = peakPoint(points)?.level ?? 0;
    return points.filter((point) => point.level > top - 6).length;
  };

  test('misses the peak most with rect, less with hann, and not with flattop', () => {
    expect(error('rect')).toBeGreaterThan(error('hann'));
    expect(error('hann')).toBeGreaterThan(error('flattop'));
    expect(error('flattop')).toBeLessThan(0.05);
  });

  test('widens the peak the other way round', () => {
    expect(width('rect')).toBeLessThanOrEqual(width('hann'));
    expect(width('hann')).toBeLessThan(width('flattop'));
  });

  test('leaks far from the peak with rect, not with hann', () => {
    const far = (window: WindowName): number => nearestPoint(between(window), 2e3)?.level ?? 0;
    expect(far('rect')).toBeGreaterThan(far('hann') + 40);
  });
});

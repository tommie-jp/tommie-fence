import { describe, expect, test } from 'vitest';
import { DEVICES } from './device.ts';
import { nearestPoint, peakPoint } from './markers.ts';
import { floorOf } from './receiver.ts';
import { linesOfSignal } from './signal.ts';
import { sweptTrace } from './sweptTrace.ts';
import { wave } from './testWave.ts';

const ultra = DEVICES['tinysa-ultra'];

function swept(text: string, start: number, stop: number, points: number, rbw: number, atten = 0) {
  return sweptTrace({
    lines: linesOfSignal([wave(text)], stop + 5 * rbw, 4096).lines,
    start, stop, points, rbw, floor: floorOf(ultra, rbw, atten, false, null),
  });
}

describe('sweptTrace — 本の 11-4 (NanoVNA の出力)', () => {
  const trace = swept('square 100MHz -10dBm', 0, 960e6, 450, 300e3);

  test.each([
    [100e6, -7.9],
    [300e6, -17.44],
    [500e6, -21.88],
  ])('reads the harmonic at %d Hz as %d dBm, at the frequency of the line', (f, expected) => {
    const point = nearestPoint(trace, f);
    expect(Math.abs((point?.level ?? 0) - expected)).toBeLessThan(0.05);
    expect(point?.at).toBe(f);
  });

  test('sits on the floor between the harmonics (−92 dBm at RBW 300 kHz)', () => {
    expect(nearestPoint(trace, 200e6)?.level).toBeCloseTo(-92, 1);
  });

  test('has as many points as the sweep', () => {
    expect(trace).toHaveLength(450);
    expect(trace.at(-1)?.f).toBe(960e6);
  });
});

describe('sweptTrace — 11-2 と 11-3 (RBW とアッテネータ)', () => {
  test('reads sine 30MHz -40dBm at −40.00 dBm and the floor at 30.5 MHz at −112.0 dBm (RBW 3 kHz)', () => {
    const trace = swept('sine 30MHz -40dBm', 29e6, 31e6, 101, 3e3);
    expect(peakPoint(trace)).toMatchObject({ at: 30e6 });
    expect(peakPoint(trace)?.level).toBeCloseTo(-40, 6);
    expect(nearestPoint(trace, 30.5e6)?.level).toBeCloseTo(-112, 6);
  });

  test('raises only the floor with atten: 20dB', () => {
    const trace = swept('sine 30MHz -40dBm', 29e6, 31e6, 101, 3e3, 20);
    expect(peakPoint(trace)?.level).toBeCloseTo(-40, 3);
    expect(nearestPoint(trace, 30.5e6)?.level).toBeCloseTo(-92, 6);
  });

  test('keeps a line that falls between two points (the point takes the peak in its cell)', () => {
    const trace = swept('sine 30.007MHz -40dBm', 29e6, 31e6, 101, 3e3);
    expect(peakPoint(trace)?.level).toBeCloseTo(-40, 6);
    expect(peakPoint(trace)?.at).toBe(30.007e6);
  });

  test('draws only the floor without a signal', () => {
    const trace = sweptTrace({ lines: [], start: 0, stop: 1e6, points: 51, rbw: 30e3, floor: -102 });
    expect(new Set(trace.map((point) => point.level))).toEqual(new Set([-102]));
  });
});

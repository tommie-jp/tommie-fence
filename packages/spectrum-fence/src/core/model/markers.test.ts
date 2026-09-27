import { describe, expect, test } from 'vitest';
import { markerPoint, nearestPoint, peakPoint, readMarkers } from './markers.ts';

const points = [
  { f: 0, level: -90, at: 0 },
  { f: 1e6, level: -10, at: 1.0004e6 },
  { f: 2e6, level: -30, at: 2e6 },
];

describe('markers', () => {
  test('snaps a frequency to the nearest point, and finds the peak', () => {
    expect(nearestPoint(points, 1.4e6)?.f).toBe(1e6);
    expect(peakPoint(points)?.f).toBe(1e6);
    expect(markerPoint({ kind: 'f', f: 1.9e6, line: null }, points)?.f).toBe(2e6);
    expect(nearestPoint([], 1)).toBeNull();
  });

  test('writes the table the way the instrument does, at the frequency of the line', () => {
    const readings = readMarkers([{ kind: 'peak', line: 1 }, { kind: 'f', f: 2e6, line: 2 }], points, 'dBm', 'model');
    expect(readings.rows).toEqual([
      ['M', '周波数', 'レベル'],
      ['1', '1.000 MHz', '−10.00 dBm'],
      ['2', '2.000 MHz', '−30.00 dBm'],
    ]);
  });

  test('writes dashes when there is nothing to read, and nothing without markers', () => {
    expect(readMarkers([{ kind: 'peak', line: 1 }], [], 'dBV', null).rows[1]).toEqual(['1', '—', '—']);
    expect(readMarkers([], points, 'dBV', 'model').rows).toEqual([]);
  });
});

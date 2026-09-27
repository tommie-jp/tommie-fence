import { describe, expect, test } from 'vitest';
import { readingsOf, valueAtTime } from './readings.ts';
import type { Trace } from './readings.ts';

const trace = (name: Trace['name'], f: (t: number) => number, basis: Trace['basis'] = 'model'): Trace => {
  const dt = 10e-3 / 8191;
  return { name, samples: Float64Array.from({ length: 8192 }, (_, i) => f(-5e-3 + i * dt)), dt, t0: -5e-3, basis };
};

describe('valueAtTime', () => {
  test('interpolates between points and gives null outside', () => {
    const one = { samples: Float64Array.from([0, 2]), dt: 1, t0: 0 };
    expect(valueAtTime(one, 0.25)).toBe(0.5);
    expect(valueAtTime(one, 1)).toBe(2);
    expect(valueAtTime(one, 1.5)).toBeNull();
  });
});

describe('readingsOf', () => {
  const sine = (t: number): number => Math.sin(2 * Math.PI * 1000 * t);
  const late = (t: number): number => 0.5 * Math.sin(2 * Math.PI * 1000 * t - Math.PI / 2);

  test('makes a measurement table, one row a channel, and dashes for what cannot be measured', () => {
    const readings = readingsOf({ traces: [trace('ch1', sine), trace('ch2', late)], cursors: [], measures: ['vpp', 'freq', 'phase'] });
    expect(readings.measureRows).toEqual([
      ['CH', 'Vpp', 'Freq', 'Phase'],
      ['CH1', '2.00 V', '1.000 kHz', '—'],
      ['CH2', '1.00 V', '1.000 kHz', '-90.0°'],
    ]);
    expect(readings.cursorRows).toEqual([]);
    expect(readings.basis).toBe('model');
  });

  test('makes a cursor table with X1, X2 and the difference', () => {
    const readings = readingsOf({ traces: [trace('ch1', (t) => t * 1000)], cursors: [0, 1e-3], measures: [] });
    expect(readings.measureRows).toEqual([]);
    expect(readings.cursorRows).toEqual([
      ['', 't', 'CH1'],
      ['X1', '0 s', '0 V'],
      ['X2', '1.000 ms', '1.00 V'],
      ['ΔX', '1.000 ms (1.000 kHz)', '1.00 V'],
    ]);
  });

  test('says which channels are measured and which are ideal when both are there', () => {
    const readings = readingsOf({ traces: [trace('ch1', sine, 'data'), trace('ch2', late)], cursors: [0], measures: ['vpp'] });
    expect(readings.basis).toBe('mixed');
    expect(readings.idealNames).toEqual(['ch2']);
    expect(readings.cursorRows).toHaveLength(2);
  });
});

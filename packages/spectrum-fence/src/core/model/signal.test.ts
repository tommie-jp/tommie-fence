import { describe, expect, test } from 'vitest';
import { linesOfSignal, peakOf, sampleSignal } from './signal.ts';
import { wave } from './testWave.ts';

describe('signal', () => {
  test('adds lines of the same frequency by power, and dc by voltage', () => {
    const { lines } = linesOfSignal([wave('sine 1MHz 1V offset 1V'), wave('sine 1MHz 1V'), wave('dc 0.5V')], 10e6, 100);
    expect(lines).toEqual([{ frequency: 0, amplitude: 1.5 }, { frequency: 1e6, amplitude: Math.SQRT2 }]);
  });

  test('says when the lines were cut at the limit', () => {
    expect(linesOfSignal([wave('sawtooth 1kHz 1V')], 1e9, 10).truncated).toBe(true);
  });

  test('sums the waves in time', () => {
    expect(sampleSignal([wave('dc 1V'), wave('dc 2V')], 0)).toBe(3);
    expect(peakOf([wave('sine 1kHz 1V offset 2V'), wave('dc -1V')])).toBe(4);
  });
});

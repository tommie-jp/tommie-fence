import { describe, expect, test } from 'vitest';
import { DEVICES } from './device.ts';
import { fftTrace } from './fftTrace.ts';
import { dbmFromDbv } from './level.ts';
import { nearestPoint } from './markers.ts';
import { floorOf } from './receiver.ts';
import { linesOfSignal } from './signal.ts';
import { sweptTrace } from './sweptTrace.ts';
import { wave } from './testWave.ts';

/**
 * **2 つの道の突き合わせ** (52 の docs/88 §9 のリスク 1)。同じ `square 1MHz -10dBm` を
 * FFT 型 (ad3、0〜20 MHz) と掃引型 (tinysa、0〜20 MHz、RBW 3 kHz) で描き、1・3・5 次の
 * マーカーが dBm で ±0.2 dB に揃うこと。揃わなければ 11-5 の「並べて見せる」が嘘になる。
 */
describe('the FFT path and the swept path agree', () => {
  const signal = [wave('square 1MHz -10dBm')];
  const fft = fftTrace({ signal, start: 0, stop: 20e6, samples: 8192, window: 'hann', floor: null })
    .map((point) => ({ ...point, level: dbmFromDbv(point.level) }));
  const rbw = 3e3;
  const swept = sweptTrace({
    lines: linesOfSignal(signal, 20e6 + 5 * rbw, 4096).lines,
    start: 0, stop: 20e6, points: 290, rbw, floor: floorOf(DEVICES.tinysa, rbw, 0, false, null),
  });

  test.each([
    [1e6, -7.9],
    [3e6, -17.44],
    [5e6, -21.88],
  ])('at %d Hz both read %d dBm within 0.2 dB', (f, expected) => {
    const a = nearestPoint(fft, f);
    const b = nearestPoint(swept, f);
    expect(a?.level).toBeCloseTo(expected, 1);
    expect(b?.level).toBeCloseTo(expected, 1);
    expect(Math.abs((a?.level ?? 0) - (b?.level ?? 0))).toBeLessThan(0.2);
  });
});

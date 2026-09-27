import { fftArrays, windowOf } from 'fence-kit';
import type { WindowName } from 'fence-kit';
import { LEVEL_FLOOR, dbvFromPeak, powerSum } from './level.ts';
import { sampleSignal } from './signal.ts';
import type { Signal } from './signal.ts';
import type { Point } from './trace.ts';

/**
 * FFT 型 (Analog Discovery の Spectrum)。**波を標本化 → 窓 → FFT → bin ごとの dBV (rms)**。
 * 窓の利得は窓の和 (coherent gain) で割り戻すので、bin に乗った正弦は窓によらず同じ値。
 */

/** 標本化の速さ = 掃引の終わり × 2.56 (帯域の 1.28 倍の Nyquist。WaveForms の規則は要確認)。 */
export const RATE_OVER_STOP = 2.56;

export const sampleRate = (stop: number): number => stop * RATE_OVER_STOP;

/** bin の幅 (分解能)。 */
export const resolutionOf = (stop: number, samples: number): number => sampleRate(stop) / samples;

export type FftInput = {
  readonly signal: Signal;
  readonly start: number;
  readonly stop: number;
  readonly samples: number;
  readonly window: WindowName;
  /** `floor:` (dBV)。書かれていれば bin ごとに電力で足す。 */
  readonly floor: number | null;
};

/** 掃引の中の bin だけを、dBV で返す。**−200 dB で頭打ち**。 */
export function fftTrace(input: FftInput): readonly Point[] {
  const { signal, start, stop, samples, window, floor } = input;
  const fs = sampleRate(stop);
  const weights = windowOf(window, samples);
  const gain = weights.reduce((sum, weight) => sum + weight, 0);
  const windowed = new Float64Array(samples);
  for (let index = 0; index < samples; index += 1) windowed[index] = sampleSignal(signal, index / fs) * (weights[index] ?? 0);
  const { re, im } = fftArrays(windowed, new Float64Array(samples), 'forward');
  const df = fs / samples;
  const first = Math.max(0, Math.ceil(start / df - 1e-9));
  const last = Math.min(samples / 2, Math.floor(stop / df + 1e-9));
  const points: Point[] = [];
  for (let bin = first; bin <= last; bin += 1) {
    const magnitude = Math.hypot(re[bin] ?? 0, im[bin] ?? 0) / gain;
    // 0 Hz は直流の値そのもの (rms も同じ)、ほかは片側に畳んで peak → rms。
    const level = bin === 0 ? (magnitude > 0 ? Math.max(LEVEL_FLOOR, 20 * Math.log10(magnitude)) : LEVEL_FLOOR) : dbvFromPeak(2 * magnitude);
    const f = bin * df;
    points.push({ f, level: floor === null ? level : powerSum([level, floor]), at: f });
  }
  return points;
}

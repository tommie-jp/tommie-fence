import { fftArrays, windowOf } from 'fence-kit';
import type { WindowName } from 'fence-kit';
import { LEVEL_FLOOR, dbvFromPeak, powerSum } from './level.ts';
import { linesOfSignal } from './signal.ts';
import type { Signal } from './signal.ts';
import type { Point } from './trace.ts';

/**
 * FFT 型 (Analog Discovery の Spectrum)。**波を標本化 → 窓 → FFT → bin ごとの dBV (rms)**。
 * 窓の利得は窓の和 (coherent gain) で割り戻すので、bin に乗った正弦は窓によらず同じ値。
 *
 * **標本は Nyquist より下の線から組み立てる** (帯域を制限した波)。理想の方形波をそのまま
 * 標本化すると、上の高調波が折り返して山の間に偽の線が立つ — 実機は速い ADC の値を平均して
 * 間引くので、折り返しはほとんど見えない。線は fence-kit の `linesOf` (`sampleWave` の
 * Fourier 級数と一致することを fence-kit が試験で縛っている)。
 */

/** 標本化の速さ = 掃引の終わり × 2.56 (帯域の 1.28 倍の Nyquist。WaveForms の規則は要確認)。 */
export const RATE_OVER_STOP = 2.56;

export const sampleRate = (stop: number): number => stop * RATE_OVER_STOP;

/** bin の幅 (分解能)。 */
export const resolutionOf = (stop: number, samples: number): number => sampleRate(stop) / samples;

/** 組み立ての手間の上限 (線の数 × 標本の数)。超える線は落として言う。 */
export const SYNTH_BUDGET = 2 ** 26;
/** 漸化式の cos を、この点数ごとに Math.cos で置き直す (誤差を溜めない)。 */
const REANCHOR = 1024;

/** 線の和を標本化する (cos の漸化式。位相は 0 に揃える — 画面は電力しか見ない)。 */
function synthesize(lines: readonly { readonly frequency: number; readonly amplitude: number }[], fs: number, samples: number): Float64Array {
  const out = new Float64Array(samples);
  for (const line of lines) {
    if (line.frequency === 0) {
      for (let index = 0; index < samples; index += 1) out[index] = (out[index] ?? 0) + line.amplitude;
      continue;
    }
    const w = (2 * Math.PI * line.frequency) / fs;
    const [cw, sw] = [Math.cos(w), Math.sin(w)];
    let [c, s] = [1, 0];
    for (let index = 0; index < samples; index += 1) {
      if (index % REANCHOR === 0) [c, s] = [Math.cos(w * index), Math.sin(w * index)];
      out[index] = (out[index] ?? 0) + line.amplitude * c;
      [c, s] = [c * cw - s * sw, s * cw + c * sw];
    }
  }
  return out;
}

export type FftInput = {
  readonly signal: Signal;
  readonly start: number;
  readonly stop: number;
  readonly samples: number;
  readonly window: WindowName;
  /** `floor:` (dBV)。書かれていれば bin ごとに電力で足す。 */
  readonly floor: number | null;
};

export type FftResult = { readonly points: readonly Point[]; readonly truncated: boolean };

/** 掃引の中の bin だけを、dBV で返す。**−200 dB で頭打ち**。 */
export function fftTrace(input: FftInput): FftResult {
  const { signal, start, stop, samples, window, floor } = input;
  const fs = sampleRate(stop);
  const weights = windowOf(window, samples);
  const gain = weights.reduce((sum, weight) => sum + weight, 0);
  const read = linesOfSignal(signal, (fs / 2) * (1 - 1e-12), Math.floor(SYNTH_BUDGET / samples));
  const windowed = synthesize(read.lines, fs, samples);
  for (let index = 0; index < samples; index += 1) windowed[index] = (windowed[index] ?? 0) * (weights[index] ?? 0);
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
  return { points, truncated: read.truncated };
}

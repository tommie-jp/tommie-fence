import { fft, kaiser, nextPowerOfTwo } from 'fence-kit';
import type { Complex } from './complex.ts';

/**
 * TDR — S11 を時間 (距離) に直す。**帯域通過のインパルス応答**の大きさを出す。
 * 反射した**場所**は分かるが、開放と短絡の見分け (段差の向き) は出ない。
 * 低域通過のステップ (DC から等間隔の掃引が要る) は持たない (52 の docs/76)。
 *
 * 手順は実機 (NanoVNA-D の transform) と同じ形: 窓を掛け、零を詰めて逆 FFT。
 * **窓は Kaiser (β = 6、実機の normal)**、点数は 2 の冪 (1024 以上)。FFT と窓は fence-kit の
 * `dsp.ts` (spectrum と共用)。
 */

/** 光の速さ (m/s)。 */
const C0 = 299_792_458;
const KAISER_BETA = 6;
const MIN_FFT = 1024;

export type TdrPoint = { readonly t: number; readonly distance: number; readonly value: number };

export type Tdr = {
  readonly points: readonly TdrPoint[];
  /** 見える範囲 (m)。これより遠い反射は手前に折り返す。 */
  readonly range: number;
  readonly peak: TdrPoint | null;
};

/**
 * 等間隔の S11 → TDR。`vf` は距離に直すための速度係数 (往復なので 2 で割る)。
 * 値は窓の重みの和で割って、**全反射 (|Γ| = 1) の山が 1 に近くなる**ようにする。
 */
export function tdrOf(frequencies: readonly number[], s11: readonly Complex[], vf: number): Tdr | null {
  if (frequencies.length < 2 || s11.length !== frequencies.length) return null;
  const df = (frequencies.at(-1)! - frequencies[0]!) / (frequencies.length - 1);
  if (!(df > 0)) return null;
  const window = kaiser(s11.length, KAISER_BETA);
  const gain = window.reduce((sum, weight) => sum + weight, 0);
  const n = Math.max(MIN_FFT, nextPowerOfTwo(s11.length));
  const padded = Array.from({ length: n }, (_, index) => {
    const value = s11[index];
    const weight = window[index] ?? 0;
    return value === undefined ? { re: 0, im: 0 } : { re: value.re * weight, im: value.im * weight };
  });
  const impulse = fft(padded, 'inverse');
  const dt = 1 / (n * df);
  const points = impulse.map((value, index): TdrPoint => {
    const t = index * dt;
    return { t, distance: (t * C0 * vf) / 2, value: (Math.hypot(value.re, value.im) * n) / gain };
  });
  const peak = points.reduce<TdrPoint | null>((best, point) => (best === null || point.value > best.value ? point : best), null);
  return { points, range: ((1 / df) * C0 * vf) / 2, peak };
}

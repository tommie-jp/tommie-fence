import type { Complex } from './complex.ts';

/**
 * TDR — S11 を時間 (距離) に直す。**帯域通過のインパルス応答**の大きさを出す。
 * 反射した**場所**は分かるが、開放と短絡の見分け (段差の向き) は出ない。
 * 低域通過のステップ (DC から等間隔の掃引が要る) は持たない (52 の docs/76)。
 *
 * 手順は実機 (NanoVNA-D の transform) と同じ形: 窓を掛け、零を詰めて逆 FFT。
 * **窓は Kaiser (β = 6、実機の normal)**、点数は 2 の冪 (1024 以上)。
 */

/** 光の速さ (m/s)。 */
const C0 = 299_792_458;
const KAISER_BETA = 6;
const MIN_FFT = 1024;

/** 第 1 種変形ベッセル関数 I0 (級数)。 */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k += 1) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < sum * 1e-12) break;
  }
  return sum;
}

/** Kaiser 窓の重み (n 点)。 */
export function kaiser(n: number, beta = KAISER_BETA): readonly number[] {
  if (n === 1) return [1];
  const scale = besselI0(beta);
  return Array.from({ length: n }, (_, index) => {
    const r = (2 * index) / (n - 1) - 1;
    return besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / scale;
  });
}

const nextPowerOfTwo = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/**
 * 逆 FFT (基数 2)。**作業用の配列は関数の中だけで書き換える** — 外へは新しい
 * 配列として返す (入力には触らない)。
 */
export function inverseFft(input: readonly Complex[]): readonly Complex[] {
  const n = input.length;
  const re = Float64Array.from(input, (value) => value.re);
  const im = Float64Array.from(input, (value) => value.im);
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (2 * Math.PI) / size; // 逆変換なので +
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k += 1) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const ti = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - tr;
        im[b] = (im[a] ?? 0) - ti;
        re[a] = (re[a] ?? 0) + tr;
        im[a] = (im[a] ?? 0) + ti;
      }
    }
  }
  return Array.from({ length: n }, (_, index) => ({ re: (re[index] ?? 0) / n, im: (im[index] ?? 0) / n }));
}

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
  const window = kaiser(s11.length);
  const gain = window.reduce((sum, weight) => sum + weight, 0);
  const n = Math.max(MIN_FFT, nextPowerOfTwo(s11.length));
  const padded = Array.from({ length: n }, (_, index) => {
    const value = s11[index];
    const weight = window[index] ?? 0;
    return value === undefined ? { re: 0, im: 0 } : { re: value.re * weight, im: value.im * weight };
  });
  const impulse = inverseFft(padded);
  const dt = 1 / (n * df);
  const points = impulse.map((value, index): TdrPoint => {
    const t = index * dt;
    return { t, distance: (t * C0 * vf) / 2, value: (Math.hypot(value.re, value.im) * n) / gain };
  });
  const peak = points.reduce<TdrPoint | null>((best, point) => (best === null || point.value > best.value ? point : best), null);
  return { points, range: ((1 / df) * C0 * vf) / 2, peak };
}

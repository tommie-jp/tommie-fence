/**
 * FFT と窓。**使い手は vna (TDR の逆 FFT と Kaiser 窓) と spectrum (FFT 型の計器の
 * 順 FFT と Hann・Flat-top 窓)** の 2 つ (52 の docs/88 §4.6)。vna が持っていた物を、
 * 向きを引数にして引き上げた。**vna の図がバイト単位で変わらない**ことを確かめてある
 * (演算の順を変えていない)。
 */

export type Complex = { readonly re: number; readonly im: number };

/** 変換の向き。`inverse` は 1/n を掛けて返す (vna の TDR と同じ)。 */
export type FftDirection = 'forward' | 'inverse';

/**
 * FFT (基数 2) を 2 本の実数の列で。**入力には触らない** — 写した列を関数の中だけで
 * 書き換えて返す。長さは 2 の冪であること (呼ぶ側が詰める)。
 */
export function fftArrays(
  real: ArrayLike<number>,
  imag: ArrayLike<number>,
  direction: FftDirection,
): { readonly re: Float64Array; readonly im: Float64Array } {
  const n = real.length;
  const re = Float64Array.from(real);
  const im = Float64Array.from(imag);
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  const sign = direction === 'inverse' ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (sign * 2 * Math.PI) / size;
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
  if (direction === 'inverse') {
    for (let index = 0; index < n; index += 1) {
      re[index] = (re[index] ?? 0) / n;
      im[index] = (im[index] ?? 0) / n;
    }
  }
  return { re, im };
}

/** FFT (基数 2) を複素数の列で。`inverse` は 1/n を掛ける。 */
export function fft(input: readonly Complex[], direction: FftDirection): readonly Complex[] {
  const { re, im } = fftArrays(input.map((value) => value.re), input.map((value) => value.im), direction);
  return Array.from({ length: re.length }, (_, index) => ({ re: re[index] ?? 0, im: im[index] ?? 0 }));
}

/** 2 の冪のうち n 以上の最小。 */
export const nextPowerOfTwo = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

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

/** Kaiser 窓の重み (n 点、両端を含む対称形)。vna の TDR が β = 6 で使う。 */
export function kaiser(n: number, beta: number): readonly number[] {
  if (n === 1) return [1];
  const scale = besselI0(beta);
  return Array.from({ length: n }, (_, index) => {
    const r = (2 * index) / (n - 1) - 1;
    return besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / scale;
  });
}

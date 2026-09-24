/**
 * 複素数。**依存を足さない** — 使うのは四則と絶対値と偏角だけで、
 * ライブラリを入れると core の実行時の依存が増える (`purity.test.ts`)。
 */
export type Complex = { readonly re: number; readonly im: number };

export const complex = (re: number, im = 0): Complex => ({ re, im });
export const ZERO: Complex = complex(0);
export const ONE: Complex = complex(1);

export const add = (a: Complex, b: Complex): Complex => complex(a.re + b.re, a.im + b.im);
export const sub = (a: Complex, b: Complex): Complex => complex(a.re - b.re, a.im - b.im);
export const mul = (a: Complex, b: Complex): Complex =>
  complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const scale = (a: Complex, k: number): Complex => complex(a.re * k, a.im * k);

/** 割り算。**0 で割ると成分が Infinity / NaN になる** — 呼ぶ側が値を頭打ちにする。 */
export function div(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return complex((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

export const abs = (a: Complex): number => Math.hypot(a.re, a.im);
/** 偏角 (ラジアン、−π〜π)。 */
export const arg = (a: Complex): number => Math.atan2(a.im, a.re);
export const polar = (magnitude: number, angle: number): Complex =>
  complex(magnitude * Math.cos(angle), magnitude * Math.sin(angle));
export const inverse = (a: Complex): Complex => div(ONE, a);
export const isFiniteComplex = (a: Complex): boolean => Number.isFinite(a.re) && Number.isFinite(a.im);

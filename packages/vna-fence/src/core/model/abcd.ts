import { ONE, ZERO, add, complex, div, mul, scale, sub } from './complex.ts';
import type { Complex } from './complex.ts';

/**
 * 2 端子対の ABCD 行列 (F 行列)。**縦続は掛け算**なので、梯子の模型を
 * 書いた順に掛けるだけで済む。S への直し方は Pozar の表のとおり。
 */
export type Abcd = readonly [a: Complex, b: Complex, c: Complex, d: Complex];

/** 測る系のインピーダンス。NanoVNA は 50 Ω。 */
export const Z0 = 50;

export const IDENTITY: Abcd = [ONE, ZERO, ZERO, ONE];

/** 直列に入った Z。 */
export const seriesZ = (z: Complex): Abcd => [ONE, z, ZERO, ONE];

/** 並列 (シャント) に入った Y。 */
export const shuntY = (y: Complex): Abcd => [ONE, ZERO, y, ONE];

/** 伝送線路 (損失なし)。θ は電気長 (ラジアン)。 */
export const lineAbcd = (z0: number, theta: number): Abcd => [
  complex(Math.cos(theta)),
  complex(0, z0 * Math.sin(theta)),
  complex(0, Math.sin(theta) / z0),
  complex(Math.cos(theta)),
];

export function multiply(left: Abcd, right: Abcd): Abcd {
  const [a, b, c, d] = left;
  const [e, f, g, h] = right;
  return [add(mul(a, e), mul(b, g)), add(mul(a, f), mul(b, h)), add(mul(c, e), mul(d, g)), add(mul(c, f), mul(d, h))];
}

/** 書いた順に縦続する (CH0 の側が先)。 */
export const cascade = (matrices: readonly Abcd[]): Abcd => matrices.reduce(multiply, IDENTITY);

/** 4 つの S。 */
export type SQuad = { readonly s11: Complex; readonly s21: Complex; readonly s12: Complex; readonly s22: Complex };

/** ABCD → S (両端とも z0 で終端)。 */
export function abcdToS([a, b, c, d]: Abcd, z0 = Z0): SQuad {
  const bz = scale(b, 1 / z0);
  const cz = scale(c, z0);
  const den = add(add(a, bz), add(cz, d));
  const det = sub(mul(a, d), mul(b, c));
  return {
    s11: div(sub(add(a, bz), add(cz, d)), den),
    s21: div(complex(2), den),
    s12: div(scale(det, 2), den),
    s22: div(sub(add(bz, d), add(a, cz)), den),
  };
}

/**
 * 先を開放・短絡した 1 端子の反射係数。**Zin を経ずに Γ を出す** — 直列の素子
 * だけを開放すると Zin は無限大になり、割り算が壊れる。
 */
export function terminatedGamma([a, b, c, d]: Abcd, end: 'open' | 'short', z0 = Z0): Complex {
  return end === 'open'
    ? div(sub(a, scale(c, z0)), add(a, scale(c, z0)))
    : div(sub(b, scale(d, z0)), add(b, scale(d, z0)));
}

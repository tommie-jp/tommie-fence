import { Z0 } from './abcd.ts';
import { ONE, abs, add, arg, div, sub } from './complex.ts';
import type { Complex } from './complex.ts';

/**
 * S パラメータの列と、NanoVNA の形式 (LOGMAG・PHASE・SWR…) への直し方。
 * **値が壊れる所 (log の −∞、Γ = 1 の Z) はここで頭を打たせる** — SVG に
 * `Infinity` や `NaN` を書かないため。
 */
export type SPoint = {
  readonly f: number;
  readonly s11: Complex | null;
  readonly s21: Complex | null;
  readonly s12: Complex | null;
  readonly s22: Complex | null;
};

export type Param = 'S11' | 'S21';

export const valueOf = (point: SPoint, param: Param): Complex | null => (param === 'S11' ? point.s11 : point.s21);

/** dB の下限。|S| = 0 (理想のスルーの S11) を −∞ にしない。 */
export const DB_FLOOR = -200;
/** SWR の上限 (|Γ| ≥ 1 は 100 とする)。 */
export const SWR_CEILING = 100;
/** Ω の上限 (Γ = 1 の開放)。 */
export const OHM_CEILING = 1e9;

export function logMag(s: Complex): number {
  const size = abs(s);
  return size === 0 ? DB_FLOOR : Math.max(DB_FLOOR, 20 * Math.log10(size));
}

/** 位相 (度、−180〜180)。 */
export const phaseDeg = (s: Complex): number => (arg(s) * 180) / Math.PI;

export function swr(gamma: Complex): number {
  const size = abs(gamma);
  if (size >= 1) return SWR_CEILING;
  return Math.min(SWR_CEILING, (1 + size) / (1 - size));
}

const clampOhm = (value: number): number => Math.max(-OHM_CEILING, Math.min(OHM_CEILING, value));

/** 反射係数 → インピーダンス。**Γ = 1 (開放) は上限の実数**にする。 */
export function impedanceFrom(gamma: Complex, z0 = Z0): Complex {
  const den = sub(ONE, gamma);
  if (abs(den) < 1e-12) return { re: OHM_CEILING, im: 0 };
  const z = div(add(ONE, gamma), den);
  return { re: clampOhm(z.re * z0), im: clampOhm(z.im * z0) };
}

/** 位相を連続にする (±180° の跳びを外す)。 */
function unwrap(phases: readonly number[]): readonly number[] {
  let offset = 0;
  return phases.map((phase, index) => {
    if (index > 0) {
      const step = phase - (phases[index - 1] ?? 0);
      if (step > Math.PI) offset -= 2 * Math.PI;
      else if (step < -Math.PI) offset += 2 * Math.PI;
    }
    return phase + offset;
  });
}

/**
 * 群遅延 (秒)。−dφ/dω を隣の点との差で出す (両端は片側、中は両側)。
 * **値の無い点は null** — その前後で差を取らない。
 */
export function groupDelay(points: readonly SPoint[], param: Param): readonly (number | null)[] {
  const values = points.map((point) => valueOf(point, param));
  if (values.some((value) => value === null) || points.length < 2) return points.map(() => null);
  const phases = unwrap(values.map((value) => arg(value as Complex)));
  return points.map((_, index) => {
    const before = Math.max(0, index - 1);
    const after = Math.min(points.length - 1, index + 1);
    const df = (points[after]?.f ?? 0) - (points[before]?.f ?? 0);
    if (df === 0) return null;
    return -((phases[after] ?? 0) - (phases[before] ?? 0)) / (2 * Math.PI * df);
  });
}

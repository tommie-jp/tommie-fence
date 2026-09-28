/**
 * 画面の横軸。**格子は 10 × 8 目盛** (実機と同じ)、t = 0 (トリガの位置) は既定で画面の中央
 * (WaveForms の既定 Trigger position 0 s)。`trigger: … at -5div` で左右に動かす (左端 −5、右端 +5)。
 */
export const DIVISIONS = { x: 10, y: 8 } as const;

export type Screen = {
  /** time/div (s)。 */
  readonly perDiv: number;
  /** 画面の幅 (s) = 10 目盛。 */
  readonly span: number;
  /** 画面 1 枚の点数。 */
  readonly samples: number;
  /** 左端の時刻 (s) = −span / 2 − position × perDiv (position はトリガの位置の目盛)。 */
  readonly left: number;
  /** 点の間隔 (s)。両端の点を含めて `samples` 点。 */
  readonly dt: number;
};

export function screenOf(perDiv: number, samples: number, position = 0): Screen {
  const span = perDiv * DIVISIONS.x;
  return { perDiv, span, samples, left: -span / 2 - position * perDiv, dt: span / (samples - 1) };
}

/** 同じ画面を t = 0 が中央に来るように置き直す (トリガを探す窓)。 */
export const centredOf = (screen: Screen): Screen => ({ ...screen, left: -screen.span / 2 });

/** 画面の点の時刻。 */
export const timesOf = (screen: Screen): readonly number[] =>
  Array.from({ length: screen.samples }, (_, index) => screen.left + index * screen.dt);

export type TriggerEdge = 'rising' | 'falling';

/** 列の最大と最小。空なら null。 */
export function extentOf(samples: ArrayLike<number>): { readonly min: number; readonly max: number } | null {
  if (samples.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * トリガの時刻。水準 (null なら max と min の中央) を `edge` の向きに横切る点のうち、
 * **画面の中央 (t = 0) に一番近い**時刻 (直線補間)。同じ距離なら左を採る。
 * 水準が波形の外なら null (呼ぶ側が「トリガ水準が波形の外」と言い、t = 0 は動かさない)。
 */
export function findTrigger(samples: ArrayLike<number>, screen: Screen, edge: TriggerEdge, level: number | null): number | null {
  const extent = extentOf(samples);
  if (extent === null || extent.max === extent.min) return null;
  const at = level ?? (extent.max + extent.min) / 2;
  if (at <= extent.min || at >= extent.max) return null;
  let best: number | null = null;
  const tolerance = screen.dt * 1e-6;
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1] ?? 0;
    const b = samples[index] ?? 0;
    const crosses = edge === 'rising' ? a < at && b >= at : a > at && b <= at;
    if (!crosses) continue;
    const t = screen.left + (index - 1 + (at - a) / (b - a)) * screen.dt;
    if (best === null || Math.abs(t) < Math.abs(best) - tolerance) best = t;
  }
  return best;
}

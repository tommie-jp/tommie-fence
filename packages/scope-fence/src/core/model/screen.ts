/**
 * 画面の横軸。**格子は 10 × 8 目盛** (実機と同じ)、t = 0 (トリガの位置) は画面の中央
 * (WaveForms の既定 Trigger position 0 s)。
 */
export const DIVISIONS = { x: 10, y: 8 } as const;

export type Screen = {
  /** time/div (s)。 */
  readonly perDiv: number;
  /** 画面の幅 (s) = 10 目盛。 */
  readonly span: number;
  /** 画面 1 枚の点数。 */
  readonly samples: number;
  /** 左端の時刻 (s) = −span / 2。 */
  readonly left: number;
  /** 点の間隔 (s)。両端の点を含めて `samples` 点。 */
  readonly dt: number;
};

export function screenOf(perDiv: number, samples: number): Screen {
  const span = perDiv * DIVISIONS.x;
  return { perDiv, span, samples, left: -span / 2, dt: span / (samples - 1) };
}

/** 画面の点の時刻。 */
export const timesOf = (screen: Screen): readonly number[] =>
  Array.from({ length: screen.samples }, (_, index) => screen.left + index * screen.dt);

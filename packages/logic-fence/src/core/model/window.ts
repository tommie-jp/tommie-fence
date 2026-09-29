import { LIMITS } from '../limits.ts';

/**
 * 時間軸の窓。**目盛は 10 で固定** (WaveForms の Logic と同じ)。窓は `[t0, t1]`、
 * 1 目盛は `perDiv`。左端 `t0` は `start:` (書かなければ 0)。
 */
export type Window = { readonly t0: number; readonly perDiv: number; readonly t1: number };

export const windowOf = (t0: number, perDiv: number): Window => ({ t0, perDiv, t1: t0 + perDiv * LIMITS.divisions });

/**
 * 画面の寸法のうち、**読みやすさの検査に効くもの** (描く側の `layout` と同じ数を使う)。
 * 1 目盛 60 px → 窓は 600 px。**変わり目が 3 px より近いレーンは線でなく塗りで描く**
 * (線が潰れて見分けられない — 標本化の折り返しに見える)。
 */
export const PLOT = { divPx: 60, minGapPx: 3 } as const;

/** 3 px に当たる時間 (s)。これより近い変わり目は塗りにする。 */
export const minGapSeconds = (window: Window): number => (window.perDiv / PLOT.divPx) * PLOT.minGapPx;

/** 窓の中か (端を含む。浮動小数の誤差を窓の幅の 1e-9 だけ許す)。 */
export const inWindow = (window: Window, t: number): boolean => {
  const slack = (window.t1 - window.t0) * 1e-9;
  return t >= window.t0 - slack && t <= window.t1 + slack;
};

/** 窓の中の時刻を x (px、左端 0) に。 */
export const xOf = (window: Window, t: number): number => ((t - window.t0) / (window.t1 - window.t0)) * PLOT.divPx * LIMITS.divisions;

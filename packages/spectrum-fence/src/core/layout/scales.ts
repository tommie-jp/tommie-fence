import { formatHertzShort } from 'fence-kit';
import type { LevelUnit } from '../model/device.ts';
import { formatTick } from '../model/level.ts';
import { DIVISIONS } from './screen.ts';
import type { Rect } from './screen.ts';

/**
 * 目盛。**横は線形** (両端と中央に字)、**縦は ref が上端、scale × 10 で下端** (tinySA の
 * REF LEVEL と SCALE/DIV)。描く値は格子の縁に寄せる (SVG に NaN も格子の外も出さない)。
 */
export type Axes = {
  readonly start: number;
  readonly stop: number;
  /** 上端 (表示の単位で)。 */
  readonly ref: number;
  /** 目盛 1 つの dB。 */
  readonly scale: number;
  readonly unit: LevelUnit;
};

/** 縦軸の字 (上端から下端へ 11 個)。 */
export const levelTicks = (axes: Axes): readonly string[] =>
  Array.from({ length: DIVISIONS.y + 1 }, (_, index) => formatTick(axes.ref - index * axes.scale));

/** 横軸の字 (左端・中央・右端)。 */
export const frequencyTicks = (axes: Axes): readonly [string, string, string] =>
  [formatHertzShort(axes.start), formatHertzShort((axes.start + axes.stop) / 2), formatHertzShort(axes.stop)];

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** 周波数 → x (px)。 */
export const xOf = (f: number, axes: Axes, grid: Rect): number =>
  grid.x + clamp01((f - axes.start) / (axes.stop - axes.start)) * grid.width;

/** レベル → y (px)。上端が ref。 */
export const yOf = (level: number, axes: Axes, grid: Rect): number =>
  grid.y + clamp01((axes.ref - level) / (axes.scale * DIVISIONS.y)) * grid.height;

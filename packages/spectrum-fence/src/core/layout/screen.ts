import { textWidth } from 'fence-kit';
import type { Band, Size } from '../render/mono.ts';
import type { Theme } from '../render/theme.ts';

/**
 * 図全体の割り付け。上から **題 → 凡例 (理想・実測) → 格子 (左に縦軸の字) → 横軸の字 →
 * 状態の行 → 読み値の帯 → 書き出し**。格子は **10 × 10 目盛** (tinySA の画面と同じ)、
 * 1 目盛 40 × 30 px で 400 × 300。画面は 1 枚なので折り返さない。
 */
export const DIVISIONS = { x: 10, y: 10 } as const;

export const SIZE = {
  divX: 40, divY: 30, marginLeft: 40, marginRight: 18, marginTop: 20, axis: 14, status: 16,
} as const;

export const OUTER = 14;
const TITLE_BAND = 24;
const KEY_BAND = 18;
const BAND_GAP = 12;
/** 状態の行の行送り (px)。 */
export const STATUS_LEADING = 13;

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Layout = {
  readonly width: number;
  readonly height: number;
  readonly titleBaseline: number;
  /** 凡例の行の中心 (無ければ null)。 */
  readonly keyY: number | null;
  /** 格子そのもの (枠の内側)。 */
  readonly grid: Rect;
  /** 横軸の字のベースライン。 */
  readonly axisBaseline: number;
  /** 状態の行 (1 行目) のベースライン。 */
  readonly statusBaseline: number;
  readonly readingsBand: Band | null;
  readonly sourceBand: Band | null;
};

export type LayoutOptions = {
  /** 状態の行の数 (1 か 2)。 */
  readonly statusRows?: number;
  readonly title: string | null;
  readonly key: string | null;
  readonly readings: Size | null;
  readonly source: Size | null;
  readonly theme: Theme;
};

export function createLayout(options: LayoutOptions): Layout {
  const { title, key, readings, source, theme } = options;
  let y = OUTER;
  const titleBaseline = y + 14;
  if (title !== null) y += TITLE_BAND;
  const keyY = key === null ? null : y + KEY_BAND / 2 - 2;
  if (key !== null) y += KEY_BAND;
  y += SIZE.marginTop;
  const grid: Rect = {
    x: OUTER + SIZE.marginLeft, y, width: SIZE.divX * DIVISIONS.x, height: SIZE.divY * DIVISIONS.y,
  };
  y += grid.height;
  const axisBaseline = y + SIZE.axis * 0.85;
  y += SIZE.axis;
  const statusBaseline = y + SIZE.status * 0.75;
  y += SIZE.status + (Math.max(1, options.statusRows ?? 1) - 1) * STATUS_LEADING;

  const band = (size: Size | null): Band | null => {
    if (size === null || size.height === 0) return null;
    y += BAND_GAP;
    const here = { x: OUTER, y, width: size.width, height: size.height };
    y += size.height;
    return here;
  };
  const readingsBand = band(readings);
  const sourceBand = band(source);

  const screenWidth = SIZE.marginLeft + grid.width + SIZE.marginRight;
  const titleWidth = title === null ? 0 : textWidth(title) * theme.metrics.textSize * 1.5;
  const keyWidth = key === null ? 0 : textWidth(key) * theme.metrics.smallSize + 80;
  const inner = Math.max(screenWidth, titleWidth, keyWidth, readingsBand?.width ?? 0, sourceBand?.width ?? 0);
  return {
    width: Math.ceil(inner + OUTER * 2),
    height: Math.ceil(y + OUTER),
    titleBaseline,
    keyY,
    grid,
    axisBaseline,
    statusBaseline,
    readingsBand,
    sourceBand,
  };
}

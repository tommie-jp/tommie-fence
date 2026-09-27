import { textWidth } from 'fence-kit';
import { DIVISIONS } from '../model/screen.ts';
import type { Band, Size } from '../render/mono.ts';
import type { Theme } from '../render/theme.ts';

/**
 * 図全体の割り付け。上から **題 → 凡例 (理想・実測) → 格子 (▶ と ◀T ▼ の余白込み) →
 * 状態の行 → 読み値の帯 → 書き出し**。格子の大きさは決まっている (1 目盛 40 px、
 * 400 × 320) — 画面は 1 枚で、並べる枠が無いので折り返さない。
 */
export const SIZE = { div: 40, marginLeft: 18, marginRight: 18, marginTop: 14, status: 18 } as const;

export const OUTER = 14;
const TITLE_BAND = 24;
const KEY_BAND = 18;
const BAND_GAP = 12;

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Layout = {
  readonly width: number;
  readonly height: number;
  readonly titleBaseline: number;
  /** 凡例の行の中心 (無ければ null)。 */
  readonly keyY: number | null;
  /** 格子そのもの (枠の内側)。 */
  readonly grid: Rect;
  /** 状態の行のベースライン。 */
  readonly statusBaseline: number;
  readonly readingsBand: Band | null;
  readonly sourceBand: Band | null;
};

export type LayoutOptions = {
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
    x: OUTER + SIZE.marginLeft, y, width: SIZE.div * DIVISIONS.x, height: SIZE.div * DIVISIONS.y,
  };
  y += grid.height;
  const statusBaseline = y + SIZE.status * 0.75;
  y += SIZE.status;

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
    statusBaseline,
    readingsBand,
    sourceBand,
  };
}

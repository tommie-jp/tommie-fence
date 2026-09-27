import { textWidth } from 'fence-kit';
import { DIVISIONS } from '../model/screen.ts';
import type { Band, Size } from '../render/mono.ts';
import { DIGIT, MARK, statusLeading } from '../render/grid.ts';
import type { Theme } from '../render/theme.ts';

/**
 * 図全体の割り付け。上から **題 → 凡例 (理想・実測) → 格子 (▶ と ◀T ▼ の余白込み) →
 * 状態の行 → 読み値の帯 → 書き出し**。格子の大きさは決まっている (1 目盛 40 px、
 * 400 × 320) — 画面は 1 枚で、並べる枠が無いので折り返さない。左の余白は ▶ の印と
 * 番号 4 字ぶん (0 V の基準が同じ高さの ch は 1 つの印に番号を並べる)。右の余白は ◀T。
 * **字に掛かる帯と余白は字の大きさから割り出す** (字を変えても重ならない)。
 */
export const SIZE = { div: 40, marginTop: 14 } as const;

export const OUTER = 14;
const BAND_GAP = 12;
/** 帯の高さのうち字の上下に足す分 (px)。 */
const BAND_PAD = 10;
/** 題の字の倍率 (title.ts と同じ)。 */
const TITLE_SCALE = 1.5;

/** 格子の左右の余白 (px)。左は `1234▶`、右は `◀T`。 */
export const marginsOf = (theme: Theme): { readonly left: number; readonly right: number } => {
  const size = theme.metrics.smallSize;
  return { left: Math.ceil(4 * DIGIT * size + MARK + 4), right: Math.ceil(MARK + 2 + size * 0.8) };
};

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
  const small = theme.metrics.smallSize;
  const titleSize = theme.metrics.textSize * TITLE_SCALE;
  const margins = marginsOf(theme);
  let y = OUTER;
  const titleBaseline = y + titleSize;
  if (title !== null) y += titleSize + BAND_PAD;
  const keyBand = small + BAND_PAD;
  const keyY = key === null ? null : y + keyBand / 2 - 2;
  if (key !== null) y += keyBand;
  y += SIZE.marginTop;
  const grid: Rect = {
    x: OUTER + margins.left, y, width: SIZE.div * DIVISIONS.x, height: SIZE.div * DIVISIONS.y,
  };
  y += grid.height;
  const status = small + BAND_PAD;
  const statusBaseline = y + status * 0.75;
  y += status + (Math.max(1, options.statusRows ?? 1) - 1) * statusLeading(theme);

  const band = (size: Size | null): Band | null => {
    if (size === null || size.height === 0) return null;
    y += BAND_GAP;
    const here = { x: OUTER, y, width: size.width, height: size.height };
    y += size.height;
    return here;
  };
  const readingsBand = band(readings);
  const sourceBand = band(source);

  const screenWidth = margins.left + grid.width + margins.right;
  const titleWidth = title === null ? 0 : textWidth(title) * titleSize;
  const keyWidth = key === null ? 0 : margins.left + textWidth(key) * small + 80;
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

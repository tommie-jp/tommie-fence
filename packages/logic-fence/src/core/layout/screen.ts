import { textWidth } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { PLOT } from '../model/window.ts';
import type { Band, Size } from '../render/mono.ts';
import type { Theme } from '../render/theme.ts';

/**
 * 図全体の割り付け。上から **題 → 印の帯 (トリガ・カーソルの名札) → 格子 (左にレーンの名前) →
 * 時間軸の字 → 状態の行 → 読み値の帯 → 書き出し**。格子は横 10 目盛 × 60 px = 600 px、
 * 縦は 1 行 34 px。画面は 1 枚なので折り返さない (PLOT は検査と共有する寸法)。
 */
export const SIZE = { pitch: 34, laneInset: 8, marginRight: 24, labelGap: 10, labelMin: 40 } as const;

export const OUTER = 14;
const TITLE_BAND = 28;
/** 印の帯の 1 段 (px)。トリガの三角が 1 段、カーソルの名札が 1 段。 */
const MARK_ROW = 14;
const AXIS_BAND = 18;
const STATUS_BAND = 20;
const BAND_GAP = 12;
/** 行が 1 つも無いときに描く空の格子の行数。 */
const EMPTY_ROWS = 3;

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Layout = {
  readonly width: number;
  readonly height: number;
  readonly titleBaseline: number;
  /** 格子そのもの (枠の内側)。 */
  readonly plot: Rect;
  /** 印の帯 (格子の上)。トリガの三角の上端 y と、カーソルの名札のベースライン。無ければ null。 */
  readonly triggerTop: number | null;
  readonly cursorBaseline: number | null;
  readonly axisBaseline: number;
  readonly statusBaseline: number;
  readonly readingsBand: Band | null;
  readonly sourceBand: Band | null;
  /** 行の数 (空でも描く行の数)。 */
  readonly rowCount: number;
};

export type LayoutOptions = {
  readonly rows: number;
  readonly labels: readonly string[];
  readonly title: string | null;
  readonly hasTrigger: boolean;
  readonly hasCursors: boolean;
  readonly status: string;
  readonly readings: Size | null;
  readonly source: Size | null;
  readonly theme: Theme;
};

export function createLayout(options: LayoutOptions): Layout {
  const { title, readings, source, theme } = options;
  const size = theme.metrics.textSize;
  let y = OUTER;
  const titleBaseline = y + 18;
  if (title !== null) y += TITLE_BAND;
  const triggerTop = options.hasTrigger ? y : null;
  if (options.hasTrigger) y += MARK_ROW;
  const cursorBaseline = options.hasCursors ? y + MARK_ROW - 3 : null;
  if (options.hasCursors) y += MARK_ROW;
  y += 4;
  const labelWidth = Math.max(SIZE.labelMin, ...options.labels.map((label) => textWidth(label) * size)) + SIZE.labelGap;
  const rowCount = options.rows === 0 ? EMPTY_ROWS : options.rows;
  const plot: Rect = { x: OUTER + labelWidth, y, width: PLOT.divPx * LIMITS.divisions, height: SIZE.pitch * rowCount };
  y += plot.height;
  const axisBaseline = y + AXIS_BAND * 0.8;
  y += AXIS_BAND;
  const statusBaseline = y + STATUS_BAND * 0.7;
  y += STATUS_BAND;

  const band = (bandSize: Size | null): Band | null => {
    if (bandSize === null || bandSize.height === 0) return null;
    y += BAND_GAP;
    const here = { x: OUTER, y, width: bandSize.width, height: bandSize.height };
    y += bandSize.height;
    return here;
  };
  const readingsBand = band(readings);
  const sourceBand = band(source);

  const screenWidth = labelWidth + plot.width + SIZE.marginRight;
  const titleWidth = title === null ? 0 : textWidth(title) * size * 1.5;
  const statusWidth = textWidth(options.status) * size;
  const inner = Math.max(screenWidth, titleWidth, statusWidth, readingsBand?.width ?? 0, sourceBand?.width ?? 0);
  return {
    width: Math.ceil(inner + OUTER * 2),
    height: Math.ceil(y + OUTER),
    titleBaseline,
    plot,
    triggerTop,
    cursorBaseline,
    axisBaseline,
    statusBaseline,
    readingsBand,
    sourceBand,
    rowCount,
  };
}

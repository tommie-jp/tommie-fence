import { textWidth } from 'fence-kit';
import type { Band, Size } from '../render/mono.ts';
import type { Theme } from '../render/theme.ts';

/**
 * 図全体の割り付け。上から **題 → 凡例 → 枠 (単位ごとに縦に積む。x の目盛は一番下の枠だけ) →
 * x の名札 → 読み値の帯 → 書き出し**。枠の幅は決まっている (400 px)。高さは枠の数で割る
 * — 縦横の比を極端にしない (readable-graph #11)。左の余白は縦の目盛の字 6 字ぶん。
 */
export const SIZE = { plotWidth: 400, marginLeft: 56, marginRight: 22, heading: 26, gap: 12, xTicks: 20, xLabel: 20 } as const;

/** 枠の数ごとの高さ (1 枚なら 4:3 に近く、積むほど低く)。 */
const PANEL_HEIGHT: readonly number[] = [220, 150, 120];

export const OUTER = 14;
const TITLE_BAND = 28;
const LEGEND_ROW = 20;
const BAND_GAP = 12;

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type PanelBox = {
  /** 見出し (縦軸の名札) のベースライン。 */
  readonly headingBaseline: number;
  /** 線を描く所。 */
  readonly plot: Rect;
};

export type Layout = {
  readonly width: number;
  readonly height: number;
  readonly titleBaseline: number;
  /** 凡例の行の中心 (行ごと)。 */
  readonly legendRows: readonly number[];
  readonly panels: readonly PanelBox[];
  /** x の目盛の字のベースライン。 */
  readonly xTickBaseline: number;
  /** x の名札のベースライン。 */
  readonly xLabelBaseline: number;
  readonly readingsBand: Band | null;
  readonly sourceBand: Band | null;
};

export type LayoutOptions = {
  readonly title: string | null;
  /** 凡例の行の数 (0 なら凡例を置かない)。 */
  readonly legendRows: number;
  readonly panels: number;
  readonly readings: Size | null;
  readonly source: Size | null;
  readonly theme: Theme;
};

export function createLayout(options: LayoutOptions): Layout {
  const { title, readings, source, theme } = options;
  const count = Math.max(1, options.panels);
  const panelHeight = PANEL_HEIGHT[Math.min(count, PANEL_HEIGHT.length) - 1] ?? 120;
  let y = OUTER;
  const titleBaseline = y + 18;
  if (title !== null) y += TITLE_BAND;
  const legendRows: number[] = [];
  for (let row = 0; row < options.legendRows; row += 1) {
    legendRows.push(y + LEGEND_ROW / 2);
    y += LEGEND_ROW;
  }
  const x = OUTER + SIZE.marginLeft;
  const panels: PanelBox[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index > 0) y += SIZE.gap;
    const headingBaseline = y + SIZE.heading - 10;
    y += SIZE.heading;
    panels.push({ headingBaseline, plot: { x, y, width: SIZE.plotWidth, height: panelHeight } });
    y += panelHeight;
  }
  const xTickBaseline = y + SIZE.xTicks - 4;
  y += SIZE.xTicks;
  const xLabelBaseline = y + SIZE.xLabel - 4;
  y += SIZE.xLabel;

  const band = (size: Size | null): Band | null => {
    if (size === null || size.height === 0) return null;
    y += BAND_GAP;
    const here = { x: OUTER, y, width: size.width, height: size.height };
    y += size.height;
    return here;
  };
  const readingsBand = band(readings);
  const sourceBand = band(source);

  const plotWidth = SIZE.marginLeft + SIZE.plotWidth + SIZE.marginRight;
  const titleWidth = title === null ? 0 : textWidth(title) * theme.metrics.textSize * 1.5;
  const inner = Math.max(plotWidth, titleWidth, readingsBand?.width ?? 0, sourceBand?.width ?? 0);
  return {
    width: Math.ceil(inner + OUTER * 2),
    height: Math.ceil(y + OUTER),
    titleBaseline,
    legendRows,
    panels,
    xTickBaseline,
    xLabelBaseline,
    readingsBand,
    sourceBand,
  };
}

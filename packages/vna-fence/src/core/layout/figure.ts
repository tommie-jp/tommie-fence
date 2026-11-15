import { textWidth } from 'fence-kit';
import type { Band, Size } from '../render/mono.ts';
import type { Theme } from '../render/theme.ts';
import { placePanels } from './panels.ts';
import type { Panel, PanelGroup } from './panels.ts';

/**
 * 図全体の割り付け。上から **題 → 画面の上の字 → 凡例 (理想・実測) → 枠 → 画面の下の字 → 読み値の帯 → 書き出し**。
 * 枠が 1 行に収まらなければ折り返す (`placePanels`)。
 */
export const OUTER = 14;
const TITLE_BAND = 24;
const KEY_BAND = 18;
const BAND_GAP = 12;
const MIN_WIDTH = 200;

export type Layout = {
  readonly width: number;
  readonly height: number;
  readonly titleBaseline: number;
  /** 凡例の行の中心 (無ければ null)。 */
  readonly keyY: number | null;
  readonly panels: readonly Panel[];
  readonly readingsBand: Band | null;
  readonly sourceBand: Band | null;
  /** 画面の外の字 (`- text above: 字` は題の下、`- text below: 字` は枠の下)。無ければ null。 */
  readonly aboveBand: Band | null;
  readonly belowBand: Band | null;
};

export type LayoutOptions = {
  readonly title: string | null;
  readonly key: string | null;
  readonly groups: readonly PanelGroup[];
  readonly readings: Size | null;
  readonly source: Size | null;
  /** 画面の外の字の帯 (上と下)。 */
  readonly above?: Size | null;
  readonly below?: Size | null;
  readonly theme: Theme;
};

export function createLayout(options: LayoutOptions): Layout {
  const { title, key, groups, readings, source, theme } = options;
  let y = OUTER;
  const titleBaseline = y + 14;
  if (title !== null) y += TITLE_BAND;
  const above = options.above ?? null;
  const aboveBand: Band | null = above === null || above.height === 0 ? null : { x: OUTER, y, width: above.width, height: above.height };
  if (aboveBand !== null) y += aboveBand.height + BAND_GAP;
  const keyY = key === null ? null : y + KEY_BAND / 2 - 2;
  if (key !== null) y += KEY_BAND;
  const placed = placePanels(groups, OUTER, y);
  y += placed.height;

  const band = (size: Size | null): Band | null => {
    if (size === null || size.height === 0) return null;
    y += BAND_GAP;
    const here = { x: OUTER, y, width: size.width, height: size.height };
    y += size.height;
    return here;
  };
  const belowBand = band(options.below ?? null);
  const readingsBand = band(readings);
  const sourceBand = band(source);

  const titleWidth = title === null ? 0 : textWidth(title) * theme.metrics.textSize * 1.5;
  const keyWidth = key === null ? 0 : textWidth(key) * theme.metrics.smallSize + 80;
  const inner = Math.max(MIN_WIDTH, placed.width, titleWidth, keyWidth, readingsBand?.width ?? 0, sourceBand?.width ?? 0);
  return {
    width: Math.ceil(inner + OUTER * 2),
    height: Math.ceil(y + OUTER),
    titleBaseline,
    keyY,
    panels: placed.panels,
    readingsBand,
    sourceBand,
    // 画面の外の字は図の幅で `…` に切る (字の長さで図を広げない)。
    aboveBand: aboveBand === null ? null : { ...aboveBand, width: inner },
    belowBand: belowBand === null ? null : { ...belowBand, width: inner },
  };
}

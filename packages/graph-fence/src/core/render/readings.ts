import { element, num, svgText, textWidth } from 'fence-kit';
import type { Readings } from '../model/readings.ts';
import { linesSize, renderLines, renderTable, tableLines, tableSize } from './mono.ts';
import type { Band, Size } from './mono.ts';
import type { Theme } from './theme.ts';

/**
 * 読み値の帯と凡例。帯は **見出し 1 行 → mark の表 → peak の表**。見出しで、値が
 * **測った値か理想の値か**を言う (取り違えると本文の数字が嘘になる。scope・vna と同じ)。
 */
export function readingsHeading(readings: Readings, dataName: string | null): string {
  const data = dataName ?? '実測 (data)';
  if (readings.basis === 'data') return `読み値 — ${data}`;
  if (readings.basis === 'mixed') return `読み値 — 理想 (計算) と ${data}`;
  return '読み値 — 理想 (計算)';
}

type Parts = {
  readonly heading: readonly string[];
  readonly marks: readonly (readonly string[])[];
  readonly peaks: readonly (readonly string[])[];
};

const partsOf = (readings: Readings, dataName: string | null): Parts => {
  const empty = readings.markRows.length === 0 && readings.peakRows.length === 0;
  return { heading: empty ? [] : [readingsHeading(readings, dataName)], marks: readings.markRows, peaks: readings.peakRows };
};

export function readingsSize(readings: Readings, dataName: string | null, theme: Theme): Size | null {
  const parts = partsOf(readings, dataName);
  const sizes = [linesSize(parts.heading, theme), tableSize(parts.marks, theme), tableSize(parts.peaks, theme)];
  const height = sizes.reduce((sum, size) => sum + size.height, 0);
  if (height === 0) return null;
  return { width: Math.max(...sizes.map((size) => size.width)), height };
}

export function renderReadings(readings: Readings, dataName: string | null, band: Band, theme: Theme): string {
  const parts = partsOf(readings, dataName);
  let y = band.y;
  const next = (size: Size): Band => {
    const here = { x: band.x, y, width: band.width, height: size.height };
    y += size.height;
    return here;
  };
  const headingBand = next(linesSize(parts.heading, theme));
  const markBand = next(tableSize(parts.marks, theme));
  const peakBand = next(tableSize(parts.peaks, theme));
  return renderLines(parts.heading, headingBand, theme, theme.palette.caption)
    + renderTable(parts.marks, markBand, theme)
    + renderTable(parts.peaks, peakBand, theme);
}

/** 読み値を字の行に (CLI・playground)。**図の帯と同じ見出しと並び**。 */
export function readingLinesOf(readings: Readings, dataName: string | null): readonly string[] {
  const parts = partsOf(readings, dataName);
  return [...parts.heading, ...tableLines(parts.marks), ...tableLines(parts.peaks)];
}

/** 凡例の 1 項目 (線の見本と名前)。 */
export type LegendItem = { readonly name: string; readonly color: string; readonly measured: boolean };

const SAMPLE = 22;
const ITEM_GAP = 18;

const itemWidth = (item: LegendItem, theme: Theme): number => SAMPLE + 5 + textWidth(item.name) * theme.metrics.smallSize;

/** 凡例を行に割る (枠の幅に収まるように)。 */
export function legendRows(items: readonly LegendItem[], width: number, theme: Theme): readonly (readonly LegendItem[])[] {
  const rows: LegendItem[][] = [];
  let row: LegendItem[] = [];
  let used = 0;
  for (const item of items) {
    const wide = itemWidth(item, theme);
    if (row.length > 0 && used + ITEM_GAP + wide > width) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += (row.length === 0 ? 0 : ITEM_GAP) + wide;
    row.push(item);
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/** 凡例。**理想は実線の見本、実測は ○ の見本**。 */
export function renderLegend(rows: readonly (readonly LegendItem[])[], centers: readonly number[], left: number, theme: Theme): string {
  const size = theme.metrics.smallSize;
  return rows.map((row, index) => {
    const y = centers[index] ?? 0;
    let x = left;
    return row.map((item) => {
      const sample = item.measured
        ? element('circle', { cx: num(x + SAMPLE / 2), cy: num(y), r: 3, fill: 'none', stroke: item.color, 'stroke-width': 1.3 })
        : element('line', { x1: num(x), y1: num(y), x2: num(x + SAMPLE), y2: num(y), stroke: item.color, 'stroke-width': 1.5 });
      const label = svgText(x + SAMPLE + 5, y + size * 0.35, item.name, { anchor: 'start', fill: theme.palette.caption, 'font-size': num(size) });
      x += itemWidth(item, theme) + ITEM_GAP;
      return sample + label;
    }).join('');
  }).join('');
}

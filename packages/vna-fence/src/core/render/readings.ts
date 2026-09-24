import { element, num, svgText, textWidth } from 'fence-kit';
import type { Layout } from '../layout/figure.ts';
import type { Readings } from '../model/readings.ts';
import { linesSize, renderLines, renderTable, tableSize } from './mono.ts';
import type { Band, Size } from './mono.ts';
import type { Theme } from './theme.ts';

/**
 * 読み値の帯。**見出し 1 行 → マーカーの表 → TDR の山**の順。
 * 見出しで、表の値が**測った値か模型の値か**を言う (取り違えると本文の数字が嘘になる)。
 */
export const readingsHeading = (readings: Readings, dataName: string | null): string =>
  (readings.basis === 'data'
    ? `読み値 — 実測 (${dataName ?? 'data'})`
    : '読み値 — 理想 (dut: の模型)');

type Parts = { readonly heading: readonly string[]; readonly table: readonly (readonly string[])[]; readonly extra: readonly string[] };

const partsOf = (readings: Readings, dataName: string | null): Parts => ({
  heading: readings.rows.length > 0 ? [readingsHeading(readings, dataName)] : [],
  table: readings.rows.length > 0 ? [readings.columns, ...readings.rows] : [],
  extra: readings.extra,
});

export function readingsSize(readings: Readings, dataName: string | null, theme: Theme): Size | null {
  const parts = partsOf(readings, dataName);
  const sizes = [linesSize(parts.heading, theme), tableSize(parts.table, theme), linesSize(parts.extra, theme)];
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
  const tableBand = next(tableSize(parts.table, theme));
  const extraBand = next(linesSize(parts.extra, theme));
  return renderLines(parts.heading, headingBand, theme, theme.palette.caption)
    + renderTable(parts.table, tableBand, theme)
    + renderLines(parts.extra, extraBand, theme, theme.palette.caption);
}

/** 凡例の字 (破線 = 理想、実線 = 実測)。どちらも無ければ null。 */
export function keyText(hasModel: boolean, dataName: string | null): string | null {
  const items = [...(hasModel ? ['理想 (dut:)'] : []), ...(dataName === null ? [] : [`実測 (${dataName})`])];
  return items.length === 0 ? null : items.join('    ');
}

/** 凡例。**線の見本を字の前に**置く。 */
export function renderKey(hasModel: boolean, dataName: string | null, layout: Layout, theme: Theme): string {
  if (layout.keyY === null) return '';
  const y = layout.keyY;
  const size = theme.metrics.smallSize;
  let x = layout.panels[0]?.plot.x ?? 14;
  const out: string[] = [];
  const item = (text: string, dashed: boolean): void => {
    out.push(element('line', {
      x1: num(x), y1: num(y), x2: num(x + 22), y2: num(y), stroke: theme.palette.caption, 'stroke-width': 1.5,
      ...(dashed ? { 'stroke-dasharray': '5 3' } : {}),
    }));
    out.push(svgText(x + 27, y + size * 0.35, text, { anchor: 'start', fill: theme.palette.caption, 'font-size': num(size) }));
    x += 27 + textWidth(text) * size + 20;
  };
  if (hasModel) item('理想 (dut:)', true);
  if (dataName !== null) item(`実測 (${dataName})`, false);
  return out.join('');
}

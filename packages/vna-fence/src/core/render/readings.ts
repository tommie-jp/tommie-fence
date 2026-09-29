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

/** 凡例の 1 項。`colors` はその線を引いたトレースの色 (書いた順)。 */
export type KeyLine = { readonly text: string; readonly dashed: boolean; readonly colors: readonly string[] };

/** 凡例の字 (重ねたときは 破線 = 理想、実線 = 実測)。項が無ければ null。枠の幅を決めるのに使う。 */
export function keyText(lines: readonly KeyLine[]): string | null {
  return lines.length === 0 ? null : lines.map((line) => line.text).join('    ');
}

/** 見本の幅。色が何本あっても変えない (凡例の幅は字だけで決めてある)。 */
const SAMPLE = 22;

/**
 * 凡例。**線の見本を字の前に**置く。見本は**その線を引いたトレースの色を並べて**描く
 * — 地の文字色で描くと、グラフに無い色の線を指すことになる。
 */
export function renderKey(lines: readonly KeyLine[], layout: Layout, theme: Theme): string {
  if (layout.keyY === null || lines.length === 0) return '';
  const y = layout.keyY;
  const size = theme.metrics.smallSize;
  let x = layout.panels[0]?.plot.x ?? 14;
  const out: string[] = [];
  for (const { text, dashed, colors } of lines) {
    out.push(sample(x, y, dashed, colors.length > 0 ? colors : [theme.palette.caption]));
    out.push(svgText(x + SAMPLE + 5, y + size * 0.35, text, { anchor: 'start', fill: theme.palette.caption, 'font-size': num(size) }));
    x += SAMPLE + 5 + textWidth(text) * size + 20;
  }
  return `<g data-vna-key="">${out.join('')}</g>`;
}

/** 色 1 つなら 1 本 (破線は `5 3`)、2 つ以上なら色ごとに区切る (破線は区切りの間を空ける)。 */
function sample(x: number, y: number, dashed: boolean, colors: readonly string[]): string {
  const step = SAMPLE / colors.length;
  const solo = colors.length === 1;
  return colors.map((color, index) => {
    const x1 = x + index * step;
    const x2 = x1 + (dashed && !solo ? step * 0.65 : step);
    return element('line', {
      x1: num(x1), y1: num(y), x2: num(x2), y2: num(y), stroke: color, 'stroke-width': 1.5,
      ...(dashed && solo ? { 'stroke-dasharray': '5 3' } : {}),
    });
  }).join('');
}

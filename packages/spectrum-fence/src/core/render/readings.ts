import { element, num, svgText, textWidth } from 'fence-kit';
import type { Lang } from 'fence-kit';
import { holdLabelOf, labelsOf } from './labels.ts';
import type { Layout } from '../layout/screen.ts';
import type { Readings } from '../model/markers.ts';
import { linesSize, renderLines, renderTable, tableLines, tableSize } from './mono.ts';
import type { Band, Size } from './mono.ts';
import type { Theme } from './theme.ts';

/**
 * 読み値の帯。**見出し 1 行 → マーカーの表**。見出しで、表の値が**測った値か理想の値か**を
 * 言う (取り違えると本文の数字が嘘になる。vna・scope と同じ)。マーカーの表は図の下
 * (tinySA の画面では上だが、3 つの計器の図で読み値の場所を揃える — 52 の docs/88 §1)。
 */
export function readingsHeading(readings: Readings, dataName: string | null, lang: Lang = 'ja'): string {
  const t = labelsOf(lang);
  if (readings.basis === 'data') return `${t.readings} — ${dataName ?? t.measuredFallback}`;
  return readings.basis === 'hold' ? `${t.readings} — MAX HOLD (${t.holdCalc})` : `${t.readings} — ${t.ideal}`;
}

const partsOf = (readings: Readings, dataName: string | null, lang: Lang): { readonly heading: readonly string[]; readonly rows: Readings['rows'] } =>
  ({ heading: readings.rows.length === 0 ? [] : [readingsHeading(readings, dataName, lang)], rows: readings.rows });

export function readingsSize(readings: Readings, dataName: string | null, theme: Theme, lang: Lang = 'ja'): Size | null {
  const parts = partsOf(readings, dataName, lang);
  const heading = linesSize(parts.heading, theme);
  const table = tableSize(parts.rows, theme);
  const height = heading.height + table.height;
  return height === 0 ? null : { width: Math.max(heading.width, table.width), height };
}

export function renderReadings(readings: Readings, dataName: string | null, band: Band, theme: Theme, lang: Lang = 'ja'): string {
  const parts = partsOf(readings, dataName, lang);
  const heading = linesSize(parts.heading, theme);
  return renderLines(parts.heading, { ...band, height: heading.height }, theme, theme.palette.caption)
    + renderTable(parts.rows, { x: band.x, y: band.y + heading.height, width: band.width, height: band.height - heading.height }, theme);
}

/** 読み値を字の行に (CLI・playground)。**図の帯と同じ見出しと並び**。 */
export function readingLinesOf(readings: Readings, dataName: string | null, lang: Lang = 'ja'): readonly string[] {
  const parts = partsOf(readings, dataName, lang);
  return [...parts.heading, ...tableLines(parts.rows)];
}

/** 凡例の字 (重ねたときは 破線 = 理想、実線 = 重ねた値。`dataName` は `実測 (a.csv)` の形)。何も無ければ null。`holdSweeps` は積んだ掃引の数。 */
export function keyText(hasModel: boolean, dataName: string | null, holdSweeps = 0, lang: Lang = 'ja'): string | null {
  const items = [
    ...(holdSweeps > 0 ? [holdLabelOf(lang, holdSweeps)] : []),
    ...(hasModel ? [holdSweeps > 0 ? labelsOf(lang).current : labelsOf(lang).ideal] : []),
    ...(dataName === null ? [] : [dataName]),
  ];
  return items.length === 0 ? null : items.join('    ');
}

/** 凡例。**線の見本を字の前に**置く (vna・scope と同じ形)。 */
export function renderKey(hasModel: boolean, dataName: string | null, layout: Layout, theme: Theme, holdSweeps = 0, lang: Lang = 'ja'): string {
  if (layout.keyY === null) return '';
  const y = layout.keyY;
  const size = theme.metrics.smallSize;
  let x = layout.grid.x;
  const out: string[] = [];
  const item = (text: string, dashed: boolean, filled = false): void => {
    if (filled) out.push(element('rect', { x: num(x), y: num(y - 4), width: 22, height: 8, fill: theme.palette.caption, 'fill-opacity': 0.18 }));
    out.push(element('line', {
      x1: num(x), y1: num(y), x2: num(x + 22), y2: num(y), stroke: theme.palette.caption, 'stroke-width': 1.5,
      ...(dashed ? { 'stroke-dasharray': '5 3' } : {}),
    }));
    out.push(svgText(x + 27, y + size * 0.35, text, { anchor: 'start', fill: theme.palette.caption, 'font-size': num(size) }));
    x += 27 + textWidth(text) * size + 20;
  };
  if (holdSweeps > 0) item(holdLabelOf(lang, holdSweeps), false, true);
  if (hasModel) item(holdSweeps > 0 ? labelsOf(lang).current : labelsOf(lang).ideal, dataName !== null);
  if (dataName !== null) item(dataName, false);
  return out.join('');
}

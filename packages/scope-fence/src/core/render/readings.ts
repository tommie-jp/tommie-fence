import { element, num, svgText, textWidth } from 'fence-kit';
import type { Lang } from 'fence-kit';
import { labelsOf } from './labels.ts';
import type { Layout } from '../layout/screen.ts';
import type { Readings } from '../model/readings.ts';
import { linesSize, renderLines, renderTable, tableLines, tableSize } from './mono.ts';
import type { Band, Size } from './mono.ts';
import type { Theme } from './theme.ts';

/**
 * 読み値の帯。**見出し 1 行 → Measurements の表 → カーソルの表**の順。見出しで、表の値が
 * **測った値か理想の値か**を言う (取り違えると本文の数字が嘘になる。vna と同じ)。
 */
export function readingsHeading(readings: Readings, dataName: string | null, lang: Lang = 'ja'): string {
  const text = labelsOf(lang);
  const data = dataName ?? text.measuredData;
  if (readings.basis === 'data') return `${text.readings} — ${data}`;
  if (readings.basis === 'mixed') {
    const names = readings.idealNames.map((name) => name.toUpperCase()).join(text.join);
    return lang === 'ja' ? `${text.readings} — ${data}。${names}${text.isIdeal}` : `${text.readings} — ${data}; ${names}${text.isIdeal}`;
  }
  return `${text.readings} — ${text.ideal}`;
}

type Parts = {
  readonly heading: readonly string[];
  readonly measures: readonly (readonly string[])[];
  readonly cursors: readonly (readonly string[])[];
};

const partsOf = (readings: Readings, dataName: string | null, lang: Lang): Parts => {
  const empty = readings.measureRows.length === 0 && readings.cursorRows.length === 0;
  return {
    heading: empty ? [] : [readingsHeading(readings, dataName, lang)],
    measures: readings.measureRows,
    cursors: readings.cursorRows,
  };
};

export function readingsSize(readings: Readings, dataName: string | null, theme: Theme, lang: Lang = 'ja'): Size | null {
  const parts = partsOf(readings, dataName, lang);
  const sizes = [linesSize(parts.heading, theme), tableSize(parts.measures, theme), tableSize(parts.cursors, theme)];
  const height = sizes.reduce((sum, size) => sum + size.height, 0);
  if (height === 0) return null;
  return { width: Math.max(...sizes.map((size) => size.width)), height };
}

export function renderReadings(readings: Readings, dataName: string | null, band: Band, theme: Theme, lang: Lang = 'ja'): string {
  const parts = partsOf(readings, dataName, lang);
  let y = band.y;
  const next = (size: Size): Band => {
    const here = { x: band.x, y, width: band.width, height: size.height };
    y += size.height;
    return here;
  };
  const headingBand = next(linesSize(parts.heading, theme));
  const measureBand = next(tableSize(parts.measures, theme));
  const cursorBand = next(tableSize(parts.cursors, theme));
  return renderLines(parts.heading, headingBand, theme, theme.palette.caption)
    + renderTable(parts.measures, measureBand, theme)
    + renderTable(parts.cursors, cursorBand, theme);
}

/** 読み値を字の行に (CLI・playground)。**図の帯と同じ見出しと並び**。 */
export function readingLinesOf(readings: Readings, dataName: string | null, lang: Lang = 'ja'): readonly string[] {
  const parts = partsOf(readings, dataName, lang);
  return [...parts.heading, ...tableLines(parts.measures), ...tableLines(parts.cursors)];
}

/** 凡例の字 (重ねたときは 破線 = 理想、実線 = 重ねた値。`dataName` は `実測 (a.csv)` の形)。どちらも無ければ null。 */
export function keyText(hasModel: boolean, dataName: string | null, lang: Lang = 'ja'): string | null {
  const items = [...(hasModel ? [labelsOf(lang).ideal] : []), ...(dataName === null ? [] : [dataName])];
  return items.length === 0 ? null : items.join('    ');
}

/** 凡例。**線の見本を字の前に**置く (vna と同じ形)。 */
export function renderKey(hasModel: boolean, dataName: string | null, layout: Layout, theme: Theme, lang: Lang = 'ja'): string {
  if (layout.keyY === null) return '';
  const y = layout.keyY;
  const size = theme.metrics.smallSize;
  let x = layout.grid.x;
  const out: string[] = [];
  const item = (text: string, dashed: boolean): void => {
    out.push(element('line', {
      x1: num(x), y1: num(y), x2: num(x + 22), y2: num(y), stroke: theme.palette.caption, 'stroke-width': 1.5,
      ...(dashed ? { 'stroke-dasharray': '5 3' } : {}),
    }));
    out.push(svgText(x + 27, y + size * 0.35, text, { anchor: 'start', fill: theme.palette.caption, 'font-size': num(size) }));
    x += 27 + textWidth(text) * size + 20;
  };
  if (hasModel) item(labelsOf(lang).ideal, dataName !== null);
  if (dataName !== null) item(dataName, false);
  return out.join('');
}

import { fit, keptSourceLines, num, svgText, textWidth } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import { widthOf } from './errorText.ts';
import type { Theme } from './theme.ts';

/**
 * 図の下の帯 — 読み値の表と書き出し (`- source`)。**等幅で組む**
 * (perfboard / copper の帯と同じ寸法。並べたとき字の大きさが揃う)。
 */
const MONO_FAMILY = "ui-monospace, 'DejaVu Sans Mono', 'Noto Sans Mono CJK JP', monospace";
const MONO_WIDEN = 1.2;
const LEADING = 1.35;
const PAD = 6;

export type Band = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type Size = { readonly width: number; readonly height: number };

const monoWidth = (text: string, size: number): number => textWidth(text) * size * MONO_WIDEN;
const bandHeight = (rows: number, size: number): number => (rows === 0 ? 0 : size * LEADING * (rows - 1) + size + PAD * 2);
const baseline = (band: Band, size: number, index: number): number => band.y + PAD + size * 0.8 + size * LEADING * index;

const monoText = (x: number, y: number, text: string, fill: string, size: number, room?: number): string =>
  svgText(x, y, room === undefined ? text : fit(text, room / (size * MONO_WIDEN)), {
    anchor: 'start', fill, 'font-size': num(size), 'font-family': MONO_FAMILY, 'xml:space': 'preserve',
  });

/** 書き出す行。**囲みごと**写す (図だけを貼られた人が、同じ図をもう一度出せる)。 */
export function sourceListing(source: string): readonly string[] {
  const kept = keptSourceLines(source, LIMITS.sourceLines).map((line) => clampText(line, LIMITS.sourceLineLength));
  return ['```vna', ...kept, '```'];
}

export function linesSize(lines: readonly string[], theme: Theme): Size {
  if (lines.length === 0) return { width: 0, height: 0 };
  const size = theme.metrics.smallSize;
  return { width: Math.ceil(Math.max(...lines.map((line) => monoWidth(line, size)))), height: bandHeight(lines.length, size) };
}

export function renderLines(lines: readonly string[], band: Band, theme: Theme, fill: string): string {
  const size = theme.metrics.smallSize;
  return lines.map((line, index) => monoText(band.x, baseline(band, size, index), line, fill, size, band.width)).join('');
}

const GAP = '  ';

/** 表の列の位置。**列ごとに一番長い字で幅を決める** (等幅なので揃う)。 */
function columns(rows: readonly (readonly string[])[], size: number): readonly number[] {
  const count = Math.max(0, ...rows.map((row) => row.length));
  let x = 0;
  return Array.from({ length: count }, (_, column) => {
    const here = x;
    x += Math.max(...rows.map((row) => monoWidth(row[column] ?? '', size))) + monoWidth(GAP, size);
    return here;
  });
}

/** 表を字の行に直す (CLI の `--verbose` と同じ並び)。**端末の桁で揃える** (全角は 2 桁)。 */
export function tableLines(rows: readonly (readonly string[])[]): readonly string[] {
  const count = Math.max(0, ...rows.map((row) => row.length));
  const widths = Array.from({ length: count }, (_, column) => Math.max(...rows.map((row) => widthOf(row[column] ?? ''))));
  return rows.map((row) => row.map((cell, column) =>
    (column === row.length - 1 ? cell : cell + ' '.repeat((widths[column] ?? 0) - widthOf(cell)))).join(GAP));
}

export function tableSize(rows: readonly (readonly string[])[], theme: Theme): Size {
  if (rows.length === 0) return { width: 0, height: 0 };
  const size = theme.metrics.smallSize;
  const xs = columns(rows, size);
  const lastColumn = xs.length - 1;
  const width = Math.max(...rows.map((row) => (xs[lastColumn] ?? 0) + monoWidth(row[lastColumn] ?? '', size)));
  return { width: Math.ceil(width), height: bandHeight(rows.length, size) };
}

/** 表を描く。**1 行目は見出し** (字の色を落とす)。 */
export function renderTable(rows: readonly (readonly string[])[], band: Band, theme: Theme): string {
  const size = theme.metrics.smallSize;
  const xs = columns(rows, size);
  return rows.flatMap((row, index) => row.map((cell, column) =>
    monoText(band.x + (xs[column] ?? 0), baseline(band, size, index), cell,
      index === 0 ? theme.palette.label : theme.palette.caption, size))).join('');
}

import { fit, keptSourceLines, num, svgText, textWidth } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Band } from '../model/layout.ts';
import type { PartSpec } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 図の下の帯 — 書き出し (`- source`) と部品表 (`- parts`)。**等幅で組む**
 * (perfboard の `monoBand.ts` と同じ寸法。並べたとき字の大きさが揃う)。
 */
const MONO_FAMILY = "ui-monospace, 'DejaVu Sans Mono', 'Noto Sans Mono CJK JP', monospace";
const MONO_WIDEN = 1.2;
const LEADING = 1.15;
const PAD = 8;

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
  return ['```copper', ...kept, '```'];
}

export type Row = readonly [string, string, string];

const HEADINGS: Row = ['部品', '種類', '値'];

/** 部品表。**書いた順**に並べる (図を追いながら読む人が行を見失わない)。 */
export function partsListing(parts: readonly PartSpec[]): readonly Row[] {
  if (parts.length === 0) return [];
  return [HEADINGS, ...parts.map((part): Row => [
    part.id, part.variant === null ? part.type : `${part.type}/${part.variant}`, part.value ?? '',
  ])];
}

const GAP = '  ';

function columns(rows: readonly Row[], size: number): readonly { x: number; width: number }[] {
  let x = 0;
  return [0, 1, 2].map((column) => {
    const width = Math.max(...rows.map((row) => monoWidth(row[column] ?? '', size)));
    const here = { x, width };
    x += width + monoWidth(GAP, size);
    return here;
  });
}

export function listSize(rows: readonly Row[], theme: Theme): { readonly width: number; readonly height: number } {
  if (rows.length === 0) return { width: 0, height: 0 };
  const size = theme.metrics.textSize;
  const last = columns(rows, size)[2];
  return { width: Math.ceil((last?.x ?? 0) + (last?.width ?? 0)), height: bandHeight(rows.length, size) };
}

export function sourceSize(lines: readonly string[], theme: Theme): { readonly width: number; readonly height: number } {
  if (lines.length === 0) return { width: 0, height: 0 };
  const size = theme.metrics.textSize;
  return { width: Math.ceil(Math.max(...lines.map((line) => monoWidth(line, size)))), height: bandHeight(lines.length, size) };
}

export function renderList(rows: readonly Row[], band: Band, theme: Theme, fill: string): string {
  const size = theme.metrics.textSize;
  const cols = columns(rows, size);
  return rows.flatMap((row, index) => row.map((cell, column) =>
    monoText(band.x + (cols[column]?.x ?? 0), baseline(band, size, index), cell, fill, size))).join('');
}

export function renderSource(lines: readonly string[], band: Band, theme: Theme, fill: string): string {
  const size = theme.metrics.textSize;
  return lines.map((line, index) => monoText(band.x, baseline(band, size, index), line, fill, size, band.width)).join('');
}

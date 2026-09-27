import { keptSourceLines, monoBandHeight, monoBaseline, monoLinesSize, monoText, monoWidth, renderMonoLines } from 'fence-kit';
import type { MonoSpacing } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Band } from '../model/layout.ts';
import type { PartSpec } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 図の下の帯 — 書き出し (`- source`) と部品表 (`- parts`)。**組み方は fence-kit の
 * `mono.ts`** (perfboard と同じ寸法。並べたとき字の大きさが揃う)。
 */
const SPACING: MonoSpacing = { leading: 1.15, pad: 8 };

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
  return { width: Math.ceil((last?.x ?? 0) + (last?.width ?? 0)), height: monoBandHeight(rows.length, size, SPACING) };
}

export const sourceSize = (lines: readonly string[], theme: Theme): { readonly width: number; readonly height: number } =>
  monoLinesSize(lines, theme.metrics.textSize, SPACING);

export function renderList(rows: readonly Row[], band: Band, theme: Theme, fill: string): string {
  const size = theme.metrics.textSize;
  const cols = columns(rows, size);
  return rows.flatMap((row, index) => row.map((cell, column) =>
    monoText(band.x + (cols[column]?.x ?? 0), monoBaseline(band.y, size, index, SPACING), cell, { fill, size }))).join('');
}

export const renderSource = (lines: readonly string[], band: Band, theme: Theme, fill: string): string =>
  renderMonoLines(lines, band, { size: theme.metrics.textSize, fill, spacing: SPACING });

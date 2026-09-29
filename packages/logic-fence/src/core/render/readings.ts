import type { Readings } from '../model/cursors.ts';
import { linesSize, renderLines, renderTable, tableLines, tableSize } from './mono.ts';
import type { Band, Size } from './mono.ts';
import type { Theme } from './theme.ts';

/**
 * 読み値の帯。**見出し 1 行 → カーソルの表** (`信号 / X1 / X2`、2 つなら ΔX の行)。
 * 実測 (`data:`) はまだ無いので、見出しはいつも「計算」。
 */
export const HEADING = '読み値 — カーソル';

const partsOf = (readings: Readings): { readonly heading: readonly string[]; readonly rows: Readings['rows'] } =>
  ({ heading: readings.rows.length === 0 ? [] : [HEADING], rows: readings.rows });

export function readingsSize(readings: Readings, theme: Theme): Size | null {
  const parts = partsOf(readings);
  const heading = linesSize(parts.heading, theme);
  const table = tableSize(parts.rows, theme);
  const height = heading.height + table.height;
  return height === 0 ? null : { width: Math.max(heading.width, table.width), height };
}

export function renderReadings(readings: Readings, band: Band, theme: Theme): string {
  const parts = partsOf(readings);
  const heading = linesSize(parts.heading, theme);
  return renderLines(parts.heading, { ...band, height: heading.height }, theme, theme.palette.caption)
    + renderTable(parts.rows, { x: band.x, y: band.y + heading.height, width: band.width, height: band.height - heading.height }, theme);
}

/** 読み値を字の行に (CLI・playground)。**図の帯と同じ見出しと並び**。 */
export function readingLinesOf(readings: Readings): readonly string[] {
  const parts = partsOf(readings);
  return [...parts.heading, ...tableLines(parts.rows)];
}

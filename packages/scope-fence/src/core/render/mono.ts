import {
  keptSourceLines, monoLinesSize, monoTableLines, monoTableSize, renderMonoLines, renderMonoTable,
} from 'fence-kit';
import type { MonoBand, MonoSize, MonoSpacing } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import { widthOf } from './errorText.ts';
import type { Theme } from './theme.ts';

/**
 * 図の下の帯 — 読み値の表と書き出し (`- source`)。**組み方は fence-kit の `mono.ts`**
 * (vna と同じ行送り 1.35・余白 6。表を読む帯なのでブレッドボードとユニバーサル基板より広い)。
 */
const SPACING: MonoSpacing = { leading: 1.35, pad: 6 };

export type Band = MonoBand;
export type Size = MonoSize;

/** 書き出す行。**囲みごと**写す (図だけを貼られた人が、同じ図をもう一度出せる)。 */
export function sourceListing(source: string): readonly string[] {
  const kept = keptSourceLines(source, LIMITS.sourceLines).map((line) => clampText(line, LIMITS.sourceLineLength));
  return ['```scope', ...kept, '```'];
}

export const linesSize = (lines: readonly string[], theme: Theme): Size =>
  monoLinesSize(lines, theme.metrics.smallSize, SPACING);

export const renderLines = (lines: readonly string[], band: Band, theme: Theme, fill: string): string =>
  renderMonoLines(lines, band, { size: theme.metrics.smallSize, fill, spacing: SPACING });

/** 表を字の行に直す (CLI と同じ並び)。**端末の桁で揃える** (全角は 2 桁)。 */
export const tableLines = (rows: readonly (readonly string[])[]): readonly string[] => monoTableLines(rows, widthOf);

export const tableSize = (rows: readonly (readonly string[])[], theme: Theme): Size =>
  monoTableSize(rows, theme.metrics.smallSize, SPACING);

/** 表を描く。**1 行目は見出し** (字の色を落とす)。 */
export const renderTable = (rows: readonly (readonly string[])[], band: Band, theme: Theme): string =>
  renderMonoTable(rows, band, {
    size: theme.metrics.smallSize, head: theme.palette.label, body: theme.palette.caption, spacing: SPACING,
  });

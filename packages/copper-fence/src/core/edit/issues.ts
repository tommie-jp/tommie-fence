import { escapeMarkup, normalizeNewlines, renderIssues } from 'fence-kit';
import { parseFence } from '../parser/parseFence.ts';
import { resolveStyle } from '../render/theme.ts';
import type { IssueRow } from 'fence-kit';
import { renderCopper } from '../index.ts';
import { errorLine, sourceRows } from '../render/errorText.ts';
import type { FenceError } from '../types.ts';

/**
 * 帯と Problems の行。**プレビューの帯と同じものを通す** (2 か所で数えると食い違う)。
 * perfboard の `edit/issues.ts` と同じ形。
 */
const snippetOf = (error: FenceError): string => {
  const rows = sourceRows(error);
  return rows.length === 0 ? '' : `<pre class="cf-snippet">${escapeMarkup(rows.join('\n'))}</pre>`;
};

const rowOf = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({
  kind, line: error.line, text: errorLine(error), snippet: snippetOf(error),
});

/** `style: debug: off` の図はお知らせを出さない (帯と同じ)。 */
const noticesShown = (source: string): boolean =>
  resolveStyle(parseFence(normalizeNewlines(source)).doc.style).debug;

export function issuesOf(source: string, fenceLine = 0): readonly IssueRow[] {
  const { errors, notices } = renderCopper(source, { offset: fenceLine });
  return [...errors.map(rowOf('error')), ...(noticesShown(source) ? notices : []).map(rowOf('notice'))];
}

export function ercView(source: string, fenceLine = 0): { readonly count: number; readonly html: string } {
  const rows = renderCopper(source, { offset: fenceLine }).erc.map(rowOf('erc'));
  return { count: rows.length, html: renderIssues(rows) };
}

/** Problems パネルの行。**文面に行番号も名札も付けない** (Problems は別の欄に出す)。 */
export function problemsOf(source: string, fenceLine: number, want: { readonly erc: boolean }): readonly IssueRow[] {
  const { errors, notices, erc } = renderCopper(source, { offset: fenceLine });
  const plain = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({ kind, line: error.line, text: error.message });
  return [
    ...errors.map(plain('error')),
    ...(noticesShown(source) ? notices : []).map(plain('notice')),
    ...(want.erc ? erc.map(plain('erc')) : []),
  ];
}

import type { IssueRow } from 'fence-kit';
import { renderVna } from './index.ts';
import type { DataSource } from './index.ts';
import { parseFence } from './parser/parseFence.ts';
import { resolveStyle } from './render/theme.ts';
import { normalizeNewlines } from 'fence-kit';
import type { FenceError } from './types.ts';

/**
 * Problems パネルの行 (拡張の `collectProblems` が呼ぶ)。**vna にはマップ (殻) が
 * 無い**ので、`FenceEditor` を作らずにこの 1 つだけを渡す (52 の docs/76)。
 * 文面に行番号も名札も付けない (Problems は別の欄に出す)。ERC は持たない。
 */
export function problemsOf(
  source: string,
  fenceLine: number,
  _want: { readonly erc: boolean },
  data?: DataSource,
): readonly IssueRow[] {
  const { errors, notices } = renderVna(source, { offset: fenceLine, ...(data === undefined ? {} : { data }) });
  const shown = resolveStyle(parseFence(normalizeNewlines(source)).doc.style).debug;
  const plain = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({ kind, line: error.line, text: error.message });
  return [...errors.map(plain('error')), ...(shown ? notices : []).map(plain('notice'))];
}

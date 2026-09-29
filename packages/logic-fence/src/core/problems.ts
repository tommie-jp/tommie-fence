import type { IssueRow } from 'fence-kit';
import { renderLogic } from './index.ts';
import { parseFence } from './parser/parseFence.ts';
import { resolveStyle } from './render/theme.ts';
import { normalizeNewlines } from 'fence-kit';
import type { FenceError } from './types.ts';

/**
 * Problems パネルの行 (拡張の `collectProblems` が呼ぶ)。**logic にはマップ (殻) が
 * 無い**ので、`FenceEditor` を作らずにこの 1 つだけを渡す (vna・scope・spectrum と同じ)。
 * 文面に行番号も名札も付けない (Problems は別の欄に出す)。ERC は持たない。
 */
export function problemsOf(
  source: string,
  fenceLine: number,
  _want: { readonly erc: boolean },
): readonly IssueRow[] {
  const { errors, notices } = renderLogic(source, { offset: fenceLine });
  const shown = resolveStyle(parseFence(normalizeNewlines(source)).doc.style).debug;
  const plain = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({ kind, line: error.line, text: error.message });
  return [...errors.map(plain('error')), ...(shown ? notices : []).map(plain('notice'))];
}

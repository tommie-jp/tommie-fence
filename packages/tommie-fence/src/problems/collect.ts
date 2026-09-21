import { extractFences } from 'fence-kit';
import type { FenceEditor, IssueRow } from 'fence-kit';

/**
 * Problems パネルの 1 行 (vscode を知らない形)。`diagnostics.ts` が写す。
 */
export type Problem = {
  /** どのフェンスが言ったか (Problems の「コード」の欄に出す)。 */
  readonly language: string;
  /** Markdown の行 (1 始まり)。 */
  readonly line: number;
  readonly kind: IssueRow['kind'];
  /** 行番号の付かない文面。 */
  readonly message: string;
};

/**
 * 文書の字から Problems の行を集める (52 の docs/57)。
 *
 * **フェンスの切り出しは fence-kit の `extractFences`** — `FenceEditor` には
 * 本文つきの一覧が無い (`fences` は題の札だけ)。切り出しの規則は 1 つなので、
 * 口を増やさずにそれを通す。行のずらし方と文面はフェンスの側
 * (`FenceEditor.problems`) が持つ。
 *
 * **行の分からない報告は開き記号の行に付ける。** 帯は押しても飛ばない行を
 * 嫌って行を持たせないが、Problems は行が無いと載せられない。黙って捨てない。
 */
export function collectProblems(
  markdown: string,
  editors: readonly FenceEditor[],
  want: { readonly erc: boolean },
): readonly Problem[] {
  return editors.flatMap((editor) => extractFences(markdown, editor.language).flatMap((block) =>
    (editor.problems?.(block.source, block.line, want) ?? []).map((row) => ({
      language: editor.language,
      line: row.line ?? block.line,
      kind: row.kind,
      message: row.text,
    }))));
}

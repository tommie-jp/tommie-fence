import { escapeMarkup } from 'fence-kit';
import type { IssueRow } from 'fence-kit';
import { errorLine, sourceRows } from '../render/errorText.ts';
import { renderPerfboard } from '../index.ts';
import type { FenceError } from '../types.ts';

/**
 * マップの下の帯に出す、読めなかったところとお知らせ。
 *
 * **並べ方は fence-kit** (行の目印・件数の頭打ち・webview の class)。
 * ここが作るのは**文面と、読めなかった行の見せ方**だけ — 言い回しも
 * 桁の数え方もフェンスごとに違う (こちらは全角を 2 桁と数える。約束 3)。
 */

/** 行の中身と印。**プレビューと同じものを通す** (2 か所で数えると食い違う)。 */
const snippetOf = (error: FenceError): string => {
  const rows = sourceRows(error);
  return rows.length === 0 ? '' : `<pre class="cf-snippet">${escapeMarkup(rows.join('\n'))}</pre>`;
};

const rowOf = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({
  kind,
  line: error.line,
  text: errorLine(error),
  snippet: snippetOf(error),
});

/**
 * フェンス本文の読めなかったところとお知らせ。行はフェンスの中の行 (1 始まり)。
 *
 * **ERC はここに出さない** (52 の docs/55 — 下の `ercOf`)。この板は全穴が
 * 独立していて繋ぎ忘れが足 1 本ごとに出るので、作業の途中はほとんどが
 * 「まだつないでいない」になる。**帯が中間状態で埋まると、直す場所のある
 * 報告がそこに埋もれる。** 当たり判定 (胴の重なり) はこちらに残る —
 * 置いたその場で直す間違いで、中間状態ではない。
 */
export function issuesOf(source: string): readonly IssueRow[] {
  const { errors, notices } = renderPerfboard(source);

  return [...errors.map(rowOf('error')), ...notices.map(rowOf('notice'))];
}

/**
 * ERC — **そのとおりに組んでも動かない**ところ。帯の「検査 N」の釦の向こうに
 * 畳むので、`issuesOf` とは別に取り出す。`style: check: off` の図では空。
 */
export function ercOf(source: string): readonly IssueRow[] {
  return renderPerfboard(source).erc.map(rowOf('erc'));
}

/**
 * フェンスの中の行を Markdown の行へずらす。押すとその行へ飛べるようにするため。
 * **行の分からないものはそのまま** (足すと嘘の行を指す)。
 */
export const shiftIssues = (issues: readonly IssueRow[], offset: number): readonly IssueRow[] =>
  issues.map((issue) => (issue.line === null ? issue : { ...issue, line: issue.line + offset - 1 }));

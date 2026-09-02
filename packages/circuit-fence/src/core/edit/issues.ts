import { renderIssues as renderBand } from 'fence-kit';
import type { IssueRow } from 'fence-kit';
import { shiftError } from '../errors.ts';
import { compileCircuit } from '../index.ts';
import { messageLine, snippetHtml } from '../render/errorCard.ts';
import type { FenceError } from '../types.ts';

/**
 * マップの下に出す**読めなかったところとお知らせ**。core の純関数なので
 * そのままテストに掛かる (設計上の約束 1)。
 *
 * **なぜマップにも要るか。** 図の下の帯はプレビューにしか出ない。マップで
 * 掴んで動かしている間はプレビューが隠れていることが多く、そこで足した
 * 部品や配線の間違いに気づく手立てが無かった。**編集はどれも間違いを生む**
 * ので、直す場所を編集する場所と同じ窓に出す。
 *
 * 帯の markup をプレビューの `renderErrorBanner` と分けてあるのは、
 * **行をクリックしてエディタへ飛べる**ようにするため (`data-line`) と、
 * webview 側の色 (`--vscode-*`) を使うため。**中身は 1 つずつ向こうを通す** —
 * 文面 (`messageLine`)、行のずらし (`shiftError`)、読めなかった行の中身と
 * 印の位置 (`snippetHtml`)。2 か所で数えると、片方だけ直したときに黙って
 * 食い違う (相手の行がずれないまま出ていたのが実際に踏まれた)。
 * こちらに残るのは**並べ方だけ** — 行の目印、種類ごとの色、並べる件数。
 */

/** 読めなかったところ 1 件と、それがエラーかお知らせか。 */
export type Issue = {
  /** `error` は読めなかったところ。`notice` は読めたが思ったとおりには出ないもの。 */
  readonly kind: 'error' | 'notice';
  readonly error: FenceError;
};

/**
 * フェンス本文の読めなかったところとお知らせ。行はフェンスの中の行 (1 始まり)。
 *
 * **お知らせは `style: debug: off` で伏せられる** (図の下の帯と同じ規則)。
 * 読めなかった行は伏せられない — 伏せると直せるはずの間違いに気づけなくなる。
 */
export function issuesOf(source: string): readonly Issue[] {
  const { errors, notices, debug } = compileCircuit(source);
  return [
    ...errors.map((error) => ({ kind: 'error' as const, error })),
    ...(debug ? notices.map((error) => ({ kind: 'notice' as const, error })) : []),
  ];
}

/**
 * フェンスの中の行を Markdown の行へずらす。**ずらし方はプレビューと同じ
 * ものを通す** (`shiftError`) — こちらは `Issue` で包んだまま運ぶだけ。
 * 自前で数えると、相手の行 (related) のように片方だけ置き去りになる。
 * 行の分からないものはそのまま (足すと嘘の行を指す)。
 */
export const shiftIssues = (issues: readonly Issue[], offset: number): readonly Issue[] =>
  issues.map((issue) => ({ ...issue, error: shiftError(issue.error, offset) }));

/**
 * 帯に並べる形にする。**並べ方 (行の目印・件数の頭打ち) は fence-kit** で、
 * こちらが作るのは文面と、読めなかった行の見せ方だけ。
 * 中身は 1 つずつプレビューと同じものを通す (`messageLine` / `snippetHtml`) —
 * 2 か所で数えると、片方だけ直したときに黙って食い違う。
 */
export const issueRows = (issues: readonly Issue[]): readonly IssueRow[] =>
  issues.map((issue) => ({
    kind: issue.kind,
    line: issue.error.line,
    text: messageLine(issue.error),
    snippet: snippetHtml(issue.error),
  }));

/** マップの下に貼る帯。 */
export const renderIssues = (issues: readonly Issue[]): string => renderBand(issueRows(issues));

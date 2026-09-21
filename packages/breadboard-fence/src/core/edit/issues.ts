import type { IssueRow } from 'fence-kit';
import { escapeXml } from '../render/svg.ts';
import { errorLine } from '../render/errorText.ts';
import { renderBreadboard } from '../index.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { resolveStyle } from '../render/theme.ts';
import type { FenceError } from '../types.ts';

/**
 * マップの下の帯に出す、読めなかったところとお知らせ。
 *
 * **並べ方は fence-kit** (行の目印・件数の頭打ち・webview の class)。
 * ここが作るのは**文面と、読めなかった行の見せ方**だけ — 言い回しも
 * 桁の数え方もフェンスごとに違う。
 */

/** 印の桁を合わせるための、行の中身と `^`。プレビューの `sourceRows` と同じ数え方。 */
function snippetOf(error: FenceError): string {
  const { text, at } = error;
  if (text === undefined) return '';
  if (at === undefined) return `<pre class="cf-snippet">${escapeXml(text)}</pre>`;

  const mark = `${' '.repeat(at.column)}${'^'.repeat(Math.max(1, at.length))}`;
  return `<pre class="cf-snippet">${escapeXml(text)}\n${escapeXml(mark)}</pre>`;
}

/**
 * フェンスの中の行を Markdown の行へずらす。押すとその行へ飛べるようにするため。
 * **行の分からないものはそのまま** (足すと嘘の行を指す)。
 *
 * `fenceLine` は**開き記号の行**なので、中の 1 行目は `fenceLine + 1`。
 * プレビュー (`token.map[0] + 1`) と CLI (`fence.line`) と circuit も同じ足し方。
 *
 * **文面を組む前にずらす** — 文面は「N 行目:」を含むので、組んでからずらすと
 * 帯の字だけがフェンスの中の行を言う (circuit と揃える)。
 */
/**
 * お知らせを出すか (`style: debug: off` で伏せる)。**プレビューの帯と circuit の
 * editor の帯と同じ規則** — 描き手はお知らせを常に返し、伏せるのは出す側の仕事。
 * 読めなかった行は伏せない (伏せると「無かったこと」に化ける)。
 */
const showsNotices = (source: string): boolean =>
  resolveStyle(parseFence(normalizeNewlines(source)).doc.style).style.debug;

const shift = (fenceLine: number) => (error: FenceError): FenceError =>
  (error.line === null ? error : { ...error, line: error.line + fenceLine });

const rowOf = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({
  kind,
  line: error.line,
  text: errorLine(error),
  snippet: snippetOf(error),
});

/**
 * フェンス本文の読めなかったところとお知らせ。行は Markdown の行
 * (`fenceLine` はフェンスの開き記号の行。省けば 0 で、フェンスの中の行のまま)。
 *
 * **お知らせは `style: debug: off` で伏せられる** (図の下の帯と同じ規則)。
 * 読めなかった行は伏せられない — 伏せると直せるはずの間違いに気づけなくなる。
 */
export function issuesOf(source: string, fenceLine = 0): readonly IssueRow[] {
  const { errors, notices } = renderBreadboard(source);
  const at = shift(fenceLine);
  const shown = showsNotices(source) ? notices : [];

  return [...errors.map(at).map(rowOf('error')), ...shown.map(at).map(rowOf('notice'))];
}

/** Problems の 1 行。**文面は本文だけ** — 行も出どころも Problems が別の欄に出す。 */
const problemOf = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({
  kind,
  line: error.line,
  text: error.message,
});

/**
 * Problems パネルの行 (52 の docs/57)。帯と同じもの (`renderBreadboard` の
 * errors と notices) を Markdown の行で。**この板は ERC を持たない**ので、
 * 頼まれても足すものが無い (列が最初から導通していて、繋ぎ忘れが目に留まる)。
 */
export function problemsOf(source: string, fenceLine: number): readonly IssueRow[] {
  const { errors, notices } = renderBreadboard(source);
  const at = shift(fenceLine);
  const shown = showsNotices(source) ? notices : [];

  return [...errors.map(at).map(problemOf('error')), ...shown.map(at).map(problemOf('notice'))];
}

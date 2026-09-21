import { escapeMarkup, normalizeNewlines } from 'fence-kit';
import type { IssueRow } from 'fence-kit';
import { errorLine, sourceRows } from '../render/errorText.ts';
import { renderPerfboard } from '../index.ts';
import { parseFence } from '../parser/parseFence.ts';
import { resolveStyle } from '../render/theme.ts';
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
  resolveStyle(parseFence(normalizeNewlines(source)).doc.style).debug;

const shift = (fenceLine: number) => (error: FenceError): FenceError =>
  (error.line === null ? error : { ...error, line: error.line + fenceLine });

/**
 * フェンス本文の読めなかったところとお知らせ。行は Markdown の行
 * (`fenceLine` はフェンスの開き記号の行。省けば 0 で、フェンスの中の行のまま)。
 *
 * **ERC はここに出さない** (52 の docs/55 — 下の `ercOf`)。この板は全穴が
 * 独立していて繋ぎ忘れが足 1 本ごとに出るので、作業の途中はほとんどが
 * 「まだつないでいない」になる。**帯が中間状態で埋まると、直す場所のある
 * 報告がそこに埋もれる。** 当たり判定 (胴の重なり) はこちらに残る —
 * 置いたその場で直す間違いで、中間状態ではない。
 */
export function issuesOf(source: string, fenceLine = 0): readonly IssueRow[] {
  const { errors, notices } = renderPerfboard(source);
  const at = shift(fenceLine);
  const shown = showsNotices(source) ? notices : [];

  return [...errors.map(at).map(rowOf('error')), ...shown.map(at).map(rowOf('notice'))];
}

/**
 * ERC — **そのとおりに組んでも動かない**ところ。帯の「検査 N」の釦の向こうに
 * 畳むので、`issuesOf` とは別に取り出す。`style: check: off` の図では空。
 */
export function ercOf(source: string, fenceLine = 0): readonly IssueRow[] {
  return renderPerfboard(source).erc.map(shift(fenceLine)).map(rowOf('erc'));
}

/** Problems の 1 行。**文面は本文だけ** — 行も出どころも Problems が別の欄に出す。 */
const problemOf = (kind: IssueRow['kind']) => (error: FenceError): IssueRow => ({
  kind,
  line: error.line,
  text: error.message,
});

/**
 * Problems パネルの行 (52 の docs/57)。帯と同じもの (errors と notices、
 * 頼まれたら `erc`) を Markdown の行で。**1 回描いて 3 つとも取る**
 * (帯は `issuesOf` と `ercOf` で 2 回描いている)。
 */
export function problemsOf(source: string, fenceLine: number, want: { readonly erc: boolean }): readonly IssueRow[] {
  const { errors, notices, erc } = renderPerfboard(source);
  const at = shift(fenceLine);
  const shown = showsNotices(source) ? notices : [];

  return [
    ...errors.map(at).map(problemOf('error')),
    ...shown.map(at).map(problemOf('notice')),
    ...(want.erc ? erc.map(at).map(problemOf('erc')) : []),
  ];
}

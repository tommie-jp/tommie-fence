import { element, escapeMarkup } from 'fence-kit';
import { markRange } from '../errors.ts';
import { compileCircuit } from '../index.ts';
import { messageLine } from '../render/errorCard.ts';
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
 * webview 側の色 (`--vscode-*`) を使うため。文面の組み立て (`messageLine`) と
 * 印の位置 (`markRange`) は**あちらと同じものを通す** — 2 か所で数えると、
 * 片方だけ直したときに黙って食い違う。
 */

/** 読めなかったところ 1 件と、それがエラーかお知らせか。 */
export type Issue = {
  /** `error` は読めなかったところ。`notice` は読めたが思ったとおりには出ないもの。 */
  readonly kind: 'error' | 'notice';
  readonly error: FenceError;
};

/**
 * 並べる件数。**帯が伸びてマップを押し出さない**ように頭を打つ
 * (1 件が行の中身も出すので 2〜3 行を使う)。溢れた数は最後に出す。
 */
const MAX_SHOWN = 12;

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
 * フェンスの中の行を Markdown の行へずらす。**プレビューと同じ手口**
 * (`shiftErrors`) だが、こちらは `Issue` を包んだまま運ぶ。
 * 行の分からないものはそのまま (足すと嘘の行を指す)。
 */
export const shiftIssues = (issues: readonly Issue[], offset: number): readonly Issue[] =>
  issues.map((issue) => ({
    ...issue,
    error: issue.error.line === null ? issue.error : { ...issue.error, line: issue.error.line + offset },
  }));

/**
 * 読めなかった行の中身。**行番号だけでは照らす先がない** — マップを見ている
 * 間はフェンスの字が視界に無い。他人の書いた字なので、`<mark>` の前後も中も
 * 1 つずつエスケープを通す (組み立ててから通すと `<mark>` 自身が消える)。
 */
function snippet(error: FenceError): string {
  const { text } = error;
  if (text === undefined) return '';

  const range = markRange(error);
  const body = range === null
    ? escapeMarkup(text)
    : escapeMarkup(text.slice(0, range[0]))
      + element('mark', {}, escapeMarkup(text.slice(range[0], range[1])))
      + escapeMarkup(text.slice(range[1]));
  return element('code', {}, body);
}

/**
 * 帯 1 件。**行が分かっているものだけがクリックできる** (`data-line`)。
 * 分からないものに手掛かりを付けると、押しても何も起きない行ができる。
 */
const row = (issue: Issue): string =>
  element(
    'li',
    {
      class: `cf-issue cf-${issue.kind}`,
      ...(issue.error.line === null ? {} : { 'data-line': issue.error.line }),
    },
    escapeMarkup(messageLine(issue.error)) + snippet(issue.error),
  );

/** マップの下に貼る帯。言うことが無ければ何も出さない。 */
export function renderIssues(issues: readonly Issue[]): string {
  if (issues.length === 0) return '';

  const shown = issues.slice(0, MAX_SHOWN).map(row);
  const rest = issues.length > MAX_SHOWN
    ? [element('li', { class: 'cf-issue' }, `ほかに ${issues.length - MAX_SHOWN} 件`)]
    : [];
  return element('ul', { class: 'cf-issues' }, [...shown, ...rest].join(''));
}

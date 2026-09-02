import { element, escapeMarkup } from '../markup.ts';

/**
 * マップの下に出す帯。**読めなかったところと、お知らせ**を並べる。
 *
 * **なぜマップにも要るか。** 図の下の帯はプレビューにしか出ない。マップで
 * 掴んで動かしている間はプレビューが隠れていることが多く、そこで足した
 * 部品や配線の間違いに気づく手立てが無かった。**編集はどれも間違いを生む**
 * ので、直す場所を編集する場所と同じ窓に出す。
 *
 * ここが持つのは**並べ方だけ** — 行の目印 (`data-line`)、種類ごとの印、
 * 並べる件数。文面と、読めなかった行の見せ方は**フェンスが作って渡す**
 * (エラーの言い回しも、桁の数え方も、フェンスごとに違うため)。
 */

/** 帯に並べる 1 件。 */
export type IssueRow = {
  /** `error` は読めなかったところ。`notice` は読めたが思ったとおりには出ないもの。 */
  readonly kind: 'error' | 'notice';
  /**
   * Markdown の行 (1 始まり)。**分からなければ null** —
   * 手掛かりを付けると、押しても何も起きない行ができる。
   */
  readonly line: number | null;
  /** 1 行の文面 (エスケープ前の素の字)。 */
  readonly text: string;
  /** 読めなかった行の中身と印。**エスケープ済みの markup** で渡す。無ければ空。 */
  readonly snippet?: string;
};

/**
 * 並べる件数。**帯が伸びてマップを押し出さない**ように頭を打つ
 * (1 件が行の中身も出すので 2〜3 行を使う)。溢れた数は最後に出す。
 *
 * 図の下の帯より多いのは**わざと** — あちらは図のすぐ下に割り込むので
 * 短いほうがよく、こちらは直すための窓なので、一度に見えるほど直しやすい。
 */
const MAX_SHOWN = 12;

/** 帯 1 件。**行が分かっているものだけがクリックできる**。 */
const row = (issue: IssueRow): string =>
  element(
    'li',
    {
      class: `cf-issue cf-${issue.kind}`,
      ...(issue.line === null ? {} : { 'data-line': issue.line }),
    },
    escapeMarkup(issue.text) + (issue.snippet ?? ''),
  );

/** マップの下に貼る帯。言うことが無ければ何も出さない。 */
export function renderIssues(issues: readonly IssueRow[]): string {
  if (issues.length === 0) return '';

  const shown = issues.slice(0, MAX_SHOWN).map(row);
  const rest = issues.length > MAX_SHOWN
    ? [element('li', { class: 'cf-issue' }, `ほかに ${issues.length - MAX_SHOWN} 件`)]
    : [];
  return element('ul', { class: 'cf-issues' }, [...shown, ...rest].join(''));
}

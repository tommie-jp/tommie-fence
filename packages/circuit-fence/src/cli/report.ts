import { errorLine, messageLine, snippetLines } from '../core/index.ts';
import type { FenceError } from '../core/index.ts';

/**
 * CLI が言うこと。**言うことは全部標準エラー、見出しとネットリストは標準出力**
 * — 板の 2 つのフェンスと同じ分け方で、`2>/dev/null` でネットリストだけを取れる。
 */

/** 標準エラーへ出す 1 行。どのコマンドが言っているかが分かるよう名札を付ける。 */
export const reportProblem = (message: string): void => console.error(`circuit: ${message}`);

export const reportErrors = (errors: readonly FenceError[]): void => {
  // errorLine が名札を持っているので、ここでは字下げだけして並べる。
  // 続けて出す行の中身も同じだけ字下げして、1 件のかたまりに見せる。
  for (const error of errors) {
    console.error(`  ${errorLine(error)}`);
    for (const row of snippetLines(error)) console.error(`  ${row}`);
  }
};

/**
 * 図が描けたうえでの補足。読めなかったわけではないので終了コードには数えない。
 * **出す先は読めなかった行と同じ標準エラー** (前は標準出力で、文法リファレンスの
 * 「標準エラーへ」と食い違っていた)。
 *
 * `style: debug: off` と書いた図では出さない。ただし**それに従うのは
 * 描く道だけ** — `check` は文法を調べに行くために回すものなので、
 * 黙らせる指定より「見つけたことは言う」を優先する (最後の網になる)。
 */
export const reportNotices = (notices: readonly FenceError[], show = true): void => {
  if (!show) return;
  for (const notice of notices) {
    console.error(`  お知らせ: ${messageLine(notice)}`);
    for (const row of snippetLines(notice)) console.error(`  ${row}`);
  }
};

/**
 * `check` の見出し。**読めなかった行があるのに「読めました」と言わない** —
 * 読めなかった行は標準エラーに出るので、標準出力だけを見る人には見出しが頼り。
 */
export const checkHeading = (label: string, unread: number): string =>
  unread === 0 ? `${label}: 読めました` : `${label}: ${unread} 件読めませんでした`;

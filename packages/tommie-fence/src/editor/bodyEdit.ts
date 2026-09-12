/**
 * フェンスの本文を丸ごと書き戻すときの、当てる場所と字。
 *
 * **vscode を知らない**ので、そのまま試験に掛かる (`vscodePort.ts` は
 * ここが返したものを vscode の `Range` / `Position` へ移すだけ)。
 * 行も桁も 0 始まり — vscode の数え方に合わせてある。
 */

export type Place = { readonly line: number; readonly column: number };

export type BodyEdit =
  | { readonly kind: 'replace'; readonly from: Place; readonly to: Place; readonly text: string }
  | { readonly kind: 'insert'; readonly at: Place; readonly text: string };

/** 当てる先の文書。行数と、行の長さだけ分かればよい。 */
export type DocShape = {
  readonly lineCount: number;
  readonly lengthOf: (line: number) => number;
};

/**
 * `fenceLine` は開き記号の行 (1 始まり) = **本文の最初の行 (0 始まり)**。
 * `count` は本文の行数。範囲の外なら null を返す (呼ぶ側は断る)。
 *
 * **本文が 0 行のフェンスにも書ける。** 入れ替える範囲が無いだけで、
 * 書き足せないわけではない (空のフェンスに最初の 1 つを置くとき)。
 */
export function bodyEdit(
  document: DocShape,
  fenceLine: number,
  count: number,
  body: readonly string[],
  eol: string,
): BodyEdit | null {
  const { lineCount } = document;
  if (count < 0 || fenceLine < 0 || fenceLine > lineCount || fenceLine + count > lineCount) return null;

  const text = body.join(eol);
  if (count > 0) {
    const last = fenceLine + count - 1;
    return {
      kind: 'replace',
      from: { line: fenceLine, column: 0 },
      to: { line: last, column: document.lengthOf(last) },
      text,
    };
  }

  // 改行だけを書き込むと、フェンスに空行が 1 つ増えるだけで何も足せていない。
  if (body.length === 0 || lineCount === 0) return null;

  // **閉じ記号が無く、開き記号が最終行のとき**は次の行が無い。行頭を指すと
  // 文書の外になり、vscode は行末へ丸めるので開き記号の行に繋がってしまう
  // (` ```perfboardboard: 25x15 `)。その行の末尾へ、改行を先に付けて足す。
  if (fenceLine >= lineCount) {
    const last = lineCount - 1;
    return { kind: 'insert', at: { line: last, column: document.lengthOf(last) }, text: `${eol}${text}` };
  }

  // 閉じ記号の行頭へ足す。末尾の改行が閉じ記号を次の行へ送る。
  return { kind: 'insert', at: { line: fenceLine, column: 0 }, text: `${text}${eol}` };
}

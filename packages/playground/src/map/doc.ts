import type { Change, DocLike } from 'fence-kit';

/**
 * **テキスト欄の全文を、殻に渡す「文書」に見せる。**
 *
 * 殻 (fence-kit の `session.ts`) は Markdown の文書を相手にする作りで、
 * フェンスの開き記号の行から本文の行を数える。頁が持っているのも
 * **同じ Markdown の全文**なので、そのまま行に割って渡せばよい
 * (52 の docs/43)。**書き換えの経路は拡張と 1 本**になる。
 *
 * かつては「フェンス 1 本を記号で挟んだ偽の文書」を組んでいた。頁が
 * 持っているのがフェンスの本文だけだったころの形で、いまは要らない。
 */

/** 頁の中の文書はこれ 1 つ。殻は URI で文書を引き直す。 */
export const DOC_URI = 'playground:doc';

/**
 * いまの全文を見せ続ける文書。**中身を持たない** — 呼ばれるたびに
 * `text()` から組み直す。持つと、書き換えたあとに古い姿を配り続ける
 * (殻は文書を覚えていて、あとから何度でも読み直す)。
 */
export function docOver(text: () => string): DocLike {
  const lines = (): string[] => text().split('\n');
  return {
    uri: { toString: () => DOC_URI },
    getText: () => text(),
    get lineCount(): number {
      return lines().length;
    },
    lineAt: (line: number) => {
      const found = lines()[line];
      // vscode も範囲の外は投げる。黙って空行を返すと、ずれたまま書き換える。
      if (found === undefined) throw new Error(`${line} 行目はありません`);
      return { text: found };
    },
  };
}

/**
 * 書き換えを当てる。**当てる前に、そこにある字が控えと合うか確かめる**
 * (合わなければ null。拡張の `applyChanges` と同じ約束)。
 *
 * 同じ行に 2 か所あるときは**右から**当てる。控えの桁は当てる前のものなので、
 * 左から当てると、先に伸びた分だけ右の桁がずれる。
 */
export function applyChanges(lines: readonly string[], changes: readonly Change[]): string[] | null {
  const out = [...lines];
  const ordered = [...changes].sort((a, b) => b.line - a.line || b.from.column - a.from.column);

  for (const change of ordered) {
    const line = out[change.line];
    if (line === undefined) return null;

    const { column, text } = change.from;
    if (line.slice(column, column + text.length) !== text) return null;
    out[change.line] = line.slice(0, column) + change.to.text + line.slice(column + text.length);
  }
  return out;
}

/**
 * 本文を丸ごと書き戻す (戻す・やり直す)。範囲の外は断る。
 *
 * **0 行は断らない。** 本文が空のフェンス (` ```perfboard ` の次が閉じ記号) は
 * 入れ替える行が無いだけで、書き足せないわけではない。断っていたころは
 * 空のフェンスに最初の 1 つを置けず、「書き換えられませんでした」で終わっていた
 * (52 の docs/54)。
 */
export function replaceLines(
  lines: readonly string[],
  from: number,
  count: number,
  body: readonly string[],
): string[] | null {
  if (count < 0 || from < 0 || from > lines.length || from + count > lines.length) return null;
  return [...lines.slice(0, from), ...body, ...lines.slice(from + count)];
}

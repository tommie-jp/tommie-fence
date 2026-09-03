import type { Change, DocLike } from 'fence-kit';
import type { Kind } from '../kinds.ts';

/**
 * **テキスト欄 1 つを「フェンスが 1 つだけ書かれた Markdown」に見せる。**
 *
 * マップの殻 (fence-kit の `session.ts`) は Markdown の文書を相手にする作りで、
 * フェンスの開き記号の行から本文の行を数える。頁が持っているのは本文だけ
 * なので、前後に記号の行を足した文書をその場で組んで渡す。
 * これで**書き換えの経路を 1 行も変えずに**同じ殻が使える。
 */

/** 頁の中の文書はこれ 1 つ。殻は URI で文書を引き直す。 */
export const DOC_URI = 'playground:fence';

/** 開き記号が 0 行目なので、本文は 1 行目から (fence-kit は 1 始まりで数える)。 */
export const FENCE_LINE = 1;

/** 本文を、記号の行で挟んだ文書の行にする。 */
export const linesOf = (kind: Kind, body: string): string[] => [
  `\`\`\`${kind}`,
  ...body.replace(/\n$/, '').split('\n'),
  '```',
];

/** 文書の行から本文へ戻す。末尾の改行は残す (フェンスの本文はそういう形)。 */
export const bodyOf = (lines: readonly string[]): string => `${lines.slice(1, -1).join('\n')}\n`;

/**
 * いまの本文を見せ続ける文書。**中身を持たない** — 呼ばれるたびに
 * `body()` から組み直す。持つと、書き換えたあとに古い姿を配り続ける
 * (殻は文書を覚えていて、あとから何度でも読み直す)。
 */
export function docOver(kind: Kind, body: () => string): DocLike {
  const lines = (): string[] => linesOf(kind, body());
  return {
    uri: { toString: () => DOC_URI },
    getText: () => lines().join('\n'),
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

/** 本文を丸ごと書き戻す (戻す・やり直す)。範囲の外は断る。 */
export function replaceLines(
  lines: readonly string[],
  from: number,
  count: number,
  body: readonly string[],
): string[] | null {
  if (count <= 0 || from + count > lines.length) return null;
  return [...lines.slice(0, from), ...body, ...lines.slice(from + count)];
}

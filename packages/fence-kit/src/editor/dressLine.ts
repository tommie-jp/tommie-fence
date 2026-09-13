/**
 * 組み直した 1 行に、**書かれていた字下げと行末のコメント**を着せる
 * (52 の docs/54 の段 1)。
 *
 * 中身から本文を組み立てるとき、組み直すのは「何が書いてあるか」だけで、
 * **字下げもコメントも中身には入っていない** (コメントは YAML が値を読む前に
 * 落とす)。書き換えた行でもそこは書かれたまま残す。
 *
 * 3 つのフェンスで同じ数え方をするのでここに置く — 別々に持つと、片方だけ
 * 直したときに黙って食い違う。
 */

/** 行の頭の空白。 */
const indentOf = (line: string): string => /^\s*/.exec(line)?.[0] ?? '';

/**
 * 行末のコメント (` # …`) の始まり。**引用の中は数えない** — `"R1: #1"` の
 * `#` はコメントではない。無ければ -1。
 */
export function commentAt(line: string): number {
  let quote: string | null = null;
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at] as string;
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    // YAML のコメントは行頭か空白の直後だけ。
    if (char === '#' && (at === 0 || /\s/.test(line[at - 1] as string))) return at;
  }
  return -1;
}

/** 書かれた行から字下げと行末のコメントを写して、組み直した行を仕上げる。 */
export function dressLine(written: string, made: string): string {
  const at = commentAt(written);
  const tail = at < 0 ? '' : ` ${written.slice(at).trim()}`;
  return `${indentOf(written)}${made}${tail}`;
}

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

/**
 * 書かれた行の**語の間の空白を残して**、語だけ差し替える。
 *
 * **桁を揃えて書く人がいる** (`R1:  resistor a1 a3` の 2 つめの空白)。値を 1 つ
 * 直しただけで揃えが崩れると、書き換えていない行との並びが狂う。**語の数が
 * 同じなら**、書かれた空白をそのまま使って語だけ入れ替える。
 *
 * 語の数が変わったとき (向きの語が増えた・値が消えた) は諦めて、組み直した行を
 * そのまま返す。**行の形が変わったのだから、揃えも書いた人が直すほうが早い。**
 */
export function keepSpacing(written: string, made: string): string {
  // 語と語の間にあった空白を、頭から順に控える。
  const gaps = written.trim().split(/\S+/).slice(1, -1);
  const words = made.trim().split(/\s+/).filter((one) => one !== '');

  // **語が増えたぶんは 1 つの空白。** 末尾に値を足したときに、それまでの
  // 揃えはそのまま残り、足した語だけが普通に続く (いまの当て方と同じ)。
  return words.reduce((line, word, at) => `${line}${at === 0 ? '' : gaps[at - 1] ?? ' '}${word}`, '');
}

/**
 * 書かれた行から**字下げ・語の間の空白・行末のコメント**を写して、
 * 組み直した行を仕上げる。中身に入っていないものは、書かれた行から持ってくる。
 */
export function dressLine(written: string, made: string): string {
  const at = commentAt(written);
  const body = at < 0 ? written : written.slice(0, at);
  // **コメントの前の空白も書かれたまま。** ここで詰めると、コメントを縦に
  // 揃えて書いた人の並びが崩れる。
  const gap = at < 0 ? '' : (/\s*$/.exec(body)?.[0] ?? ' ') || ' ';
  const tail = at < 0 ? '' : `${gap}${written.slice(at).trimEnd()}`;
  return `${indentOf(written)}${keepSpacing(body, made)}${tail}`;
}

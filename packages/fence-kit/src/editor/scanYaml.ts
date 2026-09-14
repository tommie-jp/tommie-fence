/**
 * 行を字面のまま読み進めて、**引用符の中か・フロー形式の括弧の深さ・コメントの始まり**
 * を追う。fence-kit は YAML を読めない約束なので、欄を書き換える範囲を決める側
 * (`entry.ts`) とコメントを避ける側 (`dressLine.ts`) がこれを使う。
 *
 * YAML の規則のうち、**書き換えを壊すのに効くものだけ**を真似る。
 *
 * - 引用符は**値の頭にあるときだけ**引用符。`resistor a1 a3 'x` の `'` や `l="x` の `"` は
 *   ただの字 (プレーンスカラーの途中)。引用符と取ると後ろの `,` や `#` を飲み込む
 * - `{` `[` はブロック形式では**値の頭にあるときだけ**フロー形式を開く。`a1 {x}` は字
 * - フロー形式の中では `{` `}` `[` `]` `,` はいつも区切り (プレーンスカラーに書けない)
 * - `#` は行頭か空白の直後で、引用符の外にあるときだけコメント
 */

/** 行をまたいで持ち越すもの。引用符は複数行にまたがれる。 */
export type YamlState = { readonly depth: number; readonly quote: '"' | "'" | null };

export const YAML_START: YamlState = { depth: 0, quote: null };

export type ReadLine = {
  /** 行を読み終えた後の状態。 */
  readonly after: YamlState;
  /** 桁ごとの、その字を読む**前**の括弧の深さ。 */
  readonly depths: readonly number[];
  /** 桁ごとに、引用符の中 (開きの引用符そのものは外) か。 */
  readonly quoted: readonly boolean[];
  /** コメントの始まりの桁。無ければ行の長さ。 */
  readonly comment: number;
};

/** その字の後ろに値の頭が来るか。空白を飛ばした前の字で決める。 */
const opensValue = (previous: string | null, depth: number): boolean =>
  previous === null || (depth > 0 ? '{[,:' : ':-').includes(previous);

export function readYamlLine(text: string, state: YamlState): ReadLine {
  let { depth, quote } = state;
  const depths: number[] = [];
  const quoted: boolean[] = [];
  let previous: string | null = null;

  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string;
    depths.push(depth);

    if (quote !== null) {
      quoted.push(true);
      const escaped = quote === '"' && char === '\\';
      const doubled = quote === "'" && char === "'" && text[at + 1] === "'";
      if (escaped || doubled) {
        // 次の字は引用符の中身として読み飛ばす。
        at += 1;
        depths.push(depth);
        quoted.push(true);
      } else if (char === quote) {
        quote = null;
        previous = char;
      }
      continue;
    }

    if (char === '#' && (at === 0 || /\s/.test(text[at - 1] as string))) {
      depths.pop();
      return { after: { depth, quote }, depths, quoted, comment: at };
    }
    quoted.push(false);
    if (/\s/.test(char)) continue;

    const atHead = opensValue(previous, depth);
    if ((char === '"' || char === "'") && atHead) quote = char;
    else if ((char === '{' || char === '[') && (depth > 0 || atHead)) depth += 1;
    else if ((char === '}' || char === ']') && depth > 0) depth -= 1;
    previous = char;
  }
  return { after: { depth, quote }, depths, quoted, comment: text.length };
}

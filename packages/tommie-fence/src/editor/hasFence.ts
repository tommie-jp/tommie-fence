import { extractFences } from 'fence-kit';

/**
 * その Markdown に、この拡張が描くフェンスが 1 つでもあるか。題の右の釦を
 * 出すかどうかに使う (52 の docs/57)。
 *
 * **切り出しは fence-kit の規則そのもの** — 開き記号の行だけを別に見る手も
 * あるが、そうすると規則が 2 つになり、「図にならないのに釦が出る」
 * (ほかのコードブロックの中の ```circuit) が起きる。1 回の走査で済むので重くない。
 */
export const hasFence = (markdown: string, languages: readonly string[]): boolean =>
  languages.some((language) => extractFences(markdown, language).length > 0);

/**
 * 文書のいちばん上のフェンスの**本文の 1 行目** (1 始まり)。無ければ null。
 *
 * 題の釦を押したときの落ち先。カーソルがフェンスの外にあると、横に開くパネルは
 * 何を映すか決められない (カーソルを追うのがパネルの本領 — 52 の docs/19)。
 * 釦を押した人に「カーソルを置いてから」と返しても役に立たないので、
 * 最初のフェンスへカーソルを移して開く。
 */
export function firstFenceBodyLine(markdown: string, languages: readonly string[]): number | null {
  const openings = languages.flatMap((language) => extractFences(markdown, language).slice(0, 1).map((one) => one.line));
  return openings.length === 0 ? null : Math.min(...openings) + 1;
}

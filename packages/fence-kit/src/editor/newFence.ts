/**
 * フェンスが 1 本も無い文書に、空のフェンスを 1 本足す
 * (52 の docs/54 の決め 7 — **置いた瞬間に作る**)。
 *
 * **足すだけで、書いてある字は 1 字も消さない。** 末尾の空行を畳んだり
 * 詰めたりすると、頼まれていない書き換えが混じる。置き場が文書の終わりなのは、
 * 散文の途中へ割り込むと書き手が読んでいた並びが変わるため
 * (頁にカーソルは無く、カスタムエディタのタブにも無い)。
 */

export type NewFence = {
  /** 文書の終わりへ足す字。**間を空けるための改行も含む。** */
  readonly added: string;
  /** 足したあとの、開き記号の行 (1 始まり)。殻はこの行でフェンスに結び付く。 */
  readonly line: number;
};

/** 中身のある文書とフェンスの間に空ける行。Markdown では、詰めると段落の続きに見える。 */
const gapFor = (text: string): string => {
  if (text === '') return '';
  if (text.endsWith('\n\n')) return '';
  return text.endsWith('\n') ? '\n' : '\n\n';
};

export function fenceToAppend(text: string, language: string): NewFence {
  const gap = gapFor(text);
  const added = `${gap}\`\`\`${language}\n\`\`\`\n`;
  // 足したあとの全文のうち、開き記号までの改行の数がそのまま行番号になる。
  const before = `${text}${gap}`;
  return { added, line: before === '' ? 1 : before.split('\n').length };
}

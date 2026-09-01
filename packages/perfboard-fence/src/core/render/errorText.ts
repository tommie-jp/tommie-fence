import { markRange } from '../errors.ts';
import type { FenceError } from '../types.ts';

/**
 * 報告の文面。**プレビューの帯でも CLI の標準エラーでも同じ形**にする。
 * 頭に必ず名札を付けるのは、他人のノートに埋め込まれた図が出す言葉だから
 * (どの道具が言っているのか分からないと、直す場所を探せない)。
 */
export const LABEL = 'perfboard';

/** 行の中身をメッセージの下に落とす字下げ。メッセージ 1 件のかたまりに見えるだけの幅。 */
const INDENT = '    ';

/**
 * 端末で 2 桁を占める字。**日本語の値と注釈は普通に入る**ので、
 * 1 桁と数えるとキャレットがその字数だけ左へずれて的を外す。
 *
 * **circuit-fence の数え方から始めている。** breadboard-fence は桁数だけを
 * 合わせていて全角でずれる (直下の CLAUDE.md の「揃えていないもの」)。
 * 新しく起こすほうを間違った側に合わせる理由が無い。
 */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/u;

/** その字並びが端末で占める桁。 */
const widthOf = (text: string): number =>
  [...text].reduce((sum, char) => sum + (WIDE.test(char) ? 2 : 1), 0);

/**
 * 行の中身と、読めなかった綴りの下に付ける印。字下げは付けない。
 *
 * ```text
 * board: akizki-c
 *        ^^^^^^^^
 * ```
 */
export function sourceRows(error: FenceError): string[] {
  const { text } = error;
  if (text === undefined) return [];

  const range = markRange(error);
  if (range === null) return [text];

  const [start, end] = range;
  const characters = [...text];
  const before = ' '.repeat(widthOf(characters.slice(0, start).join('')));
  const marked = widthOf(characters.slice(start, end).join(''));
  return [text, `${before}${'^'.repeat(Math.max(marked, 1))}`];
}

/**
 * 字下げ付きの 0〜2 行。端末は 1 行ずつしか使えないので、
 * メッセージの下に**行の中身**と、指せるなら**キャレット**を置く。
 */
export const snippetLines = (error: FenceError): readonly string[] =>
  sourceRows(error).map((row) => `${INDENT}${row}`);

export const errorLine = (error: FenceError): string => {
  const where = error.line === null ? '' : `${error.line} 行目: `;
  return `${LABEL}: ${where}${error.message}`;
};

/** 1 件ぶんの、そのまま端末に出せる文面。 */
export const errorText = (error: FenceError): string =>
  [errorLine(error), ...snippetLines(error)].join('\n');

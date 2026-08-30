import { markRange } from '../errors.ts';
import type { FenceError } from '../types.ts';

/** 行の中身をメッセージの下に落とす字下げ。メッセージ 1 件のかたまりに見えるだけの幅。 */
const INDENT = '    ';

/**
 * 端末で 2 桁を占める字。**日本語の値と注釈は普通に入る**ので、
 * 1 桁と数えるとキャレットがその字数だけ左へずれて的を外す。
 * 東アジアの全角と、記号として使われる全角形を見る。
 */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/u;

/** その字並びが端末で占める桁。 */
const widthOf = (text: string): number =>
  [...text].reduce((sum, char) => sum + (WIDE.test(char) ? 2 : 1), 0);

/**
 * 図の下の帯と違って端末は 1 行ずつしか使えないので、
 * メッセージの下に**行の中身**と、指せるなら**キャレット**を置く。
 *
 * 返すのは 0〜2 行。中身が添えられていなければ何も返さない
 * (行番号だけのエラーは今までどおり 1 行で出る)。
 */
export function snippetLines(error: FenceError): readonly string[] {
  const { text } = error;
  if (text === undefined) return [];

  const shown = `${INDENT}${text}`;
  const range = markRange(error);
  if (range === null) return [shown];

  const [start, end] = range;
  const before = ' '.repeat(widthOf(text.slice(0, start)));
  return [shown, `${INDENT}${before}${'^'.repeat(Math.max(widthOf(text.slice(start, end)), 1))}`];
}

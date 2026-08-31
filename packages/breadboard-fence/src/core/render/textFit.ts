/**
 * 字が板や画布からはみ出さないように、幅を見積もって切る。
 * 部品リストの列と、板の上に置くキャプションの両方がここを通る。
 * DOM が無いので実測はできず、全角と半角の 2 段階の見積もりで足りるものとして扱う。
 */
import { clampText } from '../limits.ts';

/**
 * 1 文字の幅 (字の大きさに対する比)。DOM が無いので実測はできない。
 * 全角はほぼ字の大きさそのまま、英数字はその半分強として見積もる。
 * 全角を英数字と同じ幅で数えると、日本語のラベルが板からはみ出して読めなくなる。
 */
const WIDE_WIDTH = 1;
const NARROW_WIDTH = 0.55;

/**
 * 全角 (東アジアの文字と全角記号)。ここに無い文字は英数字と同じ幅とみなす。
 *
 * 後半は BMP の外 (サロゲートペア) の全角で、絵文字と CJK 拡張 B 以降がここに入る。
 * `textWidth` はコードポイントで数えているので、残るのは幅の見積もりだけの問題だった。
 * 割り当ての無い穴も範囲ごと全角に寄せてある。**広く見積もるほうが安全**で、
 * 多く数えれば `fit()` が早めに切るだけだが、少なく数えると板からはみ出す。
 */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{16FE0}-\u{1B2FF}\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

/** 字の大きさを 1 とした文字列の幅。 */
export const textWidth = (text: string): number =>
  [...text].reduce((sum, char) => sum + (WIDE.test(char) ? WIDE_WIDTH : NARROW_WIDTH), 0);

/** 幅に収まらない字は落として `…` を付ける。切った跡が残らないと、値が嘘になる。 */
export function fit(text: string, limit: number): string {
  if (textWidth(text) <= limit) return text;

  let width = 0;
  let count = 0;
  for (const char of text) {
    width += textWidth(char);
    // `…` のぶんを空けておく (詰めると今度はそれがはみ出す)。
    if (width > limit - WIDE_WIDTH) break;
    count += 1;
  }
  return clampText(text, count);
}

import { fit, num, svgText, textWidth } from 'fence-kit';
import type { Band } from '../model/layout.ts';
import type { Theme } from './theme.ts';

/**
 * 板の下に等幅で並べる帯。**書き出し (`- source`) と部品表 (`- parts`) が
 * 同じ組み方**なので、字の family・行送り・余白・幅の見積もりをここに置く。
 *
 * 板の上には重ねない。どちらも板より広く高くなることがあり、重ねると
 * 穴も部品も読めなくなる (それぞれ `layout` に自分の帯を持つ)。
 *
 * **行そのものを作るのは呼ぶ側。** 書き出しは 1 行を丸ごと写すが、部品表は
 * 桁を合わせるので列ごとに置く (全角を空白で埋めると、等幅でも桁が揃わない)。
 */

/** 等幅で書く。図のほかの字とは別の family を使う (桁が揃わないと読みにくい)。 */
const MONO_FAMILY = "ui-monospace, 'DejaVu Sans Mono', 'Noto Sans Mono CJK JP', monospace";

/**
 * 等幅の 1 字は、比例フォント向けの見積もり (`textWidth`) より広い。
 * **全角に合わせて 1.2 倍**で数える (等幅の全角は字の大きさそのまま。
 * `textWidth` は全角を 1.0 と見積もる)。英数字はこれで 0.66 と多めに出るが、
 * **広く見積もるほうが安全** — 多ければ帯が少し広いだけ、少なければ
 * 画布からはみ出して黙って切れる。幅を測るときも切るときも同じ数を使う。
 */
const MONO_WIDEN = 1.2;

/** 行送り (字の大きさに対する倍率)。 */
const LEADING = 1.15;

/** 帯の上下に入れる余白。 */
const PAD = 8;

/** 等幅で置いたときの字の幅 (px)。**測るときも切るときも同じ数を使う。** */
export const monoWidth = (text: string, size: number): number => textWidth(text) * size * MONO_WIDEN;

/** 帯が要る高さ。行の数だけで決まる。 */
export const monoBandHeight = (rows: number, size: number): number =>
  rows === 0 ? 0 : size * LEADING * (rows - 1) + size + PAD * 2;

/** 帯の中の n 行目のベースライン。 */
export const monoBaseline = (band: Band, size: number, index: number): number =>
  band.y + PAD + size * 0.8 + size * LEADING * index;

/**
 * 等幅の字を 1 つ置く。`room` を渡すとその幅で切る (`…` を残す)。
 * 字下げは意味そのものなので、空白を詰めさせない。
 */
export const monoText = (
  x: number,
  y: number,
  text: string,
  options: { readonly fill: string; readonly size: number; readonly room?: number },
): string =>
  svgText(x, y, options.room === undefined ? text : fit(text, options.room / (options.size * MONO_WIDEN)), {
    anchor: 'start',
    fill: options.fill,
    'font-size': num(options.size),
    'font-family': MONO_FAMILY,
    'xml:space': 'preserve',
  });

/**
 * 1 行を丸ごと写す帯が要る大きさ。**板の幅には合わせない** — 板が細い
 * フェンスでも中身は同じ長さなので、板に合わせると `…` だらけになる。
 * 画布を広げる判断は `createLayout` がこの値を見て行う。
 */
export function monoBandSize(
  lines: readonly string[],
  theme: Theme,
): { readonly width: number; readonly height: number } {
  if (lines.length === 0) return { width: 0, height: 0 };

  const size = theme.metrics.textSize;
  return {
    // **切り上げる。** 帯の幅から room を割り戻すので、端数のままだと
    // 丸め誤差で**いま測った当の行**が `…` に切られる。
    width: Math.ceil(Math.max(...lines.map((line) => monoWidth(line, size)))),
    height: monoBandHeight(lines.length, size),
  };
}

/** 1 行を丸ごと写す帯。 */
export function renderMonoBand(
  lines: readonly string[],
  band: Band,
  theme: Theme,
  fill: string,
): string {
  const size = theme.metrics.textSize;
  // 帯は中身に合わせて広げてあるので、ここで切れるのは桁外れに長い行だけ。
  return lines
    .map((line, index) =>
      monoText(band.x, monoBaseline(band, size, index), line, { fill, size, room: band.width }))
    .join('');
}

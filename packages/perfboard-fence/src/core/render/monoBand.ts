import {
  monoBandHeight as kitBandHeight, monoBaseline as kitBaseline, monoLinesSize, monoText as kitText, renderMonoLines,
} from 'fence-kit';
import type { MonoSpacing } from 'fence-kit';
import type { Band } from '../model/layout.ts';
import type { Theme } from './theme.ts';

/**
 * 基板の下に等幅で並べる帯。**書き出し (`- source`) と部品表 (`- parts`) が
 * 同じ組み方**なので、字の family・行送り・余白・幅の見積もりをここに置く。
 * **組み方の中身は fence-kit の `mono.ts`** (copper・vna・scope と共用)。ここは
 * 基板のフェンスの行送りと余白を決めて渡すだけ。
 *
 * 基板の上には重ねない。どちらも基板より広く高くなることがあり、重ねると
 * 穴も部品も読めなくなる (それぞれ `layout` に自分の帯を持つ)。
 *
 * **行そのものを作るのは呼ぶ側。** 書き出しは 1 行を丸ごと写すが、部品表は
 * 桁を合わせるので列ごとに置く (全角を空白で埋めると、等幅でも桁が揃わない)。
 */

/** 行送り 1.15、帯の上下の余白 8 (copper と同じ)。 */
const SPACING: MonoSpacing = { leading: 1.15, pad: 8 };

export { monoWidth } from 'fence-kit';

/** 帯が要る高さ。行の数だけで決まる。 */
export const monoBandHeight = (rows: number, size: number): number => kitBandHeight(rows, size, SPACING);

/** 帯の中の n 行目のベースライン。 */
export const monoBaseline = (band: Band, size: number, index: number): number => kitBaseline(band.y, size, index, SPACING);

/** 等幅の字を 1 つ置く。`room` を渡すとその幅で切る (`…` を残す)。 */
export const monoText = kitText;

/**
 * 1 行を丸ごと写す帯が要る大きさ。**基板の幅には合わせない** — 基板が細い
 * フェンスでも中身は同じ長さなので、基板に合わせると `…` だらけになる。
 * 画布を広げる判断は `createLayout` がこの値を見て行う。
 */
export const monoBandSize = (
  lines: readonly string[],
  theme: Theme,
): { readonly width: number; readonly height: number } => monoLinesSize(lines, theme.metrics.textSize, SPACING);

/** 1 行を丸ごと写す帯。帯は中身に合わせて広げてあるので、ここで切れるのは桁外れに長い行だけ。 */
export const renderMonoBand = (lines: readonly string[], band: Band, theme: Theme, fill: string): string =>
  renderMonoLines(lines, band, { size: theme.metrics.textSize, fill, spacing: SPACING });

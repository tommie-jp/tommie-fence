import { element, escapeMarkup } from './markup.ts';
import type { Attributes } from './markup.ts';

/**
 * 盤面に依らない SVG の組み立て。**穴のある盤面を描くフェンスが 2 つに
 * なったので引き上げた** (breadboard と perfboard)。circuit は TeX に
 * 描かせるので、ここは使わない。
 *
 * 図の中身 (板・部品・配線の形) は盤面ごとに違うので上げていない。
 * 上がっているのは「どのフェンスが描いても同じ」ものだけ。
 */

/** 座標の桁を落として出力を安定させる (同じ入力なら同じ文字列 = プレビューの差分更新が軽い)。 */
export const num = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * 太字の字の種類。**欧文のフォントを先に並べる** — `system-ui` だけだと
 * Windows では日本語の UI フォントの太字が選ばれ、Ω が別の字に化けた
 * (実機で「図01 50и」)。欧文フォントは Ω と数字を持ち、仮名と漢字は後ろの
 * 日本語フォントへ 1 字ずつ落ちる。題や見出しなど、太字で Ω を含みうる字に渡す。
 */
export const BOLD_FAMILY = "'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans', 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans CJK JP', sans-serif";

/** 既定の字の大きさ (10) に対する縁取りの太さ。字を大きくする側が比例して広げる。 */
export const TEXT_HALO_WIDTH = 3;

export type TextOptions = Attributes & {
  readonly anchor?: 'start' | 'middle' | 'end';
  /** 穴や配線の上に載る文字を読めるようにする縁取りの色。 */
  readonly halo?: string;
  /** 縁取りの太さ。字を大きくしたときに広げないと、下の穴が字に透ける。 */
  readonly haloWidth?: number;
};

export function svgText(x: number, y: number, content: string, options: TextOptions = {}): string {
  const { anchor = 'middle', halo, haloWidth = TEXT_HALO_WIDTH, ...rest } = options;
  return element(
    'text',
    {
      x: num(x),
      y: num(y),
      'text-anchor': anchor,
      'font-family': 'ui-sans-serif, system-ui, sans-serif',
      ...(halo ? { stroke: halo, 'stroke-width': num(haloWidth), 'paint-order': 'stroke' } : {}),
      ...rest,
    },
    escapeMarkup(content),
  );
}

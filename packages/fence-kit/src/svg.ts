import { element, escapeMarkup } from './markup.ts';
import type { Attributes } from './markup.ts';

/**
 * 盤面に依らない SVG の組み立て。**穴のある盤面を描くフェンスが 2 つに
 * なったので引き上げた** (breadboard と perfboard)。circuit は TeX に
 * 描かせるので、ここは使わない。
 *
 * 図の中身 (基板・部品・配線の形) は盤面ごとに違うので上げていない。
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
  /** 縁取りの不透明度 (0〜1)。1 未満なら下の穴や配線が縁越しに透ける。 */
  readonly haloOpacity?: number;
  /** 字そのものの不透明度 (0〜1)。1 未満なら下の配線が字越しにも透ける。 */
  readonly inkOpacity?: number;
};

/** 実体配線図 (breadboard / perfboard) の字の縁取りの不透明度。下の穴や配線を半分見せる。 */
export const BOARD_HALO_OPACITY = 0.5;

/**
 * 実体配線図の字そのものの不透明度。縁だけ透かしても字の下を通る配線は字に隠れるので、
 * 字も少し透かす。読める濃さは残す。
 */
export const BOARD_INK_OPACITY = 0.7;

export function svgText(x: number, y: number, content: string, options: TextOptions = {}): string {
  const { anchor = 'middle', halo, haloWidth = TEXT_HALO_WIDTH, haloOpacity = 1, inkOpacity = 1, ...rest } = options;
  const base = {
    x: num(x),
    y: num(y),
    'text-anchor': anchor,
    'font-family': 'ui-sans-serif, system-ui, sans-serif',
  };
  const text = escapeMarkup(content);
  const ink = inkOpacity < 1 ? { opacity: num(inkOpacity) } : {};
  if (!halo) return element('text', { ...base, ...rest, ...ink }, text);
  const stroke = { stroke: halo, 'stroke-width': num(haloWidth) };
  if (haloOpacity >= 1) return element('text', { ...base, ...stroke, 'paint-order': 'stroke', ...rest, ...ink }, text);

  // **縁は字と別の要素に分けて、要素ごと透かす。** stroke-opacity で透かすと、
  // Chromium は字ごとに縁を塗るので、隣の字と重なった所だけ濃い跡が出る。
  // 要素の opacity は 1 枚に塗ってから透かすので、縁が均一に薄くなる。
  // 字の芯も縁の色で塗る (字の下の穴が、上の字の隙間から濃く覗かないように)。
  // 縁は rest (class など) を字と同じに持つ — 名札を上の層へ移す印を縁にも付けるため。
  const under = element(
    'text',
    { ...base, ...stroke, ...rest, fill: halo, opacity: num(haloOpacity), 'aria-hidden': 'true' },
    text,
  );
  return under + element('text', { ...base, ...rest, ...ink }, text);
}

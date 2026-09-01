import { BAND_COLORS, DEFAULT_LED_COLOR, LED_COLORS, bandColor, ledColor } from 'fence-kit';

// ここにあるのは**実物の色そのもの**、つまり意味を持つ色だけ。
// 配線の被覆・抵抗のカラーコード・LED の発光色は、テーマで塗り替えると図が嘘になるので、
// 板や印字の配色 (`theme.ts` の Palette) とは別に置いて、テーマから触らせない。

/** 配線の色名。ここに無い名前は書式エラーにして既定色で描く (属性への流し込みを防ぐ)。 */
export const WIRE_COLORS: Record<string, string> = {
  red: '#d33a2f',
  black: '#23272e',
  white: '#f4f4f2',
  gray: '#8a929c',
  grey: '#8a929c',
  orange: '#e08a1e',
  yellow: '#d9b800',
  green: '#2a9d4b',
  blue: '#2b6fd4',
  purple: '#7b4bb7',
  brown: '#7a5c2e',
  pink: '#e06c9f',
};

export const DEFAULT_WIRE_COLOR = WIRE_COLORS.gray as string;

export const wireColorNames = (): readonly string[] => Object.keys(WIRE_COLORS);

/**
 * 色名は入力から来るので、必ず自分の持ち物だけを引く。
 * 素の添字だと `constructor` や `toString` が Object.prototype から拾えてしまい、
 * 関数の中身がそのまま stroke 属性に流れ込む。
 */
const lookupColor = (table: Record<string, string>, name: string): string | null =>
  Object.hasOwn(table, name) ? table[name] ?? null : null;

export const wireColor = (name: string): string | null => lookupColor(WIRE_COLORS, name.toLowerCase());

/**
 * 部品の色 (カラーコードの帯・LED の発光色) は fence-kit にある。
 * 実物の色そのものなので盤面に依らず、perfboard も同じものを使う。
 */
export { BAND_COLORS, DEFAULT_LED_COLOR, LED_COLORS, bandColor, ledColor };

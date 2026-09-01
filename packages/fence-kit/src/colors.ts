/**
 * **実物の部品の色**。テーマで塗り替えると図が嘘になるので、板や印字の配色
 * (各パッケージの `theme.ts`) とは別に置いて、テーマから触らせない。
 *
 * 盤面には依らないので、穴のある盤面を描くフェンスが 2 つになった時点で
 * 引き上げた (breadboard と perfboard)。中身は breadboard から変えていない。
 */

/**
 * 色名は入力から来るので、必ず自分の持ち物だけを引く。
 * 素の添字だと `constructor` や `toString` が Object.prototype から拾えてしまい、
 * 関数の中身がそのまま stroke 属性に流れ込む。
 */
const lookupColor = (table: Record<string, string>, name: string): string | null =>
  Object.hasOwn(table, name) ? table[name] ?? null : null;

/** カラーコードの帯の色。 */
export const BAND_COLORS: Record<string, string> = {
  black: '#1b1d21',
  brown: '#6b4423',
  red: '#c92c22',
  orange: '#e07b1e',
  yellow: '#e3c700',
  green: '#2a9d4b',
  blue: '#2b6fd4',
  violet: '#7b4bb7',
  gray: '#8a929c',
  white: '#f2f2ef',
  gold: '#c9a227',
  silver: '#c0c4c9',
};

export const LED_COLORS: Record<string, string> = {
  red: '#e0392c',
  green: '#37b34a',
  blue: '#2f7ff0',
  yellow: '#f2c200',
  white: '#eef1f5',
  orange: '#f07c1e',
};

export const DEFAULT_LED_COLOR = LED_COLORS.red as string;

export const ledColor = (name: string): string | null => lookupColor(LED_COLORS, name.toLowerCase());

export const bandColor = (name: string): string => lookupColor(BAND_COLORS, name) ?? (BAND_COLORS.black as string);

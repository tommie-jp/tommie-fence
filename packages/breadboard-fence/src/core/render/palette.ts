/** 図の配色。実物のブレッドボードに寄せた固定色で、テーマに依らず同じ絵になる。 */
export const PALETTE = {
  plate: '#f2efe6',
  plateEdge: '#d8d2c2',
  ravine: '#e6e2d4',
  hole: '#30353d',
  // 印字は薄いと穴に埋もれるので、板の色に対して十分暗くする。
  label: '#5f5748',
  positive: '#d33a2f',
  negative: '#2b6fd4',
  lead: '#8f98a3',
  chipBody: '#2b2f36',
  chipPin: '#b9bec7',
  chipText: '#e8ebf0',
  deviceBody: '#3d434d',
  deviceEdge: '#20242b',
  deviceText: '#f0f3f8',
  partText: '#3f4650',
  errorInk: '#8c1d18',
  errorPlate: '#fdecea',
  errorEdge: '#e0b4b0',
} as const;

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

export const bandColor = (name: string): string => lookupColor(BAND_COLORS, name) ?? PALETTE.hole;

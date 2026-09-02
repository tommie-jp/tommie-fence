import { colorValue, isColor } from '../color.ts';

/**
 * 板の仕上げの色。**実物の板の色**であって、テーマの配色ではない。
 *
 * ユニバーサル基板はレジストの色と、ランドのめっきで見た目が変わる
 * (緑にはんだメッキ、青に金フラッシュ、生基板の銅はく…)。**手元の板に
 * 寄せて描けると、図と実物を見比べられる**ので、板の側の指定として持つ。
 *
 * 名前で書けるのはここにある色だけ。それ以外は `#RRGGBB` で書く
 * (色は SVG の属性へそのまま流れるので、通す綴りは 2 通りに限る)。
 */

/** レジスト (板) の色。**既定は緑** — いちばん多い。 */
export const PLATE_COLORS: Record<string, string> = {
  green: '#2c7a4b',
  blue: '#1f5c9e',
  red: '#9e2b2b',
  black: '#26292c',
  white: '#e8eaec',
  yellow: '#c9a227',
  purple: '#5b3a86',
  bare: '#c8a05a',
};

/** ランド (銅箔) の色。**既定は銀** — はんだメッキ仕上げ。 */
export const LAND_COLORS: Record<string, string> = {
  silver: '#cdd3d9',
  gold: '#d8b64a',
  copper: '#b87333',
  tin: '#cdd3d9',
};

const own = (table: Record<string, string>, name: string): string | null =>
  Object.hasOwn(table, name) ? table[name] ?? null : null;

const named = (table: Record<string, string>) => (text: string): string | null =>
  own(table, text.trim().toLowerCase());

/** 名前で引けるか、`#RRGGBB` か。**それ以外は通さない。** */
const readable = (table: Record<string, string>) => (text: string): boolean =>
  named(table)(text) !== null || (isColor(text) && text.trim().startsWith('#'));

/** 名前 → 実際の色。`#RRGGBB` はそのまま (小文字に揃える)。 */
const value = (table: Record<string, string>) => (text: string): string | null =>
  named(table)(text) ?? (text.trim().startsWith('#') ? colorValue(text) : null);

export const isPlateColor = readable(PLATE_COLORS);
export const isLandColor = readable(LAND_COLORS);
export const plateValue = value(PLATE_COLORS);
export const landValue = value(LAND_COLORS);

export const plateNames = (): readonly string[] => Object.keys(PLATE_COLORS);
export const landNames = (): readonly string[] => Object.keys(LAND_COLORS);

/**
 * 板の縁と、ランドの縁に使う濃い色。**書かれた色から作る** — 縁だけテーマの色を
 * 使うと、板の色を変えたときに縁が取り残されて額縁のように浮く。
 */
export function darken(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const channel = (at: number): string => {
    const value = Number.parseInt(full.slice(at, at + 2), 16);
    return Math.round(value * (1 - amount)).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/**
 * その板の上に置く字の色。**板の明るさから決める** — 板の色を変えられる以上、
 * 字の色を固定にすると、白い板に白い字・緑の板に黒い字という**読めない図**が
 * 黙って出る。
 */
export function textOn(plate: string): string {
  const hex = plate.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const at = (i: number): number => Number.parseInt(full.slice(i, i + 2), 16) / 255;
  // 明るさの目安 (ITU-R BT.601)。厳密さより、白と黒のどちらが読めるかが分かればよい。
  const luma = 0.299 * at(0) + 0.587 * at(2) + 0.114 * at(4);
  return luma > 0.55 ? '#1a1f1c' : '#f4f8f5';
}

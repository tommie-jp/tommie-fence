import { colorValue, isColor } from '../color.ts';

/**
 * 基板の仕上げの色。**実物の基板の色**であって、テーマの配色ではない。
 *
 * ユニバーサル基板はレジストの色と、ランドのめっきで見た目が変わる
 * (緑にはんだメッキ、青に金フラッシュ、生基板の銅はく…)。**手元の基板に
 * 寄せて描けると、図と実物を見比べられる**ので、基板の側の指定として持つ。
 *
 * 名前で書けるのはここにある色だけ。それ以外は `#RRGGBB` で書く
 * (色は SVG の属性へそのまま流れるので、通す綴りは 2 通りに限る)。
 */

/** レジスト (基板) の色。**既定は緑** — いちばん多い。 */
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
 * 基板の縁と、ランドの縁に使う濃い色。**書かれた色から作る** — 縁だけテーマの色を
 * 使うと、基板の色を変えたときに縁が取り残されて額縁のように浮く。
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
 * その基板の上に置く字の色。**基板の明るさから決める** — 基板の色を変えられる以上、
 * 字の色を固定にすると、白い基板に白い字・緑の基板に黒い字という**読めない図**が
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

/**
 * その基板の上で見やすい配線の色。**基板の明るさから決める。**
 *
 * 色を書かなかった配線は「ただのジャンパ」で、実物の色を主張していない。
 * 基板の色を選べる以上、既定を 1 つの灰色に固定すると、**同じ濃さの基板で
 * 線が沈む** (緑の基板に灰色、白の基板に白っぽい線)。基板が変われば線も変わる。
 *
 * **書かれた色は動かさない** — あちらは実物の被覆の色なので、読みにくくても
 * 書いたとおりに描く (図と手元の線を見比べるためのもの)。
 */
/**
 * 配線の縁の色。**ふつうの基板には暗い縁、ごく暗い基板 (黒・暗いテーマ) には明るい縁。**
 * しきい値は字の色 (`textOn`) より低い — 緑や青の基板は字なら白が読めるが、
 * 縁は暗いほうが線の色を立てる (52 の docs/110 の試し描き)。
 */
export function outlineOn(plate: string): string {
  return lumaOf(plate) < OUTLINE_DARK_PLATE ? '#e6ebef' : '#1b1d21';
}

const lumaOf = (color: string): number => {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const at = (i: number): number => Number.parseInt(full.slice(i, i + 2), 16) / 255;
  return 0.299 * at(0) + 0.587 * at(2) + 0.114 * at(4);
};

/** 白い縁。白以外の線と部品のピンに付ける (52 の docs/110 の続き)。 */
export const WHITE_OUTLINE = '#ffffff';

/** これより明るい線 (白・ごく淡い色) は白い縁では消えるので、基板に合わせた縁にする。 */
const LIGHT_WIRE = 0.8;

/**
 * 線の縁の色。**白以外の線は白い縁** — 緑の基板では暗い縁より白い縁のほうが線の形が立つ
 * (図を見て決めた)。白い線は白い縁では太さが変わって見えるだけなので、基板に合わせた縁のまま。
 */
export function wireOutline(stroke: string, plate: string): string {
  return stroke.startsWith('#') && lumaOf(stroke) >= LIGHT_WIRE ? outlineOn(plate) : WHITE_OUTLINE;
}

/** これより暗い基板には明るい縁。黒 (0.16) と暗いテーマの緑 (0.22) が入り、緑 (0.36) は入らない。 */
const OUTLINE_DARK_PLATE = 0.25;

export function wireOn(plate: string): string {
  // 明るい基板には暗い線、暗い基板には明るい線。しきい値は字の色と同じ。
  return textOn(plate) === '#1a1f1c' ? '#39414a' : '#e6ebef';
}

/**
 * 数の読み書き。**単位は意味を持たない字** (`mA` `dB` `Hz` `℃`) — 枠を分ける鍵と、
 * 目盛・読み値に刷る字だけ (52 の docs/92 の決め 8)。数に付ける**接頭辞は倍率**で、
 * SI の規則どおり**大文字小文字を区別する** (`m` は 1/1000、`M` は 10^6)。
 */

/** SI の接頭辞と倍率。`u` は `µ` の打てない人のため (同じ意味の綴りで、別の書き方ではない)。 */
export const PREFIXES: Readonly<Record<string, number>> = {
  p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12,
};

const NUMBER = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([pnuµμmkMGT]?)$/u;

/** `2k` `0.38` `-40` `1.5e3` `25.9m` を数に。読めなければ null。 */
export function parseNumber(text: string): number | null {
  const found = NUMBER.exec(text.trim());
  if (found === null) return null;
  const value = Number(found[1]) * (found[2] === '' ? 1 : (PREFIXES[found[2] ?? ''] ?? 1));
  return Number.isFinite(value) ? value : null;
}

/** `deg` の軸では `°` も同じ単位として受ける (キーボードで打てない字の逃げ道。87 の表)。 */
const unitSpellings = (unit: string): readonly string[] => (unit === 'deg' ? ['deg', '°'] : [unit]);

export type QuantityRead = { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: string };

/**
 * 軸の数。**軸の単位は付けても付けなくてもよい** (`2k` = `2kHz`、`17.6` = `17.6mA`)。
 * 軸と違う単位は断る — 黙って別の値に読まない (87 の項 1)。
 */
export function parseQuantity(text: string, unit: string): QuantityRead {
  const trimmed = text.trim();
  const bare = parseNumber(trimmed);
  if (bare !== null) return { ok: true, value: bare };
  for (const spelling of unitSpellings(unit)) {
    if (spelling !== '' && trimmed.endsWith(spelling)) {
      const value = parseNumber(trimmed.slice(0, -spelling.length));
      if (value !== null) return { ok: true, value };
    }
  }
  const lead = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)/.exec(trimmed);
  return lead === null
    ? { ok: false, reason: '数が読めません' }
    : { ok: false, reason: `単位が軸と違います (軸は ${unit}。${lead[0]} か ${lead[0]}${unit} と書きます)` };
}

/** 有効数字 3 桁。末尾の 0 は残す (`45.0`)。0 は `0`。 */
export function threeDigits(value: number): string {
  if (value === 0) return '0';
  // 桁は**丸めた後の値**で数える (0.99999 を `1.000` でなく `1.00` に)。
  const rounded = Number(value.toPrecision(3));
  const magnitude = Math.floor(Math.log10(Math.abs(rounded)));
  const decimals = Math.max(0, 2 - magnitude);
  return rounded.toFixed(decimals);
}

const PREFIX_STEPS: readonly (readonly [number, string])[] = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

/** 接頭辞を付けた有効 3 桁 (`15.9k` `1.59k` `100` `600m`)。目盛と x の読み値。 */
export function withPrefix(value: number): string {
  if (value === 0) return '0';
  // 接頭辞は **3 桁に丸めた後の値**で選ぶ (999.99 を `1000` でなく `1.00k` に)。
  const size = Math.abs(Number(value.toPrecision(3))) * (1 + 1e-9);
  const step = PREFIX_STEPS.find(([scale]) => size >= scale) ?? PREFIX_STEPS[PREFIX_STEPS.length - 1] ?? [1, ''];
  return `${threeDigits(value / step[0])}${step[1]}`;
}

/** 接頭辞を付けない単位。 */
const NO_PREFIX_UNITS = new Set(['dB', 'deg', '°', 'dBm', 'dBV']);

/** 刷る単位の字。`deg` は `°` で刷る (量/単位の形の軸名では `deg` のまま)。 */
export const unitGlyph = (unit: string): string => (unit === 'deg' ? '°' : unit);

/**
 * 読み値の字。**値が 1000 以上か 0.001 未満なら接頭辞**、ほかは素の数に単位
 * (`15.9 kHz` `0.600 V` `−3.01 dB` `−45.0°`)。**`mA` のように単位が接頭辞を持つ軸で
 * 接頭辞を重ねない** (1.2k mA にしない) — 単位の頭が接頭辞の字なら素の数のまま。
 */
export function formatReading(value: number, unit: string): string {
  const glyph = unitGlyph(unit);
  // dB と deg (負の値を持つ比と角度) にも接頭辞を付けない (`2.00 kdB` にしない)。
  const stacked = (unit.length > 1 && Object.hasOwn(PREFIXES, unit[0] ?? '')) || NO_PREFIX_UNITS.has(unit);
  const size = Math.abs(value);
  const rounded = Math.abs(Number(value.toPrecision(3)));
  const text = !stacked && value !== 0 && (rounded >= 1000 || size < 1e-3) ? withPrefix(value) : threeDigits(value);
  const signed = text.replace(/^-/, '−');
  if (glyph === '°') return `${signed}°`;
  if (glyph === '') return signed;
  // 接頭辞の付いた数は単位を直に続ける (`15.9k` + `Hz` → `15.9 kHz`)。
  const prefixed = /[pnµmkMGT]$/u.exec(signed);
  return prefixed === null ? `${signed} ${glyph}` : `${signed.slice(0, -1)} ${prefixed[0]}${glyph}`;
}

import { formatPerDiv, formatVolts, parsePerDiv } from 'fence-kit';
import type { Dim } from './expr.ts';

/**
 * 縦軸の量の単位。ch はいつも V、**Math は書き手が `unit:` で言う** (V・W・無次元の 1)。
 * 掛け算の結果の単位を道具が推定しない (52 の docs/99 の単位の決め — 黙って別の意味に読まない)。
 * 書き方は V と同じ (有効 3 桁、接頭辞で桁を寄せる: `500 mW` `1.00 W`)。
 */
export const MATH_UNITS = ['V', 'W', '1'] as const;
export type QuantityUnit = (typeof MATH_UNITS)[number];

/** 単位が期待する式の次元 (W は V² — 抵抗を素の数で割った v·v/R)。 */
export const UNIT_DIMS: Readonly<Record<QuantityUnit, Dim>> = {
  V: { v: 1, s: 0 },
  W: { v: 2, s: 0 },
  1: { v: 0, s: 0 },
};

const SMALL = 1e-3;
const LARGE = 1e4;

/** 無次元の読み値。有効 3 桁 (`0.500` `12.3`)。桁が離れれば指数 (`1.23e-6`)。 */
function formatPlain(value: number): string {
  if (value === 0 || !Number.isFinite(value)) return '0';
  const size = Math.abs(value);
  return size >= SMALL && size < LARGE ? value.toPrecision(3) : value.toExponential(2);
}

/** 読み値 1 つ (`500 mV` `250 mW` `0.500`)。 */
export function formatQuantity(value: number, unit: QuantityUnit = 'V'): string {
  switch (unit) {
    case 'V':
      return formatVolts(value);
    case 'W':
      return formatVolts(value).replace(/V$/, 'W');
    case '1':
      return formatPlain(value);
  }
}

/** 目盛の設定 (`500mV/div` `200mW/div` `0.5/div`)。**書くときと同じ綴り**。 */
export function formatQuantityPerDiv(value: number, unit: QuantityUnit = 'V'): string {
  switch (unit) {
    case 'V':
      return formatPerDiv(value, 'V');
    case 'W':
      return formatPerDiv(value, 'V').replace(/V\/div$/, 'W/div');
    case '1':
      return `${Number(value.toPrecision(3))}/div`;
  }
}

const PLAIN_PER_DIV = /^(\d+(?:\.\d+)?|\.\d+)\s*\/\s*div$/;

/** `range:` の読み。**書いた unit: と同じ単位だけ**受ける (W の Math に `1V/div` は断る)。 */
export function parseQuantityPerDiv(text: string, unit: QuantityUnit): number | null {
  const trimmed = text.trim();
  switch (unit) {
    case 'V':
      return parsePerDiv(trimmed, 'V');
    case 'W':
      return /W\s*\/\s*div$/.test(trimmed) ? parsePerDiv(trimmed.replace(/W(\s*\/\s*div)$/, 'V$1'), 'V') : null;
    case '1': {
      const found = PLAIN_PER_DIV.exec(trimmed);
      const value = found === null ? 0 : Number(found[1]);
      return value > 0 ? value : null;
    }
  }
}

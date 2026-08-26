/**
 * TeX に書く数の綴り。
 *
 * 図の座標は generate.ts と drawNotes.ts の両方が書く。**綴り方が 2 つあると、
 * 同じ点が桁違いの 2 通りで出て図がずれる**ので、1 か所に置いて両方が使う。
 */

/** 座標の桁を落として出力を安定させる (同じ入力なら必ず同じ TeX)。 */
export const num = (value: number): string => String(Math.round(value * 1000) / 1000);

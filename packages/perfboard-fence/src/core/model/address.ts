import type { Address } from '../types.ts';

const ALPHABET = 26;
const CODE_A = 'a'.charCodeAt(0);

const ADDRESS = /^([a-z]+)([0-9]+)$/;
const ROW_LABEL = /^[a-z]+$/;

/**
 * 行の名前。1 行目が `a`、26 行目が `z`、27 行目が `aa`。
 *
 * **表計算と同じ数え方 (bijective base-26)** にしてある。ブレッドボードは
 * `a`〜`j` の 10 行で足りたが、ユニバーサル基板は板ごとに行数が違い、
 * A タイプなら 40 行を超える。`aa` が 27 行目だと説明せずに読めるのは、
 * この数え方が既に知られているから。
 */
export function rowLabel(index: number): string {
  let remaining = index;
  let label = '';
  while (remaining > 0) {
    const digit = (remaining - 1) % ALPHABET;
    label = String.fromCharCode(CODE_A + digit) + label;
    remaining = Math.floor((remaining - 1) / ALPHABET);
  }
  return label;
}

/** 行の名前を番号に戻す。行の名前でなければ null。 */
export function rowIndex(label: string): number | null {
  if (!ROW_LABEL.test(label)) return null;
  let index = 0;
  for (const char of label) {
    index = index * ALPHABET + (char.charCodeAt(0) - CODE_A + 1);
  }
  return index;
}

/**
 * 穴番地 (`b3`) を読む。**板に載るかどうかは見ない** — 行数と列数を
 * 知っているのは板なので、そちらが言う (`offBoardReason`)。
 */
export function parseAddress(text: string): Address | null {
  // 板の印字が大文字のことがあるので、どちらでも受けて小文字に正規化する。
  const found = ADDRESS.exec(text.toLowerCase());
  if (!found) return null;

  const [, label = '', digits = ''] = found;
  const row = rowIndex(label);
  const col = Number(digits);
  if (row === null || col < 1) return null;
  return { row, col };
}

export const formatAddress = (address: Address): string => `${rowLabel(address.row)}${address.col}`;

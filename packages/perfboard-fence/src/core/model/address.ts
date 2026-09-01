import type { Address } from '../types.ts';

const ALPHABET = 26;
const CODE_A = 'a'.charCodeAt(0);

/**
 * 行の名前と列の番号の長さの上限。
 *
 * **上限が無いと止まらなくなる。** 200 字を超える行ラベルは `rowIndex` が
 * 桁あふれして `Infinity` になり、`rowLabel` の桁下げ (`(n-1)/26`) が
 * `Infinity` のまま減らないので `while` が終わらない。
 * 4 字あれば 26^4 = 456,976 行まで名前が付き、実在する板 (最大 44 行) の
 * はるか先まで届く。
 */
const MAX_ROW_LETTERS = 4;
const MAX_COL_DIGITS = 4;

const ADDRESS = new RegExp(`^([a-z]{1,${MAX_ROW_LETTERS}})([0-9]{1,${MAX_COL_DIGITS}})$`);
const ROW_LABEL = new RegExp(`^[a-z]{1,${MAX_ROW_LETTERS}}$`);

/**
 * 行の名前。1 行目が `a`、26 行目が `z`、27 行目が `aa`。
 *
 * **表計算と同じ数え方 (bijective base-26)** にしてある。ブレッドボードは
 * `a`〜`j` の 10 行で足りたが、ユニバーサル基板は板ごとに行数が違い、
 * A タイプなら 40 行を超える。`aa` が 27 行目だと説明せずに読めるのは、
 * この数え方が既に知られているから。
 */
export function rowLabel(index: number): string {
  // 呼ぶ側が番地を通していれば来ないが、**ここが止まらないと図も止まる**ので、
  // 数として扱えないものは空で返す (上の桁あふれの経緯)。
  if (!Number.isFinite(index) || index < 1) return '';
  let remaining = Math.floor(index);
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

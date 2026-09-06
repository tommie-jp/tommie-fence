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

/**
 * 番地の綴り。**行は英字・`0`・`-英字`、列は数・`0`・`-数`。**
 *
 * 板の外を指せないと、縁の銅箔や、板から張り出す部品の行き先を書けない。
 * 0 を挟んで **…-B -A 0 A B…** と間を空けずに並べるので、板の中と外で
 * 数え方が変わらない (`a1` の左隣は `a0`、その左は `a-1`)。
 */
/**
 * 端数の 1 桁を表す英字。**`a` = 0** で、行の名前と同じ数え方
 * (circuit・breadboard と共通)。
 */
const FRACTION_LETTERS = 'abcdefghij';

/** 組が 1 つも無いのと同じ意味になる綴り。`b5a0` は `b5` と同じ場所。 */
const EMPTY_PAIR = 'a0';

/** 端数の組 (`c3`)。1 組で小数第 1 位まで。 */
const PAIR = '(?:[a-j][0-9])?';

const ADDRESS = new RegExp(
  `^(0|-?[a-z]{1,${MAX_ROW_LETTERS}})(0|-?[0-9]{1,${MAX_COL_DIGITS}})(${PAIR})$`,
);
const ROW_LABEL = new RegExp(`^(0|-?[a-z]{1,${MAX_ROW_LETTERS}})$`);

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
  if (!Number.isFinite(index)) return '';
  // 0 行と、その上 (負の行)。板の外を指すための綴りで、間は空いていない。
  if (index === 0) return '0';
  if (index < 0) return `-${rowLabel(-index)}`;
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
  if (label === '0') return 0;
  if (label.startsWith('-')) {
    const positive = rowIndex(label.slice(1));
    return positive === null ? null : -positive;
  }
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

  const [, label = '', digits = '', pair = ''] = found;
  const row = rowIndex(label);
  const col = Number(digits);
  if (row === null || !Number.isFinite(col) || pair === EMPTY_PAIR) return null;
  return { row, col, ...stepsOf(pair) };
}

export const formatAddress = (address: Address): string =>
  `${rowLabel(address.row)}${address.col}${pairOf(address)}`;

/**
 * 組 → 行と列の端数。**端数が無ければ鍵ごと持たない** — 交点の番地は今までと
 * 同じ形のままにする (`{ row, col }` を比べているところが多い)。
 */
function stepsOf(pair: string): { readonly rows?: number; readonly cols?: number } {
  if (pair === '') return {};
  return {
    rows: FRACTION_LETTERS.indexOf(pair[0] ?? 'a') / 10,
    cols: Number(pair[1] ?? 0) / 10,
  };
}

/** 端数を綴りに戻す。0 なら組を書かない (同じ場所の綴りを 1 つに保つ)。 */
function pairOf(address: Address): string {
  const rows = Math.round((address.rows ?? 0) * 10);
  const cols = Math.round((address.cols ?? 0) * 10);
  return rows === 0 && cols === 0 ? '' : `${FRACTION_LETTERS[rows] ?? 'a'}${cols}`;
}

/** 交点そのものか (端数を持たないか)。**穴に挿すものは交点だけ**。 */
export const isCrossing = (address: Address): boolean =>
  (address.rows ?? 0) === 0 && (address.cols ?? 0) === 0;

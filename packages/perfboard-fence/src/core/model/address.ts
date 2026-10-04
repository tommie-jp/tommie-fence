import type { Address, Spelling } from '../types.ts';

const ALPHABET = 26;
const CODE_A = 'a'.charCodeAt(0);

/**
 * 行の名前と列の番号の長さの上限。
 *
 * **上限が無いと止まらなくなる。** 200 字を超える行ラベルは `rowIndex` が
 * 桁あふれして `Infinity` になり、`rowLabel` の桁下げ (`(n-1)/26`) が
 * `Infinity` のまま減らないので `while` が終わらない。
 * 4 字あれば 26^4 = 456,976 行まで名前が付き、実在する基板 (最大 44 行) の
 * はるか先まで届く。
 */
const MAX_ROW_LETTERS = 4;
const MAX_COL_DIGITS = 4;

/**
 * 番地の綴り。**行は英字・`0`・`-英字`、列は数・`0`・`-数`。**
 *
 * 基板の外を指せないと、縁の銅箔や、基板から張り出す部品の行き先を書けない。
 * 0 を挟んで **…-B -A 0 A B…** と間を空けずに並べるので、基板の中と外で
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
 * `a`〜`j` の 10 行で足りたが、ユニバーサル基板は基板ごとに行数が違い、
 * A タイプなら 40 行を超える。`aa` が 27 行目だと説明せずに読めるのは、
 * この数え方が既に知られているから。
 */
export function rowLabel(index: number): string {
  // 呼ぶ側が番地を通していれば来ないが、**ここが止まらないと図も止まる**ので、
  // 数として扱えないものは空で返す (上の桁あふれの経緯)。
  if (!Number.isFinite(index)) return '';
  // 0 行と、その上 (負の行)。基板の外を指すための綴りで、間は空いていない。
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
 * 番地の綴りの形をしているか。**数え方 (`Spelling`) を問わない**ので、
 * 「番地と同じ綴りは名前にできない」のような、綴りだけを見る所で使う。
 */
export function isAddressSpelling(text: string): boolean {
  const found = ADDRESS.exec(text.toLowerCase());
  return found !== null && found[3] !== EMPTY_PAIR;
}

/**
 * 穴番地 (`b3`) を読む。**基板に載るかどうかは見ない** — 行数と列数を
 * 知っているのは基板なので、そちらが言う (`offBoardReason`)。
 *
 * **英字と数字のどちらが行かは基板のシルクで決まる** (`Spelling`)。
 * 中の持ち方 (`Address`) は数え方によらず「上から何行目・左から何列目」。
 */
export function parseAddress(text: string, spelling: Spelling): Address | null {
  // 基板の印字が大文字のことがあるので、どちらでも受けて小文字に正規化する。
  const found = ADDRESS.exec(text.toLowerCase());
  if (!found) return null;

  const [, label = '', digits = '', pair = ''] = found;
  const letters = rowIndex(label);
  const number = Number(digits);
  if (letters === null || !Number.isFinite(number) || pair === EMPTY_PAIR) return null;

  const letterTenths = letters * TENTHS + (FRACTION_LETTERS.indexOf(pair[0] ?? 'a'));
  const numberTenths = number * TENTHS + Number(pair[1] ?? 0);
  const { rowTenths, colTenths } = toGrid(letterTenths, numberTenths, spelling);
  return fromTenths(rowTenths, colTenths);
}

export const formatAddress = (address: Address, spelling: Spelling): string => {
  const rowTenths = Math.round((address.row + (address.rows ?? 0)) * TENTHS);
  const colTenths = Math.round((address.col + (address.cols ?? 0)) * TENTHS);
  const { letterTenths, numberTenths } = toSpelling(rowTenths, colTenths, spelling);
  const letters = Math.floor(letterTenths / TENTHS);
  const number = Math.floor(numberTenths / TENTHS);
  return `${rowLabel(letters)}${number}${pairOfTenths(letterTenths - letters * TENTHS, numberTenths - number * TENTHS)}`;
};

/** 0.1 穴を 1 とする整数で持つ。**浮動小数の誤差で綴りが揺れない**ように。 */
const TENTHS = 10;

/** 下から数える軸の名前の番号。**基板の外 (0 と負) も同じ式で続く**。 */
const fromBottom = (tenths: number, spelling: Spelling): number => (spelling.rows + 1) * TENTHS - tenths;

/** 行と列 (上から・左から) → 綴りの英字の軸と数字の軸 (どちらも 0.1 穴の整数)。 */
function toSpelling(rowTenths: number, colTenths: number, spelling: Spelling) {
  switch (spelling.silk) {
    case 'alpha-rows': return { letterTenths: fromBottom(rowTenths, spelling), numberTenths: colTenths };
    case 'alpha-cols': return { letterTenths: colTenths, numberTenths: fromBottom(rowTenths, spelling) };
    case 'fence': return { letterTenths: rowTenths, numberTenths: colTenths };
  }
}

/** `toSpelling` の逆。 */
function toGrid(letterTenths: number, numberTenths: number, spelling: Spelling) {
  switch (spelling.silk) {
    case 'alpha-rows': return { rowTenths: fromBottom(letterTenths, spelling), colTenths: numberTenths };
    case 'alpha-cols': return { rowTenths: fromBottom(numberTenths, spelling), colTenths: letterTenths };
    case 'fence': return { rowTenths: letterTenths, colTenths: numberTenths };
  }
}

/**
 * 0.1 穴の整数 → 番地。**端数が無ければ鍵ごと持たない** — 交点の番地は今までと
 * 同じ形のままにする (`{ row, col }` を比べているところが多い)。
 */
function fromTenths(rowTenths: number, colTenths: number): Address {
  const row = Math.floor(rowTenths / TENTHS);
  const col = Math.floor(colTenths / TENTHS);
  const rows = (rowTenths - row * TENTHS) / TENTHS;
  const cols = (colTenths - col * TENTHS) / TENTHS;
  return rows === 0 && cols === 0 ? { row, col } : { row, col, rows, cols };
}

/** 端数を綴りの組にする。両方 0 なら組を書かない (同じ場所の綴りを 1 つに保つ)。 */
const pairOfTenths = (letterFraction: number, numberFraction: number): string =>
  letterFraction === 0 && numberFraction === 0 ? '' : `${FRACTION_LETTERS[letterFraction] ?? 'a'}${numberFraction}`;

/**
 * `fence` の綴りで読み書きするときの面 (`rows` は「下から」でしか使わない)。
 * 基板を持たない所 (試験の下ごしらえ) 向け。
 */
export const FENCE_SPELLING: Spelling = { silk: 'fence', rows: 0 };

/**
 * 行と列それぞれの名前 (図の端に出す字。**番地の綴りと同じ字**)。
 * 英字のほうは `a` `b` …、数字のほうは `1` `2` …。基板の外 (0 と範囲外) も同じ式で続く。
 */
export const rowName = (row: number, spelling: Spelling): string => {
  switch (spelling.silk) {
    case 'fence': return rowLabel(row);
    case 'alpha-rows': return rowLabel(spelling.rows + 1 - row);
    case 'alpha-cols': return String(spelling.rows + 1 - row);
  }
};

export const colName = (col: number, spelling: Spelling): string =>
  spelling.silk === 'alpha-cols' ? rowLabel(col) : String(col);

/** 交点そのものか (端数を持たないか)。**穴に挿すものは交点だけ**。 */
export const isCrossing = (address: Address): boolean =>
  (address.rows ?? 0) === 0 && (address.cols ?? 0) === 0;

import { LIMITS } from '../limits.ts';

/**
 * グリッドの交点 1 つ。row は上から、col は左から、どちらも **0 始まり**で数える。
 * 書き方は `x,y` (列, 行) で、**1 始まり** (`1,1` が左上)。交点の間は小数で
 * `2.5,1.25` と書く。**この 0 始まりの形が中間モデルでの正**で、綴りは入口
 * (parseAddress) と出口 (formatAddress) にしか出てこない。交点の間は整数でない
 * 値になるので、row も col も整数とは限らない。
 */
export type Address = { readonly row: number; readonly col: number };

export type Point = { readonly x: number; readonly y: number };

/** 1 マスの大きさ (cm)。隣り合うマスの間に 2 端子部品 1 個が収まる。 */
export const DEFAULT_PITCH = 2;

/** 最後の行。交点の間を書いても、この行より下へは出られない。 */
export const LAST_ROW = LIMITS.rows - 1;

/** 小数の桁で丸める。`1.1` のような値が計算のたびに末尾でぶれると、綴りが揺れる。 */
const round = (value: number): number => Number(value.toFixed(LIMITS.addressDecimals));

/**
 * 番地の 1 つの数 (列か行)。**`formatAddress` が書く形だけ**を通す: 先頭に 0 を
 * 置かない整数、小数は末尾に 0 を置かない 1〜2 桁。`2.50` `02` `2.` `.5` は通さない
 * (同じ場所の綴りは 1 つ。ネットの名前も図どうしの突き合わせも綴りで見るため)。
 */
const NUMBER = `[1-9][0-9]{0,2}(?:\\.[0-9]{0,${LIMITS.addressDecimals - 1}}[1-9])?`;

/**
 * 番地の綴り。`x,y` = 列, 行。**空白を挟まない** (部品の 1 行は空白で語を切るので、
 * `1, 1` は 2 語に割れる)。数字で始まり `,` を含むので、ピン (`U1.5`、英字で始まる) とも
 * 部品 ID とも値 (`4.7k`) とも字の形で分かれる。
 */
const ADDRESS = new RegExp(`^(${NUMBER}),(${NUMBER})$`);

/**
 * `1,1` `2.5,1.25` の形の番地を読む。読めなければ null
 * (エラー文はどう使うかを知っている側で作る)。
 */
export function parseAddress(text: string): Address | null {
  const matched = ADDRESS.exec(text);
  if (!matched) return null;
  return checked(Number(matched[2]) - 1, Number(matched[1]));
}

/**
 * 図に置ける範囲に収まっているか見て、中間モデルの形にする。
 * 交点の間も**格子の内側だけ**。最終行の間は次の行が無いところを指すので通さない。
 */
function checked(row: number, column: number): Address | null {
  if (row < 0 || row > LAST_ROW) return null;
  if (column < 1 || column > LIMITS.columns) return null;

  return { row: round(row), col: round(column - 1) };
}

/** 数 1 つを綴りにする。`String` は末尾の 0 を書かないので、読む形とそのまま揃う。 */
const numberText = (value: number): string => String(round(value));

/**
 * 番地を綴りに戻す。交点の上なら `1,1`、間なら `2.5,1.25`。
 * **読んだときと同じ綴りに戻る**ことが、ネットの名前とエラー文の拠りどころ。
 */
export function formatAddress(address: Address): string {
  // 行は必ず格子の内側に収める。parseAddress は範囲を見ているが、この綴りは
  // TeX の座標名にもなるので、万一はみ出しても格子の外を指す名前を出さない。
  const row = Math.min(LAST_ROW, Math.max(0, round(address.row)));
  return `${numberText(address.col + 1)},${numberText(row + 1)}`;
}

/** その行と列に綴りがあるなら、それ。格子の外なら null (案内に出さない)。 */
function spellingAt(row: number, column: number): string | null {
  const address = checked(row, column);
  return address === null ? null : formatAddress(address);
}

/** 番地のつもりで書いた数の組 (`2.50,1` `0,1`)。正規化や範囲で断られたものの案内に使う。 */
const NUMBER_PAIR = /^(-?[0-9]*\.?[0-9]*),(-?[0-9]*\.?[0-9]*)$/;

/** 小数の桁が文法より細かいか。 */
const tooFine = (digits: string | undefined): boolean => digits !== undefined && digits.length > LIMITS.addressDecimals;

const decimalsLimit = (): string => `番地の小数は ${LIMITS.addressDecimals} 桁までです`;

/** 書ける範囲。案内の末尾に添える。 */
export const ADDRESS_RANGE = `1,1 から ${LIMITS.columns},${LIMITS.rows} まで`;

/**
 * 番地の形 (`x,y`) で書かれたが読めなかった綴りへの案内 (無ければ null)。
 *
 * LLM に書かせて自己修正させる用途では、間違いの指摘より**正しい綴りが
 * 返ること**が効く。ここで返せるのは「言われたとおりに直せば通る」形だけにする。
 * 旧い綴り (`a1f5`) への案内は `oldSpellingHint` が返す。
 */
export function addressHint(text: string): string | null {
  if (parseAddress(text) !== null) return null;

  const pair = NUMBER_PAIR.exec(text);
  if (pair === null) return null;
  const [, xText = '', yText = ''] = pair;
  const x = Number(xText);
  const y = Number(yText);
  if (xText === '' || yText === '' || Number.isNaN(x) || Number.isNaN(y)) return null;

  if (tooFine(xText.split('.')[1]) || tooFine(yText.split('.')[1])) return decimalsLimit();

  const spelling = spellingAt(y - 1, x);
  if (spelling === null) return `番地は ${ADDRESS_RANGE}。x が列、y が行`;
  return `同じ場所の綴りは 1 つ。${spelling} と書きます`;
}

/* ------------------------------------------------------------------------
 * 旧い綴り (`a1` `a1f5`)。**読まずに断る**が、直し方を返すのと旧い文書を
 * 書き換える (`migrateAddresses`) ために、読み手だけをここに残す。
 * ---------------------------------------------------------------------- */

/** 使える英字の数 (a〜z)。 */
const LETTER_COUNT = 26;
const FIRST_LETTER = 'a'.charCodeAt(0);

/**
 * 行番号 (0 始まり) → 旧い綴りの行の英字。**表計算の列名と同じ bijective base-26** で、
 * `z` の次は `aa`、`az` の次は `ba`、`zz` の次は `aaa` と桁が増える。
 *
 * 0 始まりの 26 進数**ではない**。`aa` は 26 進数として読むと 0 と同じ値に
 * なってしまい、`a` と区別が付かない。1 始まりの番号を毎回 1 引いてから
 * 割ることで、どの桁にも「0 に当たる字」が現れない綴りになる。
 */
export function rowLetters(row: number): string {
  let count = Math.floor(row) + 1;
  let letters = '';
  while (count > 0) {
    count -= 1;
    letters = String.fromCharCode(FIRST_LETTER + (count % LETTER_COUNT)) + letters;
    count = Math.floor(count / LETTER_COUNT);
  }
  return letters;
}

/**
 * 行の英字 → 行番号 (0 始まり)。`rowLetters` の逆。
 * **必ず対で直すこと** — 片方だけ変えると、書いた綴りと読んだ場所が静かにずれる。
 */
export function rowOfLetters(letters: string): number {
  let count = 0;
  for (const letter of letters) count = count * LETTER_COUNT + (letter.charCodeAt(0) - FIRST_LETTER + 1);
  return count - 1;
}

/** 端数の 1 桁を表す英字。**`a` = 0** で、行の英字 (`a` = 0 行) と同じ数え方。 */
const FRACTION_LETTERS = 'abcdefghij';

/**
 * 旧い番地の綴り。`a1` の後ろに**「行の英字 + 列の数字」の組**を足すと交点の間を指す
 * (`a1a5` は列が半分、`a1f0` は行が半分、`a1f5` は両方)。組 1 つで小数第 1 位、
 * 2 つで第 2 位まで。
 */
const LEGACY_ADDRESS = new RegExp(`^([a-z]+)([0-9]{1,3})((?:[a-j][0-9]){0,${LIMITS.addressDecimals}})$`);

/** 組が 1 つも無いのと同じ意味になる末尾。`a1a0` は `a1` と同じ場所。 */
const EMPTY_PAIR = 'a0';

/** 組の並び → 行と列の端数。組 i は 10 の (i+1) 乗ぶんの 1 を刻む。 */
function stepsOfPairs(pairs: string): { readonly row: number; readonly col: number } {
  let row = 0;
  let col = 0;
  for (let at = 0; at < pairs.length; at += 2) {
    const scale = 10 ** (at / 2 + 1);
    row += FRACTION_LETTERS.indexOf(pairs[at] ?? 'a') / scale;
    col += Number(pairs[at + 1]) / scale;
  }
  return { row, col };
}

/**
 * **旧い読み手** (`a1` `a1a5` `b2c7f5`。大小どちらで書いてもよい)。
 * 0.34.0 までの parseAddress そのもので、読めた範囲も同じ。旧い文書を書き換える
 * (`migrateAddresses`) ときに「旧い読み手で読めた綴りだけ」を新しい綴りにするための物で、
 * **図を読むときには使わない** (旧綴りは断る)。
 */
export function legacyParseAddress(text: string): Address | null {
  const matched = LEGACY_ADDRESS.exec(text.toLowerCase());
  if (!matched) return null;

  const [, letters = '', digits = '', pairs = ''] = matched;
  if (pairs.endsWith(EMPTY_PAIR)) return null;

  const steps = stepsOfPairs(pairs);
  return checked(rowOfLetters(letters) + steps.row, Number(digits) + steps.col);
}

/** `_` で行と列を切って小数を書いていた頃の綴り (旧 `a.5_1.5` `a_1.25`)。 */
const OLD_BETWEEN = /^([a-z]+)(?:\.([0-9]+))?_([0-9]{1,3})(?:\.([0-9]+))?$/;
/** その頃の書き間違い (`a1_5` = 列の小数を `_` で切った形)。 */
const OLD_SLIP = /^([a-z]+)([0-9]{1,3})_([0-9]+)$/;
/** 旧い番地に小数を書いた綴り (`a1.5`)。 */
const OLD_DECIMAL = /^([a-z]+)([0-9]{1,3})\.([0-9]+)$/;

const fractionOf = (digits: string | undefined): number => (digits === undefined ? 0 : Number(`0.${digits}`));

/**
 * もっと旧い綴り 3 通りを、行と列に読み直す。読めなければ null、
 * 端数が文法より細かければ `'too-fine'`。
 *
 * **3 つは端数の位置が違う。** `a.5_1.5` は行の端数が英字の後ろ・列の端数が
 * 数字の後ろ、`a1_5` と `a1.5` は後ろが**列の端数**で、行の端数を書く場所が無い。
 */
function olderSpelling(text: string): Address | 'too-fine' | null {
  const between = OLD_BETWEEN.exec(text);
  const slip = between === null ? OLD_SLIP.exec(text) ?? OLD_DECIMAL.exec(text) : null;
  const parts = between !== null
    ? { letters: between[1] ?? '', rowStep: between[2], columns: between[3] ?? '', columnStep: between[4] }
    : slip !== null
      ? { letters: slip[1] ?? '', rowStep: undefined, columns: slip[2] ?? '', columnStep: slip[3] }
      : null;
  if (parts === null) return null;
  if (tooFine(parts.rowStep) || tooFine(parts.columnStep)) return 'too-fine';
  return checked(rowOfLetters(parts.letters) + fractionOf(parts.rowStep), Number(parts.columns) + fractionOf(parts.columnStep));
}

/**
 * 旧い綴りへの案内。**旧綴りは読まずに断り、直した綴りを添える**
 * (`a1f5 は旧い綴りです。1.5,1.5 と書きます`)。旧い綴りでなければ null。
 *
 * 0.34.0 までの綴り (`a1f5`) に加えて、もっと旧い `_` の綴り (`a_1.5`) と
 * 書き間違い (`a1.5`) にも返す。返す綴りは**必ず読める**ものだけ。
 */
export function oldSpellingHint(text: string): string | null {
  const lowered = text.toLowerCase();
  const legacy = legacyParseAddress(lowered);
  const older = legacy ?? olderSpelling(lowered);
  if (older === null) return null;
  if (older === 'too-fine') return decimalsLimit();
  return `${text} は旧い綴りです。${formatAddress(older)} と書きます`;
}

/**
 * TikZ の座標に付ける名前。**英字と数字だけ**にする — `,` は TikZ が座標の
 * 区切りと読み、`.` はノードのピン (`(U1.north)`) と読む。`2.5,1.25` は
 * `x2p5y1p25` (小数点を `p`、列の頭に `x`、行の頭に `y`)。英字で始まるので、
 * TikZ が数の座標と取り違えることもない。
 */
export const texNameOfAddress = (address: Address): string => {
  const [x = '', y = ''] = formatAddress(address).split(',');
  return `x${x.replace('.', 'p')}y${y.replace('.', 'p')}`;
};

/** -0 を 0 に正す。TeX に `-0` と書かれると読みにくく、出力も揺れるため。 */
const normalize = (value: number): number => (value === 0 ? 0 : value);

/**
 * 番地を TikZ の座標にする。`1,1` が原点で、列は右へ、行は下へ伸ばす
 * (TikZ の y は上が正なので行は負の向き)。
 */
export const toPoint = (address: Address, pitch: number): Point => ({
  x: normalize(address.col * pitch),
  y: normalize(-address.row * pitch),
});

/**
 * 座標を突き合わせるときの許容誤差。
 *
 * 交点の間の番地は 1/100 刻みの小数なので、掛け算の答えが 2 進小数に収まらない。
 * ちょうど線の上に乗っている点でも外積が 1e-14 ほど残り、**厳密に 0 かで見ると
 * 図では触れて見えるのにネットリストだけが割れる**。
 *
 * 絶対値で決め打てるのは、図の大きさに上限があるため。番地は 99 行 × 99 列
 * までなので、外積も内積も 1e4 を超えず、丸めの残りは 1e-12 に届かない。
 * 意味のある差 (番地の刻み 0.01 と、その積) はこの値よりずっと大きい。
 */
const EPSILON = 1e-9;

/** 丸めの残りを 0 とみなす。番地の間隔より十分に細かい幅でだけ通す。 */
export const isNearlyZero = (value: number): boolean => Math.abs(value) < EPSILON;

/**
 * 同じ交点か。2 端子部品も配線も、両端が同じだと向きも長さも決まらないので、
 * これだけは通さない。
 *
 * 斜め (行も列も揃っていない) は**通す**。回路図の定石は「配線は水平と垂直だけ」
 * だが、circuitikz は任意の角度に部品も線も引けるので、
 * 文法の側で禁じずに書き手の判断に任せる (2026-08-25 決定)。
 */
export const isSameAddress = (from: Address, to: Address): boolean =>
  isNearlyZero(from.row - to.row) && isNearlyZero(from.col - to.col);

/** 配線の引き方。TikZ と同じ 3 つだけ (学習コストを増やさない)。 */
export type WireOperator = '--' | '-|' | '|-';

/**
 * 折れた配線が曲がる場所。まっすぐな線と、曲がる場所が端と重なる並び
 * (同じ行どうしを `-|` で結んだときなど) では null。
 *
 * `-|` は先に横、`|-` は先に縦 (TikZ と同じ)。
 */
export function cornerOf(from: Address, to: Address, operator: WireOperator): Address | null {
  if (operator === '--') return null;

  const corner = operator === '-|' ? { row: from.row, col: to.col } : { row: to.row, col: from.col };
  // 端の上に乗る「曲がり」は曲がっていない。ここで外しておかないと、
  // ただの直線の端に分岐の黒丸が出てしまう。
  return isSameAddress(corner, from) || isSameAddress(corner, to) ? null : corner;
}

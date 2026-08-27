import { LIMITS } from '../limits.ts';

/**
 * グリッドの交点 1 つ。row は上から (a = 0)、col は左から (1 = 0) 数える。
 * 書き方は `a1` `b3`、交点の間なら `a_1.5` `a.5_1.5`。**この 0 始まりの形が
 * 中間モデルでの正**で、綴りは入口 (parseAddress) と出口 (formatAddress) にしか
 * 出てこない。交点の間は整数でない値になるので、row も col も整数とは限らない。
 */
export type Address = { readonly row: number; readonly col: number };

export type Point = { readonly x: number; readonly y: number };

/** 1 マスの大きさ (cm)。隣り合うマスの間に 2 端子部品 1 個が収まる。 */
export const DEFAULT_PITCH = 2;

const ROW_COUNT = 26;
/** 最後の行 (z)。交点の間を書いても、この行より下へは出られない。 */
const LAST_ROW = ROW_COUNT - 1;
const FIRST_LETTER = 'a'.charCodeAt(0);

const ADDRESS = /^([a-z])([0-9]{1,3})$/;
/**
 * 交点の間の番地。**小数を書くときは `_` で行と列を切る** (`a_1.5` `a.5_1.5`)。
 *
 * 切らずに `a1.5` と書けるようにはしない。`.` は足の区切りでもあるので
 * (`U1.5` は DIP の 5 番ピン)、切らないと**どちらのつもりで書いたのかを
 * 読む順で決めることになる**。`_` があるほうが番地、無いほうが足、と
 * 綴りだけで分かれる。
 */
const BETWEEN = new RegExp(
  `^([a-z])(?:\\.([0-9]{1,${LIMITS.addressDecimals}}))?_([0-9]{1,3})(?:\\.([0-9]{1,${LIMITS.addressDecimals}}))?$`,
);

/** 小数の桁で丸める。`1.1` のような値が計算のたびに末尾でぶれると、綴りが揺れる。 */
const round = (value: number): number => Number(value.toFixed(LIMITS.addressDecimals));

/** `.5` の形で書かれた端数。書かれていなければ 0。 */
const fractionOf = (digits: string | undefined): number => (digits === undefined ? 0 : Number(`0.${digits}`));

/**
 * `a1` `a_1.5` `a.5_1.5` の形の番地を読む。読めなければ null
 * (エラー文はどう使うかを知っている側で作る)。大小どちらで書いてもよい。
 *
 * 同じ場所の綴りは 1 つに保つ。`a_1` (小数の無い `_` 付き) と `a_1.0` は
 * `a1` と同じ場所なので通さない — 2 通りで書けると、ネットの名前も
 * 図どうしの突き合わせもその分だけ揺れる。
 */
export function parseAddress(text: string): Address | null {
  const lowered = text.toLowerCase();

  const matched = ADDRESS.exec(lowered);
  if (matched) {
    const [, letter = '', digits = ''] = matched;
    return checked(letter.charCodeAt(0) - FIRST_LETTER, Number(digits));
  }

  const between = BETWEEN.exec(lowered);
  if (!between) return null;

  const [, letter = '', rowDigits, columnDigits, columnFraction] = between;
  const rowStep = fractionOf(rowDigits);
  const columnStep = fractionOf(columnFraction);
  // 小数が無いなら `a1` と書ける場所。綴りを 2 つにしない。
  if (rowStep === 0 && columnStep === 0) return null;

  return checked(letter.charCodeAt(0) - FIRST_LETTER + rowStep, Number(columnDigits) + columnStep);
}

/**
 * 図に置ける範囲に収まっているか見て、中間モデルの形にする。
 * 交点の間も**格子の内側だけ**。`z.5` は z の次の行が無いところを指すので通さない。
 */
function checked(row: number, column: number): Address | null {
  if (row < 0 || row > LAST_ROW) return null;
  if (column < 1 || column > LIMITS.columns) return null;

  return { row: round(row), col: round(column - 1) };
}

/** `.5` の形で書き足す端数。端数が無ければ空 (`a1` のまま)。 */
const fractionText = (value: number): string => {
  const step = round(value - Math.floor(value));
  return step === 0 ? '' : String(step).slice(1);
};

/**
 * 番地を綴りに戻す。交点の上なら `a1`、間なら `a_1.5` `a.5_1.5`。
 * **読んだときと同じ綴りに戻る**ことが、ネットの名前とエラー文の拠りどころ。
 */
export function formatAddress(address: Address): string {
  const row = round(address.row);
  const column = round(address.col + 1);
  const letter = String.fromCharCode(FIRST_LETTER + Math.floor(row));

  const rowStep = fractionText(row);
  const columnStep = fractionText(column);
  if (rowStep === '' && columnStep === '') return `${letter}${column}`;

  return `${letter}${rowStep}_${Math.floor(column)}${columnStep}`;
}

/**
 * 番地として読めなかった綴りへの案内。**近い書き間違いにだけ**返す (無ければ null)。
 *
 * LLM に書かせて自己修正させる用途では、間違いの指摘より**正しい綴りが
 * 返ること**が効く。ここで返せるのは「言われたとおりに直せば通る」形だけにする。
 */
export function addressHint(text: string): string | null {
  const lowered = text.toLowerCase();
  if (lowered.includes('/')) return `分数では書けません (${LIMITS.addressDecimals} 桁までの小数で書きます。1/4 なら .25)`;

  const decimals = /^([a-z])([0-9]{1,3})\.([0-9]+)$/.exec(lowered);
  if (decimals) {
    const [, letter = '', digits = '', step = ''] = decimals;
    return step.length > LIMITS.addressDecimals
      ? `番地の小数は ${LIMITS.addressDecimals} 桁までです`
      : `交点の間は _ で行と列を切ります (${letter}_${digits}.${step})`;
  }

  const underscored = /^([a-z])([0-9]{1,3})_([0-9]{1,2})$/.exec(lowered);
  if (underscored) {
    const [, letter = '', digits = '', step = ''] = underscored;
    return `列の小数は . で書きます (${letter}_${digits}.${step})`;
  }

  const plain = /^([a-z])(?:\.0+)?_([0-9]{1,3})(?:\.0+)?$/.exec(lowered);
  if (plain) {
    const [, letter = '', digits = ''] = plain;
    return `交点の上なら ${letter}${digits} と書きます (_ は交点の間を書くときだけ)`;
  }

  return null;
}

/**
 * TikZ の座標に付ける名前。**`.` と `_` を綴りから外す**。
 * `.` は TikZ ではノードの足 (`(U1.north)`) の区切りなので、名前に入れると
 * 座標として読まれない。`a1` の形はそのまま通すので、交点だけで描いた図の
 * TeX はこれまでと 1 バイトも変わらない。
 */
export const texNameOfAddress = (address: Address): string =>
  formatAddress(address).replace(/\./g, 'p').replace(/_/g, '-');

/** -0 を 0 に正す。TeX に `-0` と書かれると読みにくく、出力も揺れるため。 */
const normalize = (value: number): number => (value === 0 ? 0 : value);

/**
 * 番地を TikZ の座標にする。`a1` が原点で、列は右へ、行は下へ伸ばす
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
 * 図では触れて見えるのにネットリストだけが割れる**。番地の刻みは 0.01 なので、
 * 意味のある差 (0.01 の差) とはこの値で十分に離れている。
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

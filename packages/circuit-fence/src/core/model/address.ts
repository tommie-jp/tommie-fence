import { LIMITS } from '../limits.ts';

/**
 * グリッドの交点 1 つ。row は上から (a = 0)、col は左から (1 = 0) 数える。
 * 書き方は `a1` `b3`。**この 0 始まりの形が中間モデルでの正**で、
 * `a1` の綴りは入口 (parseAddress) と出口 (formatAddress) にしか出てこない。
 */
export type Address = { readonly row: number; readonly col: number };

export type Point = { readonly x: number; readonly y: number };

/** 1 マスの大きさ (cm)。隣り合うマスの間に 2 端子部品 1 個が収まる。 */
export const DEFAULT_PITCH = 2;

const ROW_COUNT = 26;
const ADDRESS = /^([a-z])([0-9]{1,3})$/;

/**
 * `a1` の形の番地を読む。読めなければ null (エラー文はどう使うかを知っている側で作る)。
 * 大小どちらで書いてもよい。
 */
export function parseAddress(text: string): Address | null {
  const matched = ADDRESS.exec(text.toLowerCase());
  if (!matched) return null;

  const [, letter = '', digits = ''] = matched;
  const row = letter.charCodeAt(0) - 'a'.charCodeAt(0);
  const column = Number(digits);
  if (row < 0 || row >= ROW_COUNT) return null;
  if (column < 1 || column > LIMITS.columns) return null;

  return { row, col: column - 1 };
}

export const formatAddress = (address: Address): string =>
  `${String.fromCharCode('a'.charCodeAt(0) + address.row)}${address.col + 1}`;

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
 * 同じ交点か。2 端子部品も配線も、両端が同じだと向きも長さも決まらないので、
 * これだけは通さない。
 *
 * 斜め (行も列も揃っていない) は**通す**。回路図の定石は「配線は水平と垂直だけ」
 * だが、circuitikz は任意の角度に部品も線も引けるので、
 * 文法の側で禁じずに書き手の判断に任せる (2026-08-25 決定)。
 */
export const isSameAddress = (from: Address, to: Address): boolean =>
  from.row === to.row && from.col === to.col;

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

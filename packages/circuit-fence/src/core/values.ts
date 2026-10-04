import { lookupPartType } from './parts.ts';

/**
 * 値の数の読み方 (直下の CLAUDE.md の文法の方針 1「黙って別の意味に読まない」)。
 *
 * **素の数を受けるのは単位が 1 つに決まる所だけ** — 抵抗の仲間の Ω と電圧源の V。
 * 容量・インダクタンス・周波数・電流は接頭辞 (`47p` `10m` `16M`) か単位 (`1F`) が要る。
 * 以前は `capacitor a1 a3 47` を 47 F と黙って描いていた (ブレッドボードとユニバーサル基板は 47 pF と読んでいた)。
 *
 * 単位まで書いた綴り (`47pF` `16MHz` `5V`) は、単位を落とした綴りと同じ値に読む。
 */
type Quantity = {
  /** 値の後ろに書いてよい単位の綴り。Ω はフェンスで書けない字なので持たない。 */
  readonly symbol: string | null;
  /** 素の数を受けるか。 */
  readonly bare: boolean;
  /** 断るときの言い方 (`容量は 100n / 47p / 10u のように…`)。 */
  readonly hint: string;
};

const QUANTITIES: Readonly<Record<string, Quantity>> = {
  '\\ohm': { symbol: null, bare: true, hint: '抵抗値は 330 / 10k / 4.7k / 1M のように書きます' },
  '\\volt': { symbol: 'V', bare: true, hint: '電圧は 5 / 3.3 / 5V / 100m のように書きます' },
  '\\farad': { symbol: 'F', bare: false, hint: '容量は 100n / 47p / 10u のように接頭辞を付けます。1 F なら 1F' },
  '\\henry': { symbol: 'H', bare: false, hint: 'インダクタンスは 100u / 10m / 1H のように接頭辞か単位を付けます' },
  '\\hertz': { symbol: 'Hz', bare: false, hint: '周波数は 16M / 32.768k / 16MHz のように接頭辞か単位を付けます' },
  '\\ampere': { symbol: 'A', bare: false, hint: '電流は 1m / 10u / 1A のように接頭辞か単位を付けます' },
};

const quantityOf = (type: string): Quantity | null => {
  const unit = lookupPartType(type)?.unitSi ?? null;
  return unit === null ? null : QUANTITIES[unit] ?? null;
};

const NUMBER = '(\\d+(?:\\.\\d+)?)';
const BARE = /^\d+(?:\.\d+)?$/;

/** 数 + SI 接頭辞 (+ 単位)。種類から単位を補えるのは、これに当てはまる値だけ。 */
export type ScaledValue = { readonly digits: string; readonly prefix: string };

export function readScaled(type: string, value: string): ScaledValue | null {
  const quantity = quantityOf(type);
  if (quantity === null) return null;
  const symbol = quantity.symbol === null ? '' : `(?:${quantity.symbol})?`;
  const found = new RegExp(`^${NUMBER}([kMGmunp]?)${symbol}$`).exec(value);
  if (found === null) return null;
  return { digits: found[1] ?? '', prefix: found[2] ?? '' };
}

/**
 * 値を断る理由 (無ければ null)。
 *
 * - 単位の決まらない種類の素の数 (`capacitor … 47`)
 * - 大きい `K` (`100K`) — SI の接頭辞は小文字の k。読めずに字のまま図に出ていた
 *
 * 型番や定格 (`1N4148` `4k7`) のような、数として読んでいない値は見ない。
 */
export function unitValueProblem(type: string, value: string): string | null {
  const quantity = quantityOf(type);
  if (quantity === null) return null;
  if (BARE.test(value)) return quantity.bare ? null : `値 ${value} に接頭辞がありません (${quantity.hint})`;
  const symbol = quantity.symbol === null ? '' : `(?:${quantity.symbol})?`;
  const capital = new RegExp(`^${NUMBER}K${symbol}$`).exec(value);
  if (capital !== null) return `値 ${value} の K は小文字の k で書きます (${capital[1] ?? ''}k)`;
  return null;
}

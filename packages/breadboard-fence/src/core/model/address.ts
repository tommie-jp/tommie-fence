import type { Address, HoleRow } from '../types.ts';

const HOLE_PATTERN = /^([a-j])(\d{1,2})$/;
const RAIL_PATTERN = /^([+-])([tb])(\d{1,2})$/;

/** 穴番地 (`a5`) と電源レール番地 (`+t5`) の文字列を解釈する。列数の上限はボードが判定する。 */
export function parseAddress(text: string): Address | null {
  // 行ラベルは大文字でも印字できる (board.letters) ので、番地は大小どちらでも受けて小文字に正規化する。
  const token = text.toLowerCase();

  const hole = HOLE_PATTERN.exec(token);
  if (hole) {
    const [, row, digits] = hole;
    const col = Number(digits);
    return col >= 1 ? { kind: 'hole', row: row as HoleRow, col } : null;
  }

  const rail = RAIL_PATTERN.exec(token);
  if (rail) {
    const [, polarity, side, digits] = rail;
    const col = Number(digits);
    return col >= 1 ? { kind: 'rail', polarity: polarity as '+' | '-', side: side as 't' | 'b', col } : null;
  }

  return null;
}

export function formatAddress(address: Address): string {
  return address.kind === 'hole'
    ? `${address.row}${address.col}`
    : `${address.polarity}${address.side}${address.col}`;
}

/** 溝より上のブロック (a〜e) かどうか。 */
export function isTopBlock(row: HoleRow): boolean {
  return row <= 'e';
}

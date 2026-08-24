import type { Address, Board, BoardSize, StripId } from '../types.ts';
import { isTopBlock } from './address.ts';

const COLUMNS: Record<BoardSize, number> = { half: 30, full: 63 };

export function createBoard(size: BoardSize): Board {
  return { size, columns: COLUMNS[size] };
}

export function isOnBoard(board: Board, address: Address): boolean {
  return address.col >= 1 && address.col <= board.columns;
}

/**
 * 番地が属する導通グループ。ブレッドボードの物理そのもの:
 * 同じ列の a〜e (と f〜j) は内部でつながり、電源レールは 1 本まるごとつながる。
 */
export function stripOf(address: Address): StripId {
  if (address.kind === 'rail') return `rail:${address.polarity}${address.side}`;
  return `${isTopBlock(address.row) ? 'top' : 'bottom'}:${address.col}`;
}

/** 部品を持たない仮想ストリップ (ボード外の機器のピン)。 */
export const devicePinStrip = (partId: string, pin: string): StripId => `pin:${partId}.${pin}`;

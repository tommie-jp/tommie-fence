import { LIMITS } from '../limits.ts';
import type { Address, Board, BoardSize, StripId } from '../types.ts';
import { formatAddress, rowLabel } from './address.ts';

// 「28x18」。板は「72×47.5mm」のように長辺 × 短辺で売られているので、
// 同じ順 (列 × 行) で書く。大文字の X と前後の空白も受ける。
const SIZE = /^\s*([0-9]+)\s*[xX]\s*([0-9]+)\s*$/;

/**
 * 板の大きさを読む。**名前の付いた板 (`akizuki-c` など) はまだ持たない。**
 * 秋月の商品ページは寸法とピッチしか書いておらず、穴数の一次情報が無いため
 * (52 の docs/05)。実物で数えるまでは、書く人が自分の板を見て書く。
 */
export function parseBoardSize(text: string): BoardSize | null {
  const found = SIZE.exec(text);
  if (!found) return null;

  const cols = Number(found[1]);
  const rows = Number(found[2]);
  if (cols < 1 || rows < 1) return null;
  // 上限が無いと、フェンス 1 つで巨大な SVG を作らせられる。
  if (cols > LIMITS.cols || rows > LIMITS.rows) return null;
  return { cols, rows };
}

export const createBoard = (size: BoardSize): Board => ({ cols: size.cols, rows: size.rows });

/**
 * 番地がこの板に無い理由。載るなら null。
 * **報告する側はこれをそのまま出す**: 行が足りないのか列が足りないのかで
 * 直す手が違うので、どちらなのかを言い分けないと手がかりにならない。
 */
export function offBoardReason(board: Board, address: Address): string | null {
  if (address.col > board.cols) {
    return `${formatAddress(address)} は板の外です (1〜${board.cols} 列)`;
  }
  if (address.row > board.rows) {
    return `${formatAddress(address)} は板の外です (a〜${rowLabel(board.rows)} の ${board.rows} 行)`;
  }
  return null;
}

export const isOnBoard = (board: Board, address: Address): boolean => offBoardReason(board, address) === null;

/**
 * 番地が属する導通グループ。**ユニバーサル基板は全穴が独立している**ので、
 * 穴 1 つがそのままグループになる。ブレッドボードは同じ列の 5 穴が内部で
 * つながっていて列がグループになるが、ここには内部の導通が無い。
 * 導通は配線でしか生まれず、ネットは配線がつないだ穴の集まりになる。
 */
export const holeStrip = (address: Address): StripId => `hole:${address.row},${address.col}`;

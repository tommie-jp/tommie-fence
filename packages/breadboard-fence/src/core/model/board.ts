import { DEFAULT_BOARD, RAIL_ROWS } from '../types.ts';
import type { Address, Board, BoardSize, BoardSpec, RailOrder, RailRow, StripId } from '../types.ts';
import { formatAddress, isTopBlock } from './address.ts';

const COLUMNS: Record<BoardSize, number> = { half: 30, full: 63 };

/**
 * サイズごとのレールの既定。実物の系列に合わせる: 400 / 830 穴にはレールが付いており、
 * 170 穴のミニには無い。**サイズが決めるのはここまで**で、`rails` を書けば覆せる。
 */
const DEFAULT_RAILS: Record<BoardSize, RailOrder | null> = { half: RAIL_ROWS, full: RAIL_ROWS };

export const defaultRails = (size: BoardSize): RailOrder | null => DEFAULT_RAILS[size];

/** サイズだけ渡されたら印字は既定値で埋める (テストやツールからの近道)。 */
export function createBoard(spec: BoardSize | BoardSpec): Board {
  const filled = typeof spec === 'string'
    ? { ...DEFAULT_BOARD, size: spec, rails: defaultRails(spec) }
    : spec;
  // フェンス入力なら railOrder が検証済み。ここで落ちるのは API の使い方の誤りで、
  // 素通しすると欠けたレールが y=0 に無言で描かれてしまう。
  if (filled.rails !== null && new Set(filled.rails).size !== RAIL_ROWS.length) {
    throw new Error(`rails はレール 4 本の並べ替えで指定します: ${filled.rails.join(', ')}`);
  }
  return { ...filled, columns: COLUMNS[filled.size] };
}

/**
 * `+--+` のような上から順の極性 4 文字をレールの並びに読む。
 * 実物のレール印字はメーカーで割れているが、上下とも + と - が 1 本ずつなのは共通。
 */
export function railOrder(pattern: string): RailOrder | null {
  const signs = /^([+-])([+-])([+-])([+-])$/.exec(pattern);
  if (!signs) return null;
  const [, topOuter = '', topInner = '', bottomInner = '', bottomOuter = ''] = signs;
  if (topOuter === topInner || bottomInner === bottomOuter) return null;

  // 正規表現が + / - しか通さないので、ここだけ型に教える。
  const rail = (sign: string, side: 't' | 'b'): RailRow => `${sign as '+' | '-'}${side}`;
  return [rail(topOuter, 't'), rail(topInner, 't'), rail(bottomInner, 'b'), rail(bottomOuter, 'b')];
}

/**
 * 番地がこのボードに無い理由。置けるなら null。
 * **報告する側はこれをそのまま出す**: 「列が足りない」と「レールが無い」で
 * 直す手は違うので、どちらなのかを言い分けないと手がかりにならない。
 */
export function offBoardReason(board: Board, address: Address): string | null {
  if (address.kind === 'rail' && board.rails === null) {
    return `${formatAddress(address)} は電源レールですが、このボードにレールはありません (board の rails で付けられます)`;
  }
  if (address.col < 1 || address.col > board.columns) {
    return `${formatAddress(address)} はボードの外です (1〜${board.columns} 列)`;
  }
  return null;
}

export function isOnBoard(board: Board, address: Address): boolean {
  return offBoardReason(board, address) === null;
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

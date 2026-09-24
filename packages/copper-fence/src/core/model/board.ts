import { LIMITS } from '../limits.ts';
import type { Board, Ground, Mm, Side } from '../types.ts';
import { formatMm } from './point.ts';

/** 書ける地の在りか。**並びが文書の並び**。 */
export const GROUNDS: readonly Ground[] = ['back', 'front', 'both', 'none'];

export const isGround = (text: string): text is Ground => (GROUNDS as readonly string[]).includes(text);

/**
 * 書かなかったときの板。**40×20mm は本の 3-12 / 3-13 の治具の大きさ**、
 * 1.6mm と 4.4 は FR4 のいちばん多い値、裏ベタはマイクロストリップ。
 * 書き始める前から止めない (52 の docs/54) ために持つ。
 */
export const DEFAULT_SIZE = '40x20mm';
export const DEFAULT_H = 1.6;
export const DEFAULT_ER = 4.4;
export const DEFAULT_GROUND: Ground = 'back';
/** 表が地の板で、島のまわりに切る溝。カッターの刃 2 回ぶん。 */
export const DEFAULT_CUT = 0.5;

/**
 * 大きさ。**単位は要る** — 穴の数が無い板なので `40x20` は mm のつもりだが、
 * perfboard では同じ綴りが穴数になる。黙って読むと 2 つのフェンスで同じ字が
 * 別の意味になるので、単位を書かせる。
 */
const SIZE = /^\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(mm|cm)\s*$/;
const BARE = /^\s*\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?\s*$/;

export const SIZE_HINT = `大きさは 幅x高さ に単位を付けて書きます (例: ${DEFAULT_SIZE}、4x2cm)`;

export type SizeResult =
  | { readonly ok: true; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly reason: string };

export function resolveSize(text: string): SizeResult {
  if (BARE.test(text)) {
    return { ok: false, reason: `単位を付けます (${text.trim()}mm)。この板には穴の数がありません` };
  }
  const found = SIZE.exec(text);
  if (found === null) return { ok: false, reason: SIZE_HINT };
  const scale = found[3] === 'cm' ? 10 : 1;
  const width = Number(found[1]) * scale;
  const height = Number(found[2]) * scale;
  const { boardMin: min, boardMax: max } = LIMITS;
  if (width < min || height < min || width > max || height > max) {
    return { ok: false, reason: `板の辺は ${min}〜${max}mm です` };
  }
  return { ok: true, width, height };
}

export const createBoard = (width: number, height: number, rest: Partial<Omit<Board, 'width' | 'height'>> = {}): Board => ({
  width,
  height,
  h: rest.h ?? DEFAULT_H,
  er: rest.er ?? DEFAULT_ER,
  ground: rest.ground ?? DEFAULT_GROUND,
  cut: rest.cut ?? DEFAULT_CUT,
});

/** 書かれなかったときの板そのもの。**綴りから起こす** (片方だけ直すと食い違うため)。 */
export const DEFAULT_BOARD: Board = (() => {
  const size = resolveSize(DEFAULT_SIZE);
  if (!size.ok) throw new Error(`既定の板を読めません: ${DEFAULT_SIZE}`);
  return createBoard(size.width, size.height);
})();

/** 表に地があるか (線路の両脇が溝になる板)。 */
export const hasFrontGround = (board: Board): boolean => board.ground === 'front' || board.ground === 'both';

/** 裏に地があるか (via が地へ落ちる板)。 */
export const hasBackGround = (board: Board): boolean => board.ground === 'back' || board.ground === 'both';

/** 点が板の上か (縁を含む)。 */
export const isOnBoard = (board: Board, point: Mm): boolean =>
  point.x >= 0 && point.x <= board.width && point.y >= 0 && point.y <= board.height;

/** 点が板から離れすぎている理由。置けるなら null (注釈は板の外にも書ける)。 */
export function farFromBoard(board: Board, point: Mm): string | null {
  const reach = LIMITS.offBoard;
  const inside = point.x >= -reach && point.x <= board.width + reach
    && point.y >= -reach && point.y <= board.height + reach;
  return inside ? null : `板から離れすぎです (板の外は ${reach}mm まで)`;
}

/** 辺の上の点。`left 10` は `0,10`、`top 5` は `5,0`。 */
export function edgePoint(board: Board, side: Side, offset: number): Mm {
  switch (side) {
    case 'left': return { x: 0, y: offset };
    case 'right': return { x: board.width, y: offset };
    case 'top': return { x: offset, y: 0 };
    case 'bottom': return { x: offset, y: board.height };
  }
}

/** 辺の長さ (その辺に沿って測れる範囲)。 */
export const edgeLength = (board: Board, side: Side): number =>
  (side === 'left' || side === 'right' ? board.height : board.width);

/** 辺から板の内へ向かう単位の向き。 */
export function inward(side: Side): Mm {
  switch (side) {
    case 'left': return { x: 1, y: 0 };
    case 'right': return { x: -1, y: 0 };
    case 'top': return { x: 0, y: 1 };
    case 'bottom': return { x: 0, y: -1 };
  }
}

/** 地の在りかの読み (図の下の 1 行に出す)。 */
const GROUND_WORDS: Readonly<Record<Ground, string>> = {
  back: '裏: ベタ GND',
  front: '表: GND (溝で切る)',
  both: '表・裏: GND',
  none: '地なし',
};

/** 図の下に出す板の 1 行 (`40×20 mm  h 1.6  εr 4.4  裏: ベタ GND`)。 */
export const describeBoard = (board: Board): string =>
  `${formatMm(board.width)}×${formatMm(board.height)} mm  h ${formatMm(board.h)}  εr ${formatMm(board.er)}  ${GROUND_WORDS[board.ground]}`;

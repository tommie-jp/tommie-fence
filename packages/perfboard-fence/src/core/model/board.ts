import { LIMITS } from '../limits.ts';
import type { Address, Board, BoardSize, StripId } from '../types.ts';
import { formatAddress, rowLabel } from './address.ts';
import type { CatalogBoard } from './catalog.ts';
import { boardNames, describeBoard, lookupBoard, nearestBoard, parseMillimetres } from './catalog.ts';

// 「25x15」。板は「72×47mm」のように長辺 × 短辺で売られているので、
// 同じ順 (列 × 行) で書く。大文字の X と前後の空白、それに全角の × も受ける
// (報告も表も `25×15` と書くので、読めないと食い違う)。
const SIZE = /^\s*([0-9]+)\s*[xX×]\s*([0-9]+)\s*$/;

/** 板の仕上げ。書かれていないものは null で、テーマの既定 (緑と銀) が出る。 */
export type BoardFinish = {
  readonly slots?: boolean;
  readonly color?: string | null;
  readonly land?: string | null;
  readonly slotColor?: string | null;
};

export const createBoard = (size: BoardSize, finish: BoardFinish = {}): Board => ({
  cols: size.cols,
  rows: size.rows,
  slots: finish.slots ?? false,
  color: finish.color ?? null,
  land: finish.land ?? null,
  slotColor: finish.slotColor ?? null,
});

/**
 * スロット用の銅箔を並べる辺。**短いほうの両端**で、列が多ければ左右
 * (`sides`)、行が多ければ上下 (`ends`)。銅箔が無ければ null。
 *
 * **場所を決めるのはここ 1 か所。** 寸法 (`createLayout`) と描画
 * (`render/slots.ts`) が別々に決めると、板の余白と銅箔の位置が食い違う。
 */
export const slotEdges = (board: Board): 'sides' | 'ends' | null =>
  !board.slots ? null : board.cols >= board.rows ? 'sides' : 'ends';

/**
 * `board:` の値。読めたときは板と、名前で書かれたならその板、
 * 読めているが取り違えかもしれないときはお知らせが付く。
 */
export type BoardResolution =
  | {
      readonly ok: true;
      readonly board: Board;
      /** 名前 (または実寸) で書かれたときのカタログの板。穴数直書きなら null。 */
      readonly named: CatalogBoard | null;
      /** 読めてはいるが取り違えかもしれないときの一言。 */
      readonly notice: string | null;
    }
  | { readonly ok: false; readonly reason: string };

const SIZE_HINT = `穴数は 列x行 で書きます (例: 25x15)。上限は ${LIMITS.cols}x${LIMITS.rows} です`;
const NAME_HINT = `名前で書くなら ${boardNames().join(' / ')} です`;

/** 大きすぎるだけなのか、綴りが読めないのか。**直す手が違うので言い分ける。** */
const tooBig = (size: BoardSize): boolean => size.cols > LIMITS.cols || size.rows > LIMITS.rows;

/**
 * `board:` に書かれた綴りを板にする。受けるのは 3 つ。
 *
 * - `25x15` — **穴数**。単位が無ければこれ。primitive で、他は全部ここへ落ちる
 * - `akizuki-c` / `c` — **名前**。カタログを引く
 * - `72x47mm` / `7.2x4.7cm` — **実寸の綴り**。これも名前で、同じ板の別の呼び方
 *
 * **実寸を 2.54 で割らない。** 縁の余白は板ごとにも辺ごとにも違うので、
 * 割り算では穴数が出ない (`catalog.ts` の頭書き)。数えた板だけを名前で引く。
 */
export function resolveBoard(text: string): BoardResolution {
  const named = lookupBoard(text);
  if (named) {
    return { ok: true, board: createBoard({ cols: named.cols, rows: named.rows }), named, notice: null };
  }

  const mm = parseMillimetres(text);
  if (mm) {
    // 実寸として読めたのに持っていない板。**丸めて近い板を当てない** —
    // 7×5cm (汎用基板) と 72×47mm (秋月 C) は別の板で、穴数も違う。
    const near = nearestBoard(mm);
    // 近い板が挙がるなら、そこまで言えば足りる。名前を全部並べ直すと
    // **本当に読んでほしい 1 行が長さに埋もれる**。
    if (near) {
      return {
        ok: false,
        reason: `その実寸の板は持っていません。近いのは ${describeBoard(near)}。`
          + `その板なら board: ${near.key}、別の板なら穴数を 列x行 で書きます`,
      };
    }
    return { ok: false, reason: `その実寸の板は持っていません。${NAME_HINT}。${SIZE_HINT}` };
  }

  const parsedRaw = SIZE.exec(text);
  if (parsedRaw) {
    const size = { cols: Number(parsedRaw[1]), rows: Number(parsedRaw[2]) };
    if (size.cols < 1 || size.rows < 1) return { ok: false, reason: SIZE_HINT };
    // 上限が無いと、フェンス 1 つで巨大な SVG を作らせられる。
    if (tooBig(size)) {
      return { ok: false, reason: `板が大きすぎます。上限は ${LIMITS.cols}x${LIMITS.rows} です` };
    }
    // 単位を書き忘れた取り違えは黙って通る (`72x47` は 72 列 47 行として読める)。
    // **図は出るが別物**なので、エラーではなくお知らせで言う。
    const asSize = lookupBoard(`${parsedRaw[1]}x${parsedRaw[2]}mm`);
    const notice = asSize === null
      ? null
      : `${parsedRaw[1]}x${parsedRaw[2]} は穴数として読みました (${size.cols} 列 ${size.rows} 行)。`
        + `${parsedRaw[1]}×${parsedRaw[2]}mm の板のことなら board: ${asSize.key} と書きます`;
    return { ok: true, board: createBoard(size), named: null, notice };
  }

  return { ok: false, reason: `板として読めません。${NAME_HINT}。${SIZE_HINT}` };
}

/**
 * 板の外へ出てよい距離 (穴の数)。**縁の銅箔 (1 つ外) と、そこへ寄せる足**が
 * 書ければ足りる。無制限にすると、番地 1 つで画布をいくらでも伸ばせる
 * (`cols` / `rows` に上限を置いたのと同じ理由)。
 */
export const OFF_BOARD_REACH = 4;

/**
 * 番地がこの板から離れすぎている理由。置けるなら null。
 *
 * **板の外は指せる。** 縁の銅箔 (スロット) は穴の格子のちょうど 1 つ外に
 * 並んでいるし、端面実装のコネクタは板から張り出す。指せないと、
 * それらへ配線を引けない。ただし**離れすぎは断る** (上の `OFF_BOARD_REACH`)。
 *
 * **報告する側はこれをそのまま出す**: 行が足りないのか列が足りないのかで
 * 直す手が違うので、どちらなのかを言い分けないと手がかりにならない。
 */
export function offBoardReason(board: Board, address: Address): string | null {
  const reach = OFF_BOARD_REACH;
  if (address.col > board.cols + reach || address.col < 1 - reach) {
    return `${formatAddress(address)} は板から離れすぎです`
      + ` (板は 1〜${board.cols} 列、外は ${reach} つ先まで)`;
  }
  if (address.row > board.rows + reach || address.row < 1 - reach) {
    return `${formatAddress(address)} は板から離れすぎです`
      + ` (板は a〜${rowLabel(board.rows)} の ${board.rows} 行、外は ${reach} つ先まで)`;
  }
  return null;
}

/** 板の穴の上か。**板の外の番地は穴ではない** — 縁の銅箔や、板から張り出す先。 */
export const isOnBoard = (board: Board, address: Address): boolean =>
  address.col >= 1 && address.col <= board.cols && address.row >= 1 && address.row <= board.rows;

/**
 * 番地が属する導通グループ。**ユニバーサル基板は全穴が独立している**ので、
 * 穴 1 つがそのままグループになる。ブレッドボードは同じ列の 5 穴が内部で
 * つながっていて列がグループになるが、ここには内部の導通が無い。
 * 導通は配線でしか生まれず、ネットは配線がつないだ穴の集まりになる。
 */
export const holeStrip = (address: Address): StripId => `hole:${address.row},${address.col}`;

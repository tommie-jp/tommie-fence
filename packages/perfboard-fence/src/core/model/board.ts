import { LIMITS } from '../limits.ts';
import type { Address, Board, BoardMaterial, BoardSize, StripId } from '../types.ts';
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
  readonly h?: number;
  readonly material?: BoardMaterial;
};

/**
 * 基材の厚さの既定 (mm)。**確かめた売り物がどれも 1.6mm だった** — アリエクスプレスの
 * FR-4 両面スルーホール、秋月の C タイプ (FR-4 版・ガラスコンポジット版とも)。
 * 0.8mm もあるが品種が少ない (秋月の A タイプの 0.8mm 厚など)。
 */
export const DEFAULT_H = 1.6;

/** 基材の既定。**アリエクスプレスの定番 (FR-4・1.6mm・両面スルーホール)** に揃える。 */
export const DEFAULT_MATERIAL: BoardMaterial = 'FR-4';

/** 書ける基材。**売り場の表記のまま** — 本文や商品ページの字をそのまま写せるように。 */
export const MATERIALS: readonly BoardMaterial[] = ['FR-4', 'CEM-3', 'CEM-1', 'FR-1', 'FR-2', 'FR-3'];

/** 厚さの上限と下限 (mm)。copper フェンスの `h:` と同じ幅。 */
export const H_MIN = 0.1;
export const H_MAX = 10;

/** `1.6mm`。**単位が要る** (文法の方針 1)。copper フェンスの長さと同じ綴り。 */
const LENGTH = /^(\d{1,3}(?:\.\d{1,3})?)mm$/;
const BARE_LENGTH = /^\d{1,3}(?:\.\d{1,3})?$/;

/** 厚さを読む。読めなければ直し方を添えた理由。 */
export function parseThickness(text: string): { readonly ok: true; readonly h: number } | { readonly ok: false; readonly reason: string } {
  const trimmed = text.trim();
  const found = LENGTH.exec(trimmed);
  const value = found === null ? Number.NaN : Number(found[1]);
  if (Number.isFinite(value) && value >= H_MIN && value <= H_MAX) return { ok: true, h: value };
  // 素の数は mm とも穴数とも読めるので断る。直し方 (単位を付けた綴り) を言う。
  const hint = BARE_LENGTH.test(trimmed) ? ` (単位 mm を付けます: ${trimmed}mm)` : '';
  return { ok: false, reason: `board の h は基材の厚さを ${H_MIN}mm〜${H_MAX}mm で書きます (例: h: 1.6mm)${hint}` };
}

/**
 * 基材を読む。**大小は問わず、表記に揃えて返す** (`fr-4` → `FR-4`)。
 * ハイフンの無い `FR4` は受けない — 正の綴りを 1 つにする (文法の方針 5)。
 */
export function parseMaterial(text: string): BoardMaterial | null {
  const wanted = text.trim().toUpperCase();
  return MATERIALS.find((m) => m === wanted) ?? null;
}

/**
 * `board:` が書かれていないときの板。**書き始める前から止めない**ために持つ
 * (52 の docs/54)。綴りは文法リファレンスの見本と同じ `25x15` で、
 * エディタが最初の部品を置いたときにこの綴りが書かれる。
 */
export const DEFAULT_BOARD_SIZE = '25x15';

export const createBoard = (size: BoardSize, finish: BoardFinish = {}): Board => ({
  cols: size.cols,
  rows: size.rows,
  slots: finish.slots ?? false,
  color: finish.color ?? null,
  land: finish.land ?? null,
  slotColor: finish.slotColor ?? null,
  h: finish.h ?? DEFAULT_H,
  material: finish.material ?? DEFAULT_MATERIAL,
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
    return { ok: true, board: createBoard(size), named: null, notice: unitlessNotice(size) };
  }

  return { ok: false, reason: `板として読めません。${NAME_HINT}。${SIZE_HINT}` };
}

/**
 * 単位の無い `列x行` が**実寸の書き忘れかもしれない**ときの一言。無ければ null。
 *
 * `72x47` は 72 列 47 行として読める — **図は出るが別物**なので、エラーではなく
 * お知らせで言う。持っている板と寸分違わない時だけでなく、**近い板がある時も言う**
 * (`70x50` は 7×5cm の汎用基板のつもりが多い。実寸の綴りに掛けているのと同じ
 * `nearestBoard` の判定を、単位の無い綴りにも掛ける)。
 */
function unitlessNotice(size: BoardSize): string | null {
  const read = `${size.cols}x${size.rows} は穴数として読みました (${size.cols} 列 ${size.rows} 行)。`;
  const asMm = `${size.cols}×${size.rows}mm`;
  const exact = lookupBoard(`${size.cols}x${size.rows}mm`);
  if (exact !== null) return `${read}${asMm} の板のことなら board: ${exact.key} と書きます`;
  const near = nearestBoard([size.cols, size.rows]);
  if (near === null) return null;
  return `${read}${asMm} の板のことなら、持っている中で近いのは ${describeBoard(near)}`
    + ` — その板なら board: ${near.key} と書きます`;
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
 * スロット用の銅箔の番地か。**穴の並びのすぐ外**の 1 列 (または 1 行) が
 * それに当たる — 描く側 (`render/slots.ts`) が穴 1 つぶん離した所に置いている。
 *
 * `slots:` を書いていない板には無い (そこはただの余白)。
 */
export function isSlot(board: Board, address: Address): boolean {
  const edges = slotEdges(board);
  if (edges === null) return false;
  return edges === 'sides'
    ? (address.col === 0 || address.col === board.cols + 1)
      && address.row >= 1 && address.row <= board.rows
    : (address.row === 0 || address.row === board.rows + 1)
      && address.col >= 1 && address.col <= board.cols;
}

/**
 * 半田付けできる場所か。**穴とスロットの銅箔**が当たる。
 *
 * 部品の足は穴にしか挿さらない (銅箔には穴が無い) が、**配線は半田付けなので
 * 銅箔にも付く** — 実物のスロットはそのために付いている (電源の引き回し)。
 * だから置く先は `isOnBoard`、配線の端は `isSolderable` で見る。
 */
export const isSolderable = (board: Board, address: Address): boolean =>
  isOnBoard(board, address) || isSlot(board, address);

/**
 * 番地が属する導通グループ。**ユニバーサル基板は全穴が独立している**ので、
 * 穴 1 つがそのままグループになる。ブレッドボードは同じ列の 5 穴が内部で
 * つながっていて列がグループになるが、ここには内部の導通が無い。
 * 導通は配線でしか生まれず、ネットは配線がつないだ穴の集まりになる。
 */
export const holeStrip = (address: Address): StripId => `hole:${address.row},${address.col}`;

/**
 * `board:` が書かれていないときに使う板そのもの。**綴りから起こす** —
 * `DEFAULT_BOARD_SIZE` と別々に数を書くと、片方だけ直したときに
 * **エディタが書く綴りと当たり判定の板が食い違う** (この枝がいちばん避けたい形)。
 */
export const DEFAULT_BOARD: Board = (() => {
  const found = resolveBoard(DEFAULT_BOARD_SIZE);
  // 綴りは固定なので読めないことは無い。読めなければ作りの間違いなので気づける形にする。
  if (!found.ok) throw new Error(`既定の板を読めません: ${DEFAULT_BOARD_SIZE}`);
  return found.board;
})();

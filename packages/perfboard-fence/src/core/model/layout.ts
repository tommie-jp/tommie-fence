import { slotEdges } from './board.ts';
import type { Address, Board, Point, Rect } from '../types.ts';

/** 穴の間隔。2.54 mm を 20 px として描く (breadboard と同じ。並べたとき縮尺が揃う)。 */
export const PITCH = 20;

/** 画布の縁から板まで。行と列の名前がここに入る。 */
const OUTER_MARGIN = 14;
const LABEL_GUTTER = 16;
/** 板の縁から一番外の穴まで。実物にも縁の余白がある。 */
const BOARD_PAD = 12;
/** 題を置く帯の高さ。題が無ければ空けない。 */
const TITLE_BAND = 26;
/** 板の外の機器を置く帯の高さと、板との間。機器が無ければ空けない。 */
const DEVICE_BAND = 56;
const DEVICE_GAP = 26;
/** 書き出し (`- source`) の帯と、その上にあるものとの間。書かれていなければ空けない。 */
const SOURCE_GAP = 16;
/** 半田面の板と、表の図との間。出さなければ空けない。 */
const BACK_GAP = 8;

export type LayoutOptions = {
  readonly title?: boolean;
  /** 板の上に機器を置く帯を空けるか。 */
  readonly deviceTop?: boolean;
  readonly deviceBottom?: boolean;
  /**
   * 書き出し (`- source`) の帯の大きさ。**測るのは描画側**で、ここは置く場所を
   * 決めるだけ (字の大きさを知っているのはテーマなので、寸法は渡してもらう)。
   */
  readonly source?: { readonly width: number; readonly height: number } | null;
  /**
   * 板を裏返して置くか (半田面)。**列だけが左右に入れ替わる** — 板を縦軸で
   * ひっくり返すので、行はそのまま。図の形は表と同じなので、寸法は動かない。
   */
  readonly mirror?: boolean;
  /**
   * 半田面の板を置くぶんの高さ。**板の下、書き出しの上**に空ける
   * (2 枚の板を並べてから、写しを最後に置く)。高さを測るのは呼ぶ側 —
   * 半田面は自分の `Layout` を持つので、その `height` をそのまま渡す。
   */
  readonly back?: { readonly height: number } | null;
  /**
   * 穴の名前を右と下にも出すか。**出す辺には余白が要る** — 板の寸法だけで
   * 画布を決めると、右と下の名前が画布の外へ出て黙って切れる。
   */
  readonly labelRight?: boolean;
  readonly labelBottom?: boolean;
};

/** 板の外の機器を並べる帯。 */
export type Band = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Layout = {
  readonly pitch: number;
  readonly width: number;
  readonly height: number;
  /** 板そのものの矩形。穴はこの内側に並ぶ。 */
  readonly board: Rect;
  /** 題のベースライン。題が無ければ板の上端と同じで、誰も使わない。 */
  readonly titleBaseline: number;
  /** 板の外の機器を置く帯。空けていなければ null。 */
  readonly deviceBands: { readonly top: Band | null; readonly bottom: Band | null };
  /** フェンスの中身を書き出す帯。書き出しが無ければ null。 */
  readonly sourceBand: Band | null;
  /** 半田面の板を置く上端 (この分だけ下へずらして描く)。出さなければ null。 */
  readonly backTop: number | null;
  colX(col: number): number;
  rowY(row: number): number;
  point(address: Address): Point;
};

/**
 * 番地を画布の座標に落とす。**格子は一様**で、ブレッドボードの `ravineY`
 * (溝) や `lanes` (配線レーン) にあたるものは無い。
 * ユニバーサル基板には溝も電源レールも無く、穴はどこも同じ間隔で並ぶ。
 *
 * **描くのは部品面の 1 枚だけ。** 実物には半田面もあるが、想定している
 * 使い方 (自分で決めた配置で組み、その図を手順書にする) で見るのは部品面。
 * 半田面を足すなら x を反転した写像で足せるので、ここの形は変わらない。
 */
export function createLayout(board: Board, options: LayoutOptions = {}): Layout {
  const titleBand = options.title === true ? TITLE_BAND : 0;
  const topBand = options.deviceTop === true ? DEVICE_BAND + DEVICE_GAP : 0;
  const bottomBand = options.deviceBottom === true ? DEVICE_BAND + DEVICE_GAP : 0;
  const source = options.source ?? null;
  const back = options.back ?? null;
  const boardX = OUTER_MARGIN + LABEL_GUTTER;
  const boardY = OUTER_MARGIN + LABEL_GUTTER + titleBand + topBand;

  // **銅箔を並べる辺は、縁を 1 ピッチぶん広げる。** 銅箔は穴ではないので、
  // 穴と同じ間隔だけ離して置く — 詰めると穴の列の続きに見えて、挿せると読める。
  const edges = slotEdges(board);
  const slotX = edges === 'sides' ? PITCH : 0;
  const slotY = edges === 'ends' ? PITCH : 0;
  const boardWidth = (BOARD_PAD + slotX) * 2 + (board.cols - 1) * PITCH;
  const boardHeight = (BOARD_PAD + slotY) * 2 + (board.rows - 1) * PITCH;

  // 裏返すと 1 列目が右端に来る。**穴の並びだけを写す**ので、字は裏返さない
  // (鏡文字は読めない。実物の裏面もシルクは無いか、読めるように刷ってある)。
  const mirror = options.mirror === true;
  const colX = (col: number): number =>
    boardX + BOARD_PAD + slotX + (mirror ? board.cols - col : col - 1) * PITCH;
  const rowY = (row: number): number => boardY + BOARD_PAD + slotY + (row - 1) * PITCH;

  // **書き出しは板より広くなることがある。** 板が細いフェンス (`4x30` など) で
  // 板幅に切ると書き出しが `…` だらけになり、写して動かすという値打ちが消える。
  // 切るのではなく画布のほうを広げる。
  const labelRight = options.labelRight === true ? LABEL_GUTTER : 0;
  const labelBottom = options.labelBottom === true ? LABEL_GUTTER : 0;
  const bandWidth = Math.max(boardWidth + labelRight, source?.width ?? 0);
  // 縦の積み方: 題 → 上の機器 → 板 → 下の機器 → 半田面 → 書き出し。
  // **板 2 枚を続けて置く** — 間に写しが挟まると、表と裏が別の図に見える。
  const backTop = boardY + boardHeight + labelBottom + bottomBand + BACK_GAP;
  const backBand = back === null ? 0 : BACK_GAP + back.height;
  const sourceTop = boardY + boardHeight + labelBottom + bottomBand + backBand + SOURCE_GAP;

  return {
    pitch: PITCH,
    width: boardX + bandWidth + OUTER_MARGIN,
    height: boardY + boardHeight + labelBottom + bottomBand + backBand
      + (source === null ? 0 : SOURCE_GAP + source.height) + OUTER_MARGIN,
    board: { x: boardX, y: boardY, width: boardWidth, height: boardHeight },
    titleBaseline: OUTER_MARGIN + titleBand - 6,
    deviceBands: {
      top: options.deviceTop === true
        ? { x: boardX, y: boardY - topBand, width: boardWidth, height: DEVICE_BAND }
        : null,
      bottom: options.deviceBottom === true
        ? { x: boardX, y: boardY + boardHeight + DEVICE_GAP, width: boardWidth, height: DEVICE_BAND }
        : null,
    },
    sourceBand: source === null
      ? null
      : { x: boardX, y: sourceTop, width: bandWidth, height: source.height },
    backTop: back === null ? null : backTop,
    colX,
    rowY,
    point: (address) => ({ x: colX(address.col), y: rowY(address.row) }),
  };
}

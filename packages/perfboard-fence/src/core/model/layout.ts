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

export type LayoutOptions = {
  readonly title?: boolean;
  /** 板の上に機器を置く帯を空けるか。 */
  readonly deviceTop?: boolean;
  readonly deviceBottom?: boolean;
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
  const boardX = OUTER_MARGIN + LABEL_GUTTER;
  const boardY = OUTER_MARGIN + LABEL_GUTTER + titleBand + topBand;
  const boardWidth = BOARD_PAD * 2 + (board.cols - 1) * PITCH;
  const boardHeight = BOARD_PAD * 2 + (board.rows - 1) * PITCH;

  const colX = (col: number): number => boardX + BOARD_PAD + (col - 1) * PITCH;
  const rowY = (row: number): number => boardY + BOARD_PAD + (row - 1) * PITCH;

  return {
    pitch: PITCH,
    width: boardX + boardWidth + OUTER_MARGIN,
    height: boardY + boardHeight + bottomBand + OUTER_MARGIN,
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
    colX,
    rowY,
    point: (address) => ({ x: colX(address.col), y: rowY(address.row) }),
  };
}

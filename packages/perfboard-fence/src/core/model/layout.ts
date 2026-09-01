import type { Address, Board, Point, Rect } from '../types.ts';

/** 穴の間隔。2.54 mm を 20 px として描く (breadboard と同じ。並べたとき縮尺が揃う)。 */
export const PITCH = 20;

/** 画布の縁から板まで。行と列の名前がここに入る。 */
const OUTER_MARGIN = 14;
const LABEL_GUTTER = 16;
/** 板の縁から一番外の穴まで。実物にも縁の余白がある。 */
const BOARD_PAD = 12;

export type Layout = {
  readonly pitch: number;
  readonly width: number;
  readonly height: number;
  /** 板そのものの矩形。穴はこの内側に並ぶ。 */
  readonly board: Rect;
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
export function createLayout(board: Board): Layout {
  const boardX = OUTER_MARGIN + LABEL_GUTTER;
  const boardY = OUTER_MARGIN + LABEL_GUTTER;
  const boardWidth = BOARD_PAD * 2 + (board.cols - 1) * PITCH;
  const boardHeight = BOARD_PAD * 2 + (board.rows - 1) * PITCH;

  const colX = (col: number): number => boardX + BOARD_PAD + (col - 1) * PITCH;
  const rowY = (row: number): number => boardY + BOARD_PAD + (row - 1) * PITCH;

  return {
    pitch: PITCH,
    width: boardX + boardWidth + OUTER_MARGIN,
    height: boardY + boardHeight + OUTER_MARGIN,
    board: { x: boardX, y: boardY, width: boardWidth, height: boardHeight },
    colX,
    rowY,
    point: (address) => ({ x: colX(address.col), y: rowY(address.row) }),
  };
}

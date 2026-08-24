import { HOLE_ROWS } from '../types.ts';
import type { Address, Board, HoleRow, Point, RailRow, Rect } from '../types.ts';

/** 穴の間隔。2.54 mm を 20 px として描く。 */
export const PITCH = 20;

const OUTER_MARGIN = 14;
const BOARD_PAD_X = 28;
const BOARD_PAD_Y = 16;
// 電源レールと穴のブロックの間は、列番号と配線レーンが同居するので広めに取る。
const RAIL_TO_BLOCK = 1.7 * PITCH;
const RAVINE = 0.8 * PITCH;
const BLOCK_TO_RAIL = RAIL_TO_BLOCK;
const DEVICE_HEIGHT = 62;
const DEVICE_GAP = 54;

/** 配線が通れる横レーン。halfHeight は重なりを避けるためにずらせる幅。 */
export type Lane = { readonly y: number; readonly halfHeight: number };

export type LayoutOptions = { readonly deviceTop?: boolean; readonly deviceBottom?: boolean };

export type Layout = {
  readonly pitch: number;
  readonly columns: number;
  readonly width: number;
  readonly height: number;
  readonly board: Rect;
  readonly ravineY: number;
  readonly lanes: readonly Lane[];
  readonly deviceBands: { readonly top: Rect | null; readonly bottom: Rect | null };
  colX(col: number): number;
  rowY(row: HoleRow | RailRow): number;
  point(address: Address): Point;
};

/** 穴番地を画布の座標に落とす。ボード外の機器を置く帯があれば、その分だけ上下に伸びる。 */
export function createLayout(board: Board, options: LayoutOptions = {}): Layout {
  const rowY = new Map<HoleRow | RailRow, number>();
  const lanes: Lane[] = [];

  let y = OUTER_MARGIN;
  const topBand: Rect | null = options.deviceTop
    ? { x: OUTER_MARGIN, y, width: 0, height: DEVICE_HEIGHT }
    : null;
  if (topBand) {
    y += DEVICE_HEIGHT;
    lanes.push({ y: y + DEVICE_GAP / 2, halfHeight: DEVICE_GAP / 2 - 8 });
    y += DEVICE_GAP;
  }

  const boardY = y;
  y += BOARD_PAD_Y;
  lanes.push({ y: y - BOARD_PAD_Y / 2, halfHeight: 4 });
  rowY.set('+t', y);
  y += PITCH;
  rowY.set('-t', y);
  lanes.push({ y: y + RAIL_TO_BLOCK / 2, halfHeight: RAIL_TO_BLOCK / 2 - 5 });
  y += RAIL_TO_BLOCK;

  for (const row of HOLE_ROWS) {
    rowY.set(row, y);
    y += row === 'e' ? RAVINE + PITCH : PITCH;
  }
  const ravineY = (rowY.get('e') ?? 0) + (RAVINE + PITCH) / 2;
  lanes.push({ y: ravineY, halfHeight: RAVINE / 2 });

  y -= PITCH;
  lanes.push({ y: y + BLOCK_TO_RAIL / 2, halfHeight: BLOCK_TO_RAIL / 2 - 4 });
  y += BLOCK_TO_RAIL;
  rowY.set('-b', y);
  y += PITCH;
  rowY.set('+b', y);
  lanes.push({ y: y + BOARD_PAD_Y / 2, halfHeight: 4 });
  y += BOARD_PAD_Y;

  const boardHeight = y - boardY;
  const boardWidth = BOARD_PAD_X * 2 + (board.columns - 1) * PITCH;

  const bottomBand: Rect | null = options.deviceBottom
    ? { x: OUTER_MARGIN, y: y + DEVICE_GAP, width: 0, height: DEVICE_HEIGHT }
    : null;
  if (bottomBand) {
    lanes.push({ y: y + DEVICE_GAP / 2, halfHeight: DEVICE_GAP / 2 - 8 });
    y += DEVICE_GAP + DEVICE_HEIGHT;
  }

  const width = boardWidth + OUTER_MARGIN * 2;
  const height = y + OUTER_MARGIN;
  const bandWidth = width - OUTER_MARGIN * 2;

  const colX = (col: number): number => OUTER_MARGIN + BOARD_PAD_X + (col - 1) * PITCH;

  return {
    pitch: PITCH,
    columns: board.columns,
    width,
    height,
    board: { x: OUTER_MARGIN, y: boardY, width: boardWidth, height: boardHeight },
    ravineY,
    lanes,
    deviceBands: {
      top: topBand ? { ...topBand, width: bandWidth } : null,
      bottom: bottomBand ? { ...bottomBand, width: bandWidth } : null,
    },
    colX,
    rowY: (row) => rowY.get(row) ?? 0,
    point: (address) => ({
      x: colX(address.col),
      y: address.kind === 'hole'
        ? rowY.get(address.row) ?? 0
        : rowY.get(`${address.polarity}${address.side}` as RailRow) ?? 0,
    }),
  };
}

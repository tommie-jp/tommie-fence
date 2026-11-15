import { HOLE_ROWS } from '../types.ts';
import type { Address, Board, HoleRow, Point, RailRow, Rect } from '../types.ts';

/** 穴の間隔。2.54 mm を 20 px として描く。 */
export const PITCH = 20;

const OUTER_MARGIN = 14;
const BOARD_PAD_X = 28;
const BOARD_PAD_Y = 16;
// 電源レールと穴のブロックの間は、列番号と配線レーンが同居するので広めに取る。
const RAIL_TO_BLOCK = 1.7 * PITCH;
/**
 * 溝の幅 (e 行と f 行の間から 1 ピッチを引いた分)。**実物どおり e 行と f 行の間を 0.3 インチ = 3 ピッチ**にする。
 * 詰めて描いていた (0.8 ピッチ、e〜f が 1.8 ピッチ) ころは、溝をまたぐ物 (Pico は b 行と g 行で 0.7 インチ、
 * DIP は e 行と f 行で 0.3 インチ) の幅が実物より狭く出ていた (Pico 2 が 21 mm でなく 17.9 mm。52 の docs/157)。
 */
const RAVINE = 2 * PITCH;
const BLOCK_TO_RAIL = RAIL_TO_BLOCK;
// レールの無い基板でも、列番号と配線レーンの居場所は要る。基板の縁からブロックまでを同じだけ空ける。
const EDGE_TO_BLOCK = RAIL_TO_BLOCK;
/** 機器の帯の既定の高さ (箱の機器の高さ)。 */
export const DEVICE_HEIGHT = 62;
const DEVICE_GAP = 54;
/**
 * 左右の帯と基板の間。**機器のピンから基板へ向かう線が縦に走る通り道** (52 の docs/159)。
 * 線 1 本ぶんの幅 (`SIDE_LANE_STEP`) を本数だけ取る。
 */
export const SIDE_GAP = 40;
export const SIDE_LANE_STEP = 8;

/** 配線が通れる横レーン。halfHeight は重なりを避けるためにずらせる幅。 */
export type Lane = { readonly y: number; readonly halfHeight: number };

export type LayoutOptions = {
  readonly deviceTop?: boolean;
  readonly deviceBottom?: boolean;
  /**
   * 基板から張り出す部品 (USB コネクタ) のために空ける幅。**基板のすぐ外**に入れる —
   * 上下は基板と機器の帯の間、左右は基板と画布の縁の間。画布の縁に足すと、上に機器の
   * 帯がある図では張り出しが帯に食い込む。張り出す量は画布が決まらないと測れない
   * ので、呼ぶ側が一度組んで測ってから渡す。
   */
  readonly overhangTop?: number;
  readonly overhangBottom?: number;
  readonly overhangLeft?: number;
  readonly overhangRight?: number;
  /** 画布の上端と下端に足す余白 (機器の口から帯の外へ出る USB ケーブルのぶん。52 の docs/157)。 */
  readonly marginTop?: number;
  readonly marginBottom?: number;
  /** 機器の帯の高さ (実寸で描く姿のある機器のため。52 の docs/157)。既定の高さより低くはしない。 */
  readonly deviceTopHeight?: number;
  readonly deviceBottomHeight?: number;
  /** 左右の帯の幅 (0 か省けば帯は無い)。 */
  readonly deviceLeftWidth?: number;
  readonly deviceRightWidth?: number;
  /** 左右の帯と基板の間に縦に通す線の本数 (通り道の幅を決める)。 */
  readonly sideLanesLeft?: number;
  readonly sideLanesRight?: number;
};

export type Layout = {
  readonly pitch: number;
  readonly columns: number;
  readonly width: number;
  readonly height: number;
  /** 基板の外形。**継いだ基板 (`board: stack:`) では全部の枚を合わせた外形**。 */
  readonly board: Rect;
  /** 枚ごとの外形 (上から 1 枚め・2 枚め…)。継がない図では `board` 1 つ。 */
  readonly tiers: readonly Rect[];
  /** 1 枚めの溝の真ん中。 */
  readonly ravineY: number;
  /** 枚ごとの溝の真ん中。 */
  readonly ravines: readonly number[];
  readonly lanes: readonly Lane[];
  readonly deviceBands: {
    readonly top: Rect | null; readonly bottom: Rect | null;
    /** 左右の帯。高さは基板と同じで、機器は上から詰める。 */
    readonly left: Rect | null; readonly right: Rect | null;
  };
  colX(col: number): number;
  /** 行の y。`tier` は何枚めか (省けば 1 枚め)。 */
  rowY(row: HoleRow | RailRow, tier?: number): number;
  /** y に一番近い溝の真ん中 (その点が溝の上下どちらのブロックにあるかを読む)。 */
  ravineNear(y: number): number;
  /** y が載っている枚 (1 始まり)。基板の外は近いほうの端の枚。 */
  tierAt(y: number): number;
  point(address: Address): Point;
};

/**
 * その行から**次の行まで**の隔たり。端数の番地 (`b5c3`) を落とすのに使う。
 * いちばん下の行には次が無いので、1 つ上との隔たりで代える。
 */
function stepBelow(rowY: ReadonlyMap<HoleRow | RailRow, number>, at: number): number {
  const below = [...rowY.values()].filter((y) => y > at).sort((a, b) => a - b)[0];
  if (below !== undefined) return below - at;
  const above = [...rowY.values()].filter((y) => y < at).sort((a, b) => b - a)[0];
  return above === undefined ? PITCH : at - above;
}

/** 穴番地を画布の座標に落とす。ボード外の機器を置く帯があれば、その分だけ上下に伸びる。 */
export function createLayout(board: Board, options: LayoutOptions = {}): Layout {
  const rowY = new Map<HoleRow | RailRow, number>();
  const lanes: Lane[] = [];

  const [top, bottom, left, right] = [
    options.overhangTop, options.overhangBottom, options.overhangLeft, options.overhangRight,
  ].map((value) => Math.max(0, value ?? 0)) as [number, number, number, number];
  const topHeight = Math.max(DEVICE_HEIGHT, options.deviceTopHeight ?? 0);
  const bottomHeight = Math.max(DEVICE_HEIGHT, options.deviceBottomHeight ?? 0);
  let y = OUTER_MARGIN + Math.max(0, options.marginTop ?? 0);
  const topBand: Rect | null = options.deviceTop
    ? { x: OUTER_MARGIN, y, width: 0, height: topHeight }
    : null;
  if (topBand) {
    y += topHeight;
    lanes.push({ y: y + DEVICE_GAP / 2, halfHeight: DEVICE_GAP / 2 - 8 });
    y += DEVICE_GAP;
  }

  y += top;
  const boardY = y;
  // レールの縦位置は 4 スロット固定で、どの極性がどこに来るかだけが board.rails で動く。
  // レールを外した基板 (board.rails が null) では、その 4 スロットごと無くなる。
  if (board.rails) {
    const [railTopOuter, railTopInner] = board.rails;
    y += BOARD_PAD_Y;
    lanes.push({ y: y - BOARD_PAD_Y / 2, halfHeight: 4 });
    rowY.set(railTopOuter, y);
    y += PITCH;
    rowY.set(railTopInner, y);
    lanes.push({ y: y + RAIL_TO_BLOCK / 2, halfHeight: RAIL_TO_BLOCK / 2 - 5 });
    y += RAIL_TO_BLOCK;
  } else {
    lanes.push({ y: y + EDGE_TO_BLOCK / 2, halfHeight: EDGE_TO_BLOCK / 2 - 5 });
    y += EDGE_TO_BLOCK;
  }

  for (const row of HOLE_ROWS) {
    rowY.set(row, y);
    y += row === 'e' ? RAVINE + PITCH : PITCH;
  }
  const ravineY = (rowY.get('e') ?? 0) + (RAVINE + PITCH) / 2;
  lanes.push({ y: ravineY, halfHeight: RAVINE / 2 });

  y -= PITCH;
  if (board.rails) {
    const [, , railBottomInner, railBottomOuter] = board.rails;
    lanes.push({ y: y + BLOCK_TO_RAIL / 2, halfHeight: BLOCK_TO_RAIL / 2 - 4 });
    y += BLOCK_TO_RAIL;
    rowY.set(railBottomInner, y);
    y += PITCH;
    rowY.set(railBottomOuter, y);
    lanes.push({ y: y + BOARD_PAD_Y / 2, halfHeight: 4 });
    y += BOARD_PAD_Y;
  } else {
    lanes.push({ y: y + EDGE_TO_BLOCK / 2, halfHeight: EDGE_TO_BLOCK / 2 - 4 });
    y += EDGE_TO_BLOCK;
  }

  // **継いだ基板は縁を接して下へ並べる** (隙間 0。52 の docs/159)。枚の中の並びは 1 枚めと同じ。
  const tierHeight = y - boardY;
  const stack = Math.max(1, board.stack);
  const tierLanes = [...lanes].filter((lane) => lane.y > boardY && lane.y < boardY + tierHeight);
  for (let tier = 2; tier <= stack; tier += 1) {
    const offset = (tier - 1) * tierHeight;
    lanes.push(...tierLanes.map((lane) => ({ ...lane, y: lane.y + offset })));
  }
  y += (stack - 1) * tierHeight;
  const boardHeight = y - boardY;
  const boardWidth = BOARD_PAD_X * 2 + (board.columns - 1) * PITCH;
  y += bottom;

  const bottomBand: Rect | null = options.deviceBottom
    ? { x: OUTER_MARGIN, y: y + DEVICE_GAP, width: 0, height: bottomHeight }
    : null;
  if (bottomBand) {
    lanes.push({ y: y + DEVICE_GAP / 2, halfHeight: DEVICE_GAP / 2 - 8 });
    y += DEVICE_GAP + bottomHeight;
  }

  const leftWidth = Math.max(0, options.deviceLeftWidth ?? 0);
  const rightWidth = Math.max(0, options.deviceRightWidth ?? 0);
  const gapOf = (lanes: number | undefined): number => SIDE_GAP + Math.max(0, (lanes ?? 0) - 1) * SIDE_LANE_STEP;
  const leftGap = leftWidth > 0 ? gapOf(options.sideLanesLeft) : 0;
  const rightGap = rightWidth > 0 ? gapOf(options.sideLanesRight) : 0;
  const boardX = OUTER_MARGIN + left + leftWidth + leftGap;
  const width = boardWidth + OUTER_MARGIN * 2 + left + right + leftWidth + leftGap + rightWidth + rightGap;
  const height = y + OUTER_MARGIN + Math.max(0, options.marginBottom ?? 0);
  const bandWidth = boardWidth;

  const colX = (col: number): number => boardX + BOARD_PAD_X + (col - 1) * PITCH;
  const offsetOf = (tier: number | undefined): number => (Math.min(Math.max(tier ?? 1, 1), stack) - 1) * tierHeight;
  const ravines = Array.from({ length: stack }, (_, index) => ravineY + index * tierHeight);
  const tiers: Rect[] = Array.from({ length: stack }, (_, index) => ({
    x: boardX, y: boardY + index * tierHeight, width: boardWidth, height: tierHeight,
  }));

  return {
    pitch: PITCH,
    columns: board.columns,
    width,
    height,
    board: { x: boardX, y: boardY, width: boardWidth, height: boardHeight },
    tiers,
    ravineY,
    ravines,
    lanes,
    deviceBands: {
      top: topBand ? { ...topBand, x: boardX, width: bandWidth } : null,
      bottom: bottomBand ? { ...bottomBand, x: boardX, width: bandWidth } : null,
      left: leftWidth > 0 ? { x: OUTER_MARGIN, y: boardY, width: leftWidth, height: boardHeight } : null,
      right: rightWidth > 0
        ? { x: boardX + boardWidth + right + rightGap, y: boardY, width: rightWidth, height: boardHeight }
        : null,
    },
    colX,
    // レールの無い基板のレールの行は 0 (基板の外) のまま。枚の分ずらすと基板の中に落ちる。
    rowY: (row, tier) => {
      const at = rowY.get(row);
      return at === undefined ? 0 : at + offsetOf(tier);
    },
    tierAt: (at) => Math.min(Math.max(Math.floor((at - boardY) / tierHeight) + 1, 1), stack),
    ravineNear: (at) => ravines.reduce((best, candidate) =>
      (Math.abs(candidate - at) < Math.abs(best - at) ? candidate : best), ravineY),
    // **端数は次の行までの隔たりで測る。** 行の間隔は一定ではない (溝をまたぐ
     // ところとレールの外側が広い) ので、ピッチを掛けると溝の真ん中が真ん中に
     // ならない。0.5 と書けば、その行と次の行のちょうど間に来る。
    point: (address) => {
      const at = address.kind === 'hole'
        ? (rowY.get(address.row) ?? 0)
        : (rowY.get(`${address.polarity}${address.side}` as RailRow) ?? 0);
      const rows = address.rows ?? 0;
      return {
        x: colX(address.col) + (address.cols ?? 0) * PITCH,
        y: at + (rows === 0 ? 0 : rows * stepBelow(rowY, at)) + offsetOf(address.tier),
      };
    },
  };
}

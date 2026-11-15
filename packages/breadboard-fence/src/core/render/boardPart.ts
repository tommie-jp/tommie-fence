import { boardBox, boardChip, boardLegends, boardPadFont, boardPadNames, boardPads, lookupBoardPart, pinLabel } from 'fence-kit';
import { HOLE_ROWS } from '../types.ts';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import {
  CAPTION_CLEAR, NAME_CAP, caption, fitToBoard, partLabel, pinPoints,
} from './partCommon.ts';
import { chipInk } from './packages.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

export function boardBodyRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  return boardBox(points, layout.pitch, lookupBoardPart(part.type));
}

/**
 * 1 番ピンの点の添字。**`pins[0]` は 1 番ピンとは限らない** — 升の並びは固定で、回すと
 * 名前のほうが巡る (`placement/place.ts` の spun)。だから名前で引く。
 */
export function pinOneOf(part: PlacedPart): number {
  const first = lookupBoardPart(part.type)?.pins[0];
  const index = part.pins.findIndex((pin) => pin.name === first);
  return index < 0 ? 0 : index;
}

/**
 * パッド (Pico の SWD) の画布の上の点。x は絵と同じ計算 (fence-kit の `boardPads`)。
 * **y は穴の行と行の間へ寄せる** — パッドへは板の端の外から横に入るので、行の高さに
 * 置くと、入る線が板の外の穴の上を走って、そこに挿さっているように見える。並び
 * (SWCLK が 1〜20 番の列の側) と間隔 (およそ 1 ピッチ) はそのまま。
 * パッドの無いボード・ボード以外は空。
 */
export function boardPadPoints(part: PlacedPart, layout: Layout): ReadonlyMap<string, Point> {
  if (part.kind !== 'board' || (part.pads ?? []).length === 0) return new Map();
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return new Map();
  const pads = boardPads(points, pinOneOf(part), lookupBoardPart(part.type), layout.pitch);
  if (pads.length === 0) return new Map();

  const tier = layout.tierAt(points[0]?.y ?? layout.board.y);
  const rows = HOLE_ROWS.map((row) => layout.rowY(row, tier)).sort((a, b) => a - b);
  // **実物の位置 (0.1 インチ間隔) が穴の行に重ならなければ、そのまま描く。** 溝は 3 ピッチあるので、
  // Pico を溝の真ん中に置けば 3 つとも溝の中に入る (52 の docs/157)。
  const clear = layout.pitch * PAD_ROW_CLEAR;
  if (pads.every((pad) => rows.every((y) => Math.abs(y - pad.point.y) >= clear))) {
    return new Map(pads.map((pad) => [pad.name, pad.point]));
  }
  // 重なるときは行と行の間の高さ (溝も 1 つの間) に寄せる。真ん中のパッドにいちばん近い間を真ん中にして、上下に並べる。
  const gaps = rows.slice(1).map((y, index) => (y + (rows[index] ?? y)) / 2);
  const sorted = [...pads].sort((a, b) => a.point.y - b.point.y);
  const middle = sorted[Math.floor(sorted.length / 2)]?.point.y ?? 0;
  const nearest = gaps.reduce((best, gap, index) =>
    (Math.abs(gap - middle) < Math.abs((gaps[best] ?? Infinity) - middle) ? index : best), 0);
  const start = Math.min(Math.max(nearest - Math.floor(sorted.length / 2), 0), gaps.length - sorted.length);
  return new Map(sorted.map((pad, index) => [pad.name, { x: pad.point.x, y: gaps[start + index] ?? pad.point.y }]));
}

/** 1 番の反対の向き (+1 は右、-1 は左)。パッドの名前と、パッドへ入る線はこちらから。 */
function outward(part: PlacedPart, layout: Layout, pad: Point): number {
  const points = pinPoints(part, layout) ?? [];
  const pinOne = points[pinOneOf(part)] ?? pad;
  return Math.sign(pad.x - pinOne.x) || 1;
}

/**
 * パッドの名前。**ボードの内側**に置く (fence-kit の `boardPadNames`、perfboard と同じ)。パッドへ入る線は
 * 外から来るので、名前の下を通らない。ピンの名前の縦書きに触れるときは上下にずらす。層は配線より上。
 */
export function renderBoardPadNames(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const pads = boardPadPoints(part, layout);
  const points = pinPoints(part, layout);
  if (pads.size === 0 || !points) return '';
  return boardPadNames(
    [...pads].map(([name, point]) => ({ name, point })),
    points,
    pinOneOf(part),
    boardBodyRect(part, layout),
    boardPadFont(textScale(theme)),
    chipInk(theme),
    undefined,
    boardLegends(part.pins.map((pin) => pinLabel(pin.name, part.uses)), points.length),
  );
}

/** パッドを実物の位置に描くとき、穴の行から離す量 (ピッチに対する比)。 */
const PAD_ROW_CLEAR = 0.4;
/** パッドの輪の半径 (fence-kit と同じ) と、降りる線までに空ける量 (px)。 */
const PAD_RADIUS = 3.5;
const PAD_LANE_CLEAR = 2;

/**
 * パッドへ降りる線の半列 (穴の列と列の間) の x。`rank` 番目 (0 がパッドにいちばん近い)。
 * パッドの輪のすぐ外の半列から、1 番の反対の側へ 1 列ずつ。
 */
function laneX(part: PlacedPart, layout: Layout, pad: Point, rank: number): number {
  const out = outward(part, layout, pad);
  const clear = pad.x + out * (PAD_RADIUS + PAD_LANE_CLEAR);
  const origin = layout.colX(1);
  const grid = (clear - origin) / layout.pitch;
  const first = out > 0 ? Math.ceil(grid - 0.5) + 0.5 : Math.floor(grid + 0.5) - 0.5;
  return origin + (first + out * rank) * layout.pitch;
}

/**
 * パッドへ入る線の**入口**。線は基板の外のレーンから半列 (穴の列と列の間) を縦に降り、
 * パッドの高さ (行と行の間) で横に入る。**入口は 1 番の反対の側** (USB と反対の端)。
 * 半列は**パッドのすぐ外**から選ぶ (`laneX`)。名前はその外に置くので (`renderBoardPadNames`)、
 * 線は名前を横切らない。
 *
 * 3 本の降りる半列は 1 つずつずらす。**機器の側に近いパッドほど内側の半列**にすると、
 * 3 本の L 字が入れ子になって交わらない。
 */
export function padEntry(part: PlacedPart, layout: Layout, _theme: RenderTheme, pad: string, fromAbove: boolean): Point | null {
  const pads = boardPadPoints(part, layout);
  const point = pads.get(pad);
  if (!point) return null;
  // 機器の側に近い順。
  const order = [...pads].sort(([, a], [, b]) => (fromAbove ? a.y - b.y : b.y - a.y)).map(([name]) => name);
  return { x: laneX(part, layout, point, order.indexOf(pad)), y: point.y };
}

/**
 * 溝をまたいで挿すマイコンボード。**姿は fence-kit にある**
 * (`parts/chips.ts`) — 実物の基板の話で基板に依らないので、perfboard と
 * 同じ絵になる (実機で「pico など、全ての部品の見た目を breadboard と
 * perfboard で共通にする」)。ここに残るのは基板の話 — ピンの点と、
 * 基板からはみ出す字の切り方。
 */
export function renderBoardPart(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  const definition = lookupBoardPart(part.type);
  const drawn = boardChip({
    points,
    // 使う機能 (`use=`) を選んだピンは、名前の欄に機能の名前を出す (`ADC1 32`)。
    names: part.pins.map((pin) => pinLabel(pin.name, part.uses)),
    definition,
    pinOne: pinOneOf(part),
    pitch: layout.pitch,
    scale: textScale(theme),
    ink: chipInk(theme),
    // パッドは行の間へ寄せた位置で描き、名前は配線より上の層で描く (`renderBoardPadNames`)。
    pads: [...boardPadPoints(part, layout)].map(([name, point]) => ({ name, point })),
    padNames: false,
  });

  // **名前は胴の下。** 基板の中に置いていたころは、長いピンの名前
  // (`ADC_VREF 35`) と食い合っていた (実機で「文字が図形に被らないようにする」)。
  // ほかの部品と側も揃う (実機で「すべての部品名は部品の下側に表示する」)。
  const body = boardBodyRect(part, layout);
  const centreX = body.x + body.width / 2;
  const label = partLabel(
    centreX,
    body.y + body.height + CAPTION_CLEAR + theme.metrics.textSize * NAME_CAP + drop,
    fitToBoard(caption(part), centreX, theme.metrics.textSize, layout),
    theme,
  );
  return `${drawn}${label}`;
}

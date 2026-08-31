import type { Lane, Layout } from '../model/layout.ts';
import type { Point, Rect, WireHint } from '../types.ts';
import { segmentHitsAny } from './geometry.ts';

export type RouteOptions = {
  /** 平行に走る配線が重ならないように、レーンから上下にずらす量。 */
  readonly offset?: number;
  /** 自動ルートの代わりに通す道順。 */
  readonly hints?: readonly WireHint[];
  /** 横切りたくない領域 (部品の本体やラベル)。 */
  readonly obstacles?: readonly Rect[];
};

export type WireRequest = {
  readonly from: Point;
  readonly to: Point;
  readonly hints: readonly WireHint[];
};

const SAME_COLUMN_TOLERANCE = 0.5;
/** これより近い穴どうしは、実物の短いジャンパと同じでレーンを経由せず直接つなぐ。 */
const SHORT_HOP_PITCHES = 3;
const SLOT_SPACING = 4;
const SLOT_GAP = 8;
const OBSTACLE_PENALTY = 10_000;
const OBSTACLE_MARGIN = 3;

const clamp = (value: number, limit: number): number => Math.min(Math.max(value, -limit), limit);

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

const dedupe = (points: readonly Point[]): readonly Point[] =>
  points.filter((point, index) => index === 0 || !samePoint(points[index - 1]!, point));

/**
 * 2 点をつなぐジャンパの通り道を決める。
 * ジャンパはボードの上に載るので穴は避けず、「縦に出て、穴の無い横レーンを通り、縦に入る」形にする。
 */
export function routeWire(from: Point, to: Point, layout: Layout, options: RouteOptions = {}): readonly Point[] {
  if (options.hints && options.hints.length > 0) return dedupe(followHints(from, to, options.hints));
  if (isDirect(from, to, layout)) return [from, to];

  const obstacles = options.obstacles ?? [];
  const lane = chooseLane(from, to, layout, obstacles);
  return buildPath(from, to, lane, options.offset ?? 0, layout, obstacles);
}

const isDirect = (from: Point, to: Point, layout: Layout): boolean =>
  Math.abs(from.x - to.x) < SAME_COLUMN_TOLERANCE
  || Math.hypot(to.x - from.x, to.y - from.y) <= SHORT_HOP_PITCHES * layout.pitch;

function buildPath(
  from: Point,
  to: Point,
  lane: Lane,
  offset: number,
  layout: Layout,
  obstacles: readonly Rect[],
): readonly Point[] {
  const y = lane.y + clamp(offset, lane.halfHeight);
  const entry = approach(from, y, layout, obstacles);
  const exit = approach(to, y, layout, obstacles);
  return dedupe([...entry, ...[...exit].reverse()]);
}

/** 端点からレーンへ出るのに使ってよい横のずれ。穴の列の半分刻みで、2 ピッチまで。 */
const DETOUR_STEPS = [0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2];

/**
 * 穴からレーンまでの登り口。まっすぐ上げるのが基本で、
 * **その道に部品が立っているときだけ横にずれてから登る**。
 *
 * 横に振る高さは 2 つ試す。まず穴 1 つぶんの半分だけ出たところ (隣の行に食い込まない)。
 * そこも部品の中なら、穴と同じ高さで振る — 部品は穴のすぐ上に立つので、
 * 半分出た時点でもう胴の中、ということが起きる。
 *
 * ずれ先は穴の列の間を近い順に試し、どこも塞がっていればまっすぐに戻す。
 * 逃げ場の無い盤面で無理に曲げるより、突き抜けさせて部品を上に描くほうが読める
 * (描画順が最後の砦で、この関数はその手前で避けられるものだけを避ける)。
 */
function approach(end: Point, laneY: number, layout: Layout, obstacles: readonly Rect[]): readonly Point[] {
  const straight = [end, { x: end.x, y: laneY }];
  const blocked = (a: Point, b: Point): boolean => segmentHitsAny(a, b, obstacles, OBSTACLE_MARGIN);
  if (obstacles.length === 0 || !blocked(end, straight[1]!)) return straight;

  const towardLane = Math.sign(laneY - end.y) || 1;

  for (const jogY of [end.y + towardLane * (layout.pitch / 2), end.y]) {
    const stub = { x: end.x, y: jogY };
    if (blocked(end, stub)) continue;

    for (const step of DETOUR_STEPS) {
      const corner = { x: end.x + step * layout.pitch, y: jogY };
      const top = { x: corner.x, y: laneY };
      if (!blocked(stub, corner) && !blocked(corner, top)) return [end, stub, corner, top];
    }
  }

  return straight;
}

/**
 * 図の中の配線をまとめて引く。同じレーンを通る配線には別々のスロットを割り当てるので、
 * 本数が増えても重ならない。
 */
export function routeWires(
  requests: readonly WireRequest[],
  layout: Layout,
  obstacles: readonly Rect[] = [],
): readonly (readonly Point[])[] {
  const lanes = requests.map((request) =>
    request.hints.length > 0 || isDirect(request.from, request.to, layout)
      ? null
      : chooseLane(request.from, request.to, layout, obstacles),
  );
  const offsets = assignSlots(requests, lanes);

  return requests.map((request, index) => {
    const lane = lanes[index];
    return lane
      ? buildPath(request.from, request.to, lane, offsets[index] ?? 0, layout, obstacles)
      : routeWire(request.from, request.to, layout, { hints: request.hints, obstacles });
  });
}

/**
 * 同じレーンで x が重なる配線に別のスロットを配る。
 * 左端の順に見て、空いている一番内側のスロットを使う (区間グラフの貪欲彩色)。
 */
function assignSlots(
  requests: readonly WireRequest[],
  lanes: readonly (Lane | null)[],
): readonly number[] {
  const offsets = new Array<number>(requests.length).fill(0);
  const order = requests
    .map((request, index) => ({ index, left: Math.min(request.from.x, request.to.x), right: Math.max(request.from.x, request.to.x) }))
    .filter(({ index }) => lanes[index] !== null)
    .sort((a, b) => a.left - b.left);

  const takenByLane = new Map<number, number[]>();

  for (const { index, left, right } of order) {
    const laneKey = lanes[index]!.y;
    const taken = takenByLane.get(laneKey) ?? [];
    let slot = taken.findIndex((end) => end + SLOT_GAP <= left);
    if (slot === -1) slot = taken.length;
    taken[slot] = right;
    takenByLane.set(laneKey, taken);
    offsets[index] = slotOffset(slot);
  }

  return offsets;
}

/** スロット 0 を中央に、以降は上下へ交互に振る。 */
const slotOffset = (slot: number): number =>
  slot === 0 ? 0 : (slot % 2 === 1 ? -1 : 1) * Math.ceil(slot / 2) * SLOT_SPACING;

function followHints(from: Point, to: Point, hints: readonly WireHint[]): readonly Point[] {
  const points: Point[] = [from];
  let current = from;
  let lastAxis: 'v' | 'h' = 'v';

  for (const hint of hints) {
    current = hint.axis === 'v'
      ? { x: current.x, y: current.y + hint.delta }
      : { x: current.x + hint.delta, y: current.y };
    lastAxis = hint.axis;
    points.push(current);
  }

  // 最後の指示が縦なら次は横に振ってから入る。斜めに突っ込ませない。
  if (Math.abs(current.x - to.x) > SAME_COLUMN_TOLERANCE && Math.abs(current.y - to.y) > SAME_COLUMN_TOLERANCE) {
    points.push(lastAxis === 'v' ? { x: to.x, y: current.y } : { x: current.x, y: to.y });
  }

  points.push(to);
  return points;
}

function chooseLane(from: Point, to: Point, layout: Layout, obstacles: readonly Rect[]): Lane {
  const top = Math.min(from.y, to.y);
  const bottom = Math.max(from.y, to.y);
  const middle = (top + bottom) / 2;
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);

  const between = layout.lanes.filter((lane) => lane.y > top && lane.y < bottom);
  const candidates = between.length > 0 ? between : layout.lanes;
  const distance = between.length > 0
    ? (lane: Lane) => Math.abs(lane.y - middle)
    : (lane: Lane) => Math.abs(lane.y - top) + Math.abs(lane.y - bottom);
  const cost = (lane: Lane) => distance(lane) + OBSTACLE_PENALTY * crossings(lane, left, right, obstacles);

  return candidates.reduce((best, lane) => (cost(lane) < cost(best) ? lane : best));
}

const crossings = (lane: Lane, left: number, right: number, obstacles: readonly Rect[]): number =>
  obstacles.filter(
    (rect) =>
      rect.x < right + OBSTACLE_MARGIN &&
      rect.x + rect.width > left - OBSTACLE_MARGIN &&
      rect.y < lane.y + OBSTACLE_MARGIN &&
      rect.y + rect.height > lane.y - OBSTACLE_MARGIN,
  ).length;

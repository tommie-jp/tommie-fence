import type { Lane, Layout } from '../model/layout.ts';
import type { Point, Rect, WireHint } from '../types.ts';
import { segmentHitsAny, segmentHitsRect } from './geometry.ts';

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
  const taken = new Set<number>();

  return buildPath(from, to, lane, options.offset ?? 0, {
    entry: escapeOf(from, lane, layout, obstacles, taken),
    exit: escapeOf(to, lane, layout, obstacles, taken),
  });
}

const isDirect = (from: Point, to: Point, layout: Layout): boolean =>
  Math.abs(from.x - to.x) < SAME_COLUMN_TOLERANCE
  || Math.hypot(to.x - from.x, to.y - from.y) <= SHORT_HOP_PITCHES * layout.pitch;

/** 部品をよけて登るときの寄り道。`x` は登る列、`jogY` は横に振る高さ。 */
type Escape = { readonly jogY: number; readonly x: number } | null;
type Escapes = { readonly entry: Escape; readonly exit: Escape };

function buildPath(from: Point, to: Point, lane: Lane, offset: number, escapes: Escapes): readonly Point[] {
  const y = lane.y + clamp(offset, lane.halfHeight);
  return dedupe([...leg(from, y, escapes.entry), ...[...leg(to, y, escapes.exit)].reverse()]);
}

/** 穴からレーンまでの 1 本ぶん。寄り道が要らなければ、今までどおりまっすぐ登る。 */
const leg = (end: Point, laneY: number, escape: Escape): readonly Point[] =>
  escape === null
    ? [end, { x: end.x, y: laneY }]
    : [end, { x: end.x, y: escape.jogY }, { x: escape.x, y: escape.jogY }, { x: escape.x, y: laneY }];

/** 横のずれ先。**穴の列と列の間だけ**を近い順に試す。 */
const DETOUR_STEPS = [0.5, -0.5, 1.5, -1.5, 2.5, -2.5];
/** 横に振る高さの候補。穴 1 つぶんの半分と、その半分。どちらも行と行の間に収まる。 */
const JOG_FRACTIONS = [1 / 2, 1 / 4];

/**
 * 部品をよけて登る道を探す。まっすぐ上げられるなら `null` (寄り道なし)。
 *
 * ずれ先を**穴の列の間に限る**のは、列の真上を横切ると、通り道の穴に挿さっているように
 * 見えるため。どの穴に入っているかを読ませるのがこの図の役目なので、
 * 穴の中心を通る線は引かない。**列は端点からではなく穴の格子から数える**
 * (板の外の機器のピンは格子に乗っていないので、端点からずらすと列を踏む)。
 * 同じ理由で、寄り道は板の中だけを使う。
 *
 * 使った列は `taken` に控えて、同じレーンの同じ側の別の配線が同じ列を登らないようにする
 * (重なると 2 本が 1 本に見えて、どの穴とどの穴がつながっているのか読めなくなる)。
 *
 * どこも塞がっていればまっすぐに戻す。逃げ場の無い盤面で無理に曲げるより、
 * 突き抜けさせて部品を上に描くほうが読める (描画順が最後の砦で、
 * この関数はその手前で避けられるものだけを避ける)。
 */
function escapeOf(
  end: Point,
  lane: Lane,
  layout: Layout,
  obstacles: readonly Rect[],
  taken: Set<number>,
): Escape {
  const blocked = (a: Point, b: Point): boolean => segmentHitsAny(a, b, obstacles, OBSTACLE_MARGIN);
  // 登り着く高さはスロットの割り当てで上下する。**厚みのぶん余計に見ておく**:
  // ここで見た高さより先まで引かれると、通したはずの道に部品が入っていることがある。
  const climbTo = (x: number, from: number): readonly [Point, Point] => [
    { x, y: Math.min(from, lane.y - lane.halfHeight) },
    { x, y: Math.max(from, lane.y + lane.halfHeight) },
  ];

  if (obstacles.length === 0 || !blocked(...climbTo(end.x, end.y))) return null;

  for (const fraction of JOG_FRACTIONS) {
    const jogY = end.y + (Math.sign(lane.y - end.y) || 1) * (layout.pitch * fraction);
    const stub = { x: end.x, y: jogY };
    if (blocked(end, stub)) continue;

    for (const step of DETOUR_STEPS) {
      const x = halfColumn(end.x, step, layout);
      if (taken.has(x) || !onBoard(x, layout)) continue;
      if (blocked(stub, { x, y: jogY }) || blocked(...climbTo(x, jogY))) continue;
      // 横に振ったぶんレーンを走る区間が伸びる。**伸びた先も見る**:
      // 見ないと、1 つ目の部品をよけて 2 つ目の上に乗ることがある。
      if (blocked({ x: end.x, y: lane.y }, { x, y: lane.y })) continue;

      taken.add(x);
      return { jogY, x };
    }
  }

  return null;
}

/** 穴の格子から数えた列の位置。`step` に 0.5 を渡せば列と列のちょうど間。 */
const halfColumn = (x: number, step: number, layout: Layout): number => {
  const origin = layout.colX(1);
  return origin + (Math.round((x - origin) / layout.pitch) + step) * layout.pitch;
};

const onBoard = (x: number, layout: Layout): boolean =>
  x >= layout.board.x && x <= layout.board.x + layout.board.width;

/**
 * 図の中の配線をまとめて引く。同じレーンを通る配線には別々のスロットを割り当てるので、
 * 本数が増えても重ならない。
 *
 * 寄り道はスロットより先に決める。**横に振ればレーンを走る区間の端が動く**ので、
 * 動いたあとの区間でスロットを配らないと、離したはずの 2 本がまた重なる。
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

  // 登る列はレーンの**側ごと**に控える。上へ登る道と下へ降りる道は高さが重ならないので、
  // 同じ列を使っても 1 本には見えない。まとめて数えると、譲る要りのない配線が
  // 遠くへ追いやられ、しまいには寄り道そのものを諦めることになる。
  const takenByLane = new Map<string, Set<number>>();
  const columnsFor = (lane: Lane, end: Point): Set<number> => {
    const key = `${lane.y}|${end.y > lane.y ? 'below' : 'above'}`;
    const taken = takenByLane.get(key) ?? new Set<number>();
    takenByLane.set(key, taken);
    return taken;
  };

  const escapes = requests.map((request, index): Escapes => {
    const lane = lanes[index];
    if (!lane) return { entry: null, exit: null };
    return {
      entry: escapeOf(request.from, lane, layout, obstacles, columnsFor(lane, request.from)),
      exit: escapeOf(request.to, lane, layout, obstacles, columnsFor(lane, request.to)),
    };
  });

  const offsets = assignSlots(requests, lanes, escapes);

  return requests.map((request, index) => {
    const lane = lanes[index];
    return lane
      ? buildPath(request.from, request.to, lane, offsets[index] ?? 0, escapes[index]!)
      : routeWire(request.from, request.to, layout, { hints: request.hints, obstacles });
  });
}

/** レーンを走る区間の左右。寄り道した配線は、振った先が端になる。 */
function laneRun(request: WireRequest, escapes: Escapes): { left: number; right: number } {
  const entryX = escapes.entry?.x ?? request.from.x;
  const exitX = escapes.exit?.x ?? request.to.x;
  return { left: Math.min(entryX, exitX), right: Math.max(entryX, exitX) };
}

/**
 * 同じレーンで x が重なる配線に別のスロットを配る。
 * 左端の順に見て、空いている一番内側のスロットを使う (区間グラフの貪欲彩色)。
 *
 * **どちら側から来た配線かで、段の伸びる向きを決める。** レーンより上の穴だけを結ぶ配線を
 * 上側へ、下の穴だけを結ぶ配線を下側へ伸ばすと、**縦の区間が反対側の横の区間まで
 * 届かない**ので、この 2 つは交差しない。側を見ずに交互に振っていたころは、
 * どちらに転ぶかが書いた順まかせだった。
 *
 * ただし**自分の側が埋まれば反対側にも出る**ので、交差しないと言い切れるのは
 * 側の数だけ段が空いている間まで。重ねて 1 本に見せるより、交差させて 2 本と
 * 分かるほうがましなので、そちらに倒してある。
 */
function assignSlots(
  requests: readonly WireRequest[],
  lanes: readonly (Lane | null)[],
  escapes: readonly Escapes[],
): readonly number[] {
  const offsets = new Array<number>(requests.length).fill(0);
  const order = requests
    .map((request, index) => ({ index, ...laneRun(request, escapes[index]!) }))
    .filter(({ index }) => lanes[index] !== null)
    .sort((a, b) => a.left - b.left);

  const takenByLane = new Map<number, Map<number, number>>();
  const levelsByLane = new Map<string, readonly number[]>();

  for (const { index, left, right } of order) {
    const lane = lanes[index]!;
    const taken = takenByLane.get(lane.y) ?? new Map<number, number>();
    const fromBelow = comesFromBelow(requests[index]!, lane);
    const levelKey = `${lane.y}|${fromBelow}`;
    const levels = levelsByLane.get(levelKey) ?? slotLevels(lane, fromBelow);
    levelsByLane.set(levelKey, levels);
    const free = levels.find((candidate) => (taken.get(candidate) ?? -Infinity) + SLOT_GAP <= left);

    // 段を使い切ったら、いちばん早く終わっている段に重ねる (重なりがいちばん短くて済む)。
    const level = free ?? levels.reduce((best, candidate) =>
      (taken.get(candidate) ?? -Infinity) < (taken.get(best) ?? -Infinity) ? candidate : best);

    // 段が塞がっている範囲は**伸ばす**。重ねたときに短い配線で上書きすると、
    // その段はもう空いていることになり、次の配線が先客の上に乗る。
    taken.set(level, Math.max(taken.get(level) ?? -Infinity, right));
    takenByLane.set(lane.y, taken);
    offsets[index] = level * SLOT_SPACING;
  }

  return offsets;
}

/**
 * 両端ともレーンより下の穴か。**片側だけの配線はレーンを跨ぐので、どのみち
 * 反対側の横の区間を切る**。数えるのは「跨がない」と言い切れるものだけにする。
 */
const comesFromBelow = (request: WireRequest, lane: Lane): boolean =>
  request.from.y > lane.y && request.to.y > lane.y;

/**
 * 段の試し順。**どちらの側の配線も中央 (0) から試す**ので、
 * 1 本しか通らないレーンは今までどおりレーンの真上を走る。
 * 埋まっていたときに伸びる向きだけが側によって変わる。
 *
 * 段数はレーンの厚みで決まる。これを超えてずらしても `buildPath` の clamp で
 * 端に潰れ、離したつもりの 2 本が同じ高さに戻ってしまう。
 */
function slotLevels(lane: Lane, fromBelow: boolean): readonly number[] {
  const reach = Math.max(1, Math.floor(lane.halfHeight / SLOT_SPACING));
  const first = fromBelow ? 1 : -1;
  const levels = [0];
  for (let step = 1; step <= reach; step += 1) levels.push(first * step, -first * step);
  return levels;
}

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
  const cost = (lane: Lane) => distance(lane) + OBSTACLE_PENALTY * obstaclesOnLane(lane, left, right, obstacles);

  // 部品の数だけ数える計算なので、勝ち残っているレーンのぶんを毎回引き直さない。
  return candidates
    .map((lane) => ({ lane, cost: cost(lane) }))
    .reduce((best, candidate) => (candidate.cost < best.cost ? candidate : best)).lane;
}

/** そのレーンを left..right まで走ったときに当たる部品の数。 */
const obstaclesOnLane = (lane: Lane, left: number, right: number, obstacles: readonly Rect[]): number =>
  obstacles.filter((rect) =>
    segmentHitsRect({ x: left, y: lane.y }, { x: right, y: lane.y }, rect, OBSTACLE_MARGIN)).length;

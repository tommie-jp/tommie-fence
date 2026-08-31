import type { Lane, Layout } from '../model/layout.ts';
import type { Point, Rect, WireHint } from '../types.ts';
import { boxHitsRect, segmentHitsAny } from './geometry.ts';

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
 *
 * **部品をよけて登る寄り道はここでは決めない** (`routeWires` の仕事)。
 * 寄り道は図の中の他の配線と場所を取り合うので、1 本だけを見て決められない。
 * ここで見る `obstacles` は、通るレーンを選ぶところまで。
 */
export function routeWire(from: Point, to: Point, layout: Layout, options: RouteOptions = {}): readonly Point[] {
  if (options.hints && options.hints.length > 0) return dedupe(followHints(from, to, options.hints));
  if (isDirect(from, to, layout)) return [from, to];

  const lane = chooseLane(from, to, layout, options.obstacles ?? []);
  return buildPath(from, to, lane, options.offset ?? 0, { entry: null, exit: null });
}

const isDirect = (from: Point, to: Point, layout: Layout): boolean =>
  Math.abs(from.x - to.x) < SAME_COLUMN_TOLERANCE
  || Math.hypot(to.x - from.x, to.y - from.y) <= SHORT_HOP_PITCHES * layout.pitch;

/**
 * 部品をよけて登るときの寄り道。`x` は登る列、`jogY` は横に振る高さ。
 * `column` と `row` は、この寄り道が押さえる道すじ (呼ぶ側が控える)。
 */
type Escape = { readonly jogY: number; readonly x: number; readonly column: Claim; readonly row: Claim } | null;
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
 * 寄り道が使った道すじ。列 (縦に登る) と行 (横に振る) を、**重なった区間まで**控える。
 * 列の番号だけを控えていたころは、行き先のレーンが違う 2 本が同じ列の同じ高さに乗ったり、
 * 振る高さが同じ 2 本の横の区間が重なったりしていた。重なると 2 本が 1 本に見えて、
 * どの穴とどの穴がつながっているのか読めなくなる。
 */
type Span = { readonly low: number; readonly high: number };
/** 押さえた道すじ 1 本。`at` は列なら x、行なら y。 */
type Claim = { readonly at: number; readonly span: Span };
type Reservations = { readonly columns: readonly Claim[]; readonly rows: readonly Claim[] };

const noReservations: Reservations = { columns: [], rows: [] };

const span = (a: number, b: number): Span => ({ low: Math.min(a, b), high: Math.max(a, b) });

/**
 * 近すぎる道すじが無いか。**同じ座標だけを見ては足りない**:
 * 1px ずれた 2 本は、線の太さのぶん重なって 1 本の太い線に見える。
 * 列は穴の格子に乗るので離れるが、行は端点とレーンの隔たりで決まるので端数が出る。
 */
const CLAIM_CLEARANCE = 6;

const isFree = (claims: readonly Claim[], at: number, want: Span): boolean =>
  claims.every((claim) =>
    Math.abs(claim.at - at) >= CLAIM_CLEARANCE
    || Math.min(claim.span.high, want.high) <= Math.max(claim.span.low, want.low));

/** 決めた寄り道を控えに足した、新しい控え。 */
const commit = (held: Reservations, escape: Escape): Reservations =>
  escape === null
    ? held
    : { columns: [...held.columns, escape.column], rows: [...held.rows, escape.row] };

/**
 * 部品をよけて登る道を探す。まっすぐ上げられるなら `null` (寄り道なし)。
 *
 * ずれ先を**穴の列の間に限る**のは、列の真上を横切ると、通り道の穴に挿さっているように
 * 見えるため。どの穴に入っているかを読ませるのがこの図の役目なので、
 * 穴の中心を通る線は引かない。**列は端点からではなく穴の格子から数える**
 * (板の外の機器のピンは格子に乗っていないので、端点からずらすと列を踏む)。
 * 同じ理由で、寄り道は板の中だけを使う。
 *
 * **押さえた道すじは返り値に入れて返す** (`held` は読むだけ)。
 * 呼ぶ側が控えるので、entry と exit のどちらが先かが呼ぶ側のコードに見える。
 * ここで黙って書き換えると、2 つの呼び出しを入れ替えただけで
 * 重なった寄り道ができあがり、しかもどのテストも落ちない。
 *
 * どこも塞がっていればまっすぐに戻す。逃げ場の無い盤面で無理に曲げるより、
 * 突き抜けさせて部品を上に描くほうが読める (描画順が最後の砦で、
 * この関数はその手前で避けられるものだけを避ける)。
 */
function escapeOf(
  end: Point,
  otherEnd: Point,
  lane: Lane,
  layout: Layout,
  obstacles: readonly Rect[],
  held: Reservations,
): Escape {
  const blocked = (a: Point, b: Point): boolean => segmentHitsAny(a, b, obstacles, OBSTACLE_MARGIN);
  // 登り着く高さはスロットの割り当てで上下する。**厚みのぶん余計に見ておく**:
  // ここで見た高さより先まで引かれると、通したはずの道に部品が入っていることがある。
  const climb = (from: number): Span =>
    span(Math.min(from, lane.y - lane.halfHeight), Math.max(from, lane.y + lane.halfHeight));
  const asPoints = (x: number, reach: Span): readonly [Point, Point] =>
    [{ x, y: reach.low }, { x, y: reach.high }];

  if (obstacles.length === 0 || !blocked(...asPoints(end.x, climb(end.y)))) return null;

  const toward = Math.sign(lane.y - end.y) || 1;
  // 振る高さは端点とレーンの**厚みの手前**に収める。行き着く高さはスロットで
  // 上下するので、中心までを目安にすると、混んだレーンでは通り越してから
  // 戻ってくる鉤のような折れ線になる。
  const room = Math.abs(lane.y - end.y) - lane.halfHeight;
  // 寄り道でレーンを走る区間が変わる。**増えたときだけ断る**:
  // 内側へ寄って短くなるぶんまで断ると、通せる寄り道を捨てて部品を突き抜ける。
  const onLaneNow = obstaclesOnLane(lane, ...bounds(end.x, otherEnd.x), obstacles);

  for (const fraction of JOG_FRACTIONS) {
    const hop = Math.min(layout.pitch * fraction, room / 2);
    if (hop <= 0) continue;

    const jogY = end.y + toward * hop;
    const stub = { x: end.x, y: jogY };
    if (blocked(end, stub)) continue;

    for (const step of DETOUR_STEPS) {
      const x = halfColumn(end.x, step, layout);
      if (!onBoard(x, layout)) continue;

      const column = { at: x, span: climb(jogY) };
      const row = { at: jogY, span: span(end.x, x) };
      if (!isFree(held.columns, x, column.span) || !isFree(held.rows, jogY, row.span)) continue;
      if (blocked(stub, { x, y: jogY }) || blocked(...asPoints(x, column.span))) continue;
      if (obstaclesOnLane(lane, ...bounds(x, otherEnd.x), obstacles) > onLaneNow) continue;

      return { jogY, x, column, row };
    }
  }

  return null;
}

const bounds = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)];

/**
 * 端点 from から配線が縦にどちらへ出て行くか。部品の寄せ (`placement/relocate.ts`) が
 * 「配線の通り道に部品を置かない」を決めるのに使う。
 *
 * **同じ列を縦に走るときだけ up / down を返す** (同じ列の直行と、レーンへの登り降り)。
 * 横へ逃げる短いホップは列に留まらないので、どちら側の穴も塞がない (none)。
 *
 * レーンは**障害物を見ずに**選ぶ。ここで要るのは実際の経路ではなく出だしの向きで、
 * 障害物ペナルティで遠いレーンへ逃げる例外まで追うと、寄せた部品で障害物が動き、
 * 向きがまた変わる循環になる。
 */
export function exitSide(from: Point, to: Point, layout: Layout): 'up' | 'down' | 'none' {
  if (isDirect(from, to, layout)) {
    if (Math.abs(from.x - to.x) >= layout.pitch / 2 || to.y === from.y) return 'none';
    return to.y > from.y ? 'down' : 'up';
  }
  const lane = chooseLane(from, to, layout, []);
  if (lane.y === from.y) return 'none';
  return lane.y > from.y ? 'down' : 'up';
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

  // 控えは図で 1 つ。**行き先のレーンが違っても、通る列と高さが重なれば 1 本に見える**ので、
  // レーンごとに分けて持つと見落とす。区間で見るので、高さの重ならない登り道は
  // 同じ列を使えて、譲る要りのない配線が遠くへ追いやられることもない。
  let held = noReservations;
  const escapes = requests.map((request, index): Escapes => {
    const lane = lanes[index];
    if (!lane) return { entry: null, exit: null };

    const entry = escapeOf(request.from, request.to, lane, layout, obstacles, held);
    held = commit(held, entry);
    const exit = escapeOf(request.to, request.from, lane, layout, obstacles, held);
    held = commit(held, exit);

    return { entry, exit };
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

  const takenByLane = new Map<number, Map<number, Slot>>();

  for (const { index, left, right } of order) {
    const lane = lanes[index]!;
    const taken = takenByLane.get(lane.y) ?? new Map<number, Slot>();
    const levels = slotLevels(lane, comesFromBelow(requests[index]!, lane));

    const free = levels.find((candidate) => (taken.get(candidate)?.right ?? -Infinity) + SLOT_GAP <= left);
    const level = free ?? mostRoom(levels, taken);
    const held = taken.get(level);

    // 段が塞がっている範囲は**伸ばす**。重ねたときに短い配線で上書きすると、
    // その段はもう空いていることになり、次の配線が先客の上に乗る。
    taken.set(level, {
      right: Math.max(held?.right ?? -Infinity, right),
      wires: (held?.wires ?? 0) + 1,
    });
    takenByLane.set(lane.y, taken);
    offsets[index] = level * SLOT_SPACING;
  }

  return offsets;
}

/** 段 1 つの埋まり具合。`right` は塞がっている右端、`wires` は載っている本数。 */
type Slot = { readonly right: number; readonly wires: number };

/**
 * 段を使い切ったときに重ねる先。**載っている本数の少ない段から**選び、
 * 同じなら早く終わっているほう (重なりが短くて済む)。
 * 端だけを見ていたころは同じ段に積み上がり、3 本 4 本が 1 本に見えていた。
 */
const mostRoom = (levels: readonly number[], taken: ReadonlyMap<number, Slot>): number =>
  levels.reduce((best, candidate) => {
    const [a, b] = [taken.get(candidate), taken.get(best)];
    if ((a?.wires ?? 0) !== (b?.wires ?? 0)) return (a?.wires ?? 0) < (b?.wires ?? 0) ? candidate : best;
    return (a?.right ?? -Infinity) < (b?.right ?? -Infinity) ? candidate : best;
  });

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

/**
 * そのレーンを left..right まで走ったときに当たる部品の数。
 * **見るのは中心線ではなくレーンの厚み**。スロットの割り当てで配線は厚みのぶん上下するので、
 * 中心だけを見ていると、少しずれた高さに置いてある部品のラベルの上を走ってしまう。
 */
const obstaclesOnLane = (lane: Lane, left: number, right: number, obstacles: readonly Rect[]): number =>
  obstacles.filter((rect) => boxHitsRect(
    { x: left, y: lane.y - lane.halfHeight },
    { x: right, y: lane.y + lane.halfHeight },
    rect,
    OBSTACLE_MARGIN,
  )).length;

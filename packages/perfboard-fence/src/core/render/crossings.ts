import type { Point } from '../types.ts';

/** 端から端までの 1 本。配線も、機器へ引いた線も、図の上ではこれだけ。 */
export type Segment = { readonly from: Point; readonly to: Point };

/**
 * **交差しているのに接点ではない場所**を線ごとに拾う。
 *
 * この板は穴どうしが何もつながっていないので、導通が生まれるのは配線の
 * **両端の穴だけ**。線の途中で別の線と重なっても、そこはただの交差で、
 * 電気的には何も起きない。ところが図の上では 2 本の線が同じ点で出会うので、
 * **半田付けした接点に見える**。読み違えたまま組むと、つながっていない 2 つの網が
 * つながっているつもりの回路になる。
 *
 * 拾った点は跨ぎ (半円) を描く場所になる (`render/wires.ts`)。返すのは
 * **あとに書いた線のぶんだけ** — 2 本とも跨ぐと、どちらが上か分からなくなる。
 */
export function crossingPoints(segments: readonly Segment[]): readonly (readonly Point[])[] {
  return segments.map((segment, index) => segments
    .slice(0, index)
    .map((earlier) => meeting(segment, earlier))
    .filter((point): point is Point => point !== null));
}

/**
 * 2 本が**途中で**交わる点。端を共有しているだけ (同じ穴に集まる線) は交差ではない
 * — そこは実際につながっている接点なので、跨ぐと嘘になる。
 */
function meeting(one: Segment, other: Segment): Point | null {
  if (sharesEnd(one, other)) return null;

  const a = side(one.from, one.to, other.from);
  const b = side(one.from, one.to, other.to);
  const c = side(other.from, other.to, one.from);
  const d = side(other.from, other.to, one.to);

  // **重なりも、端が線に乗っているものも除く** (0 を含めない)。端が別の線の途中に
  // 乗っている図は交差ではなく書き方の問題で、跨いでも直らない。
  if (!(Math.sign(a) * Math.sign(b) < 0 && Math.sign(c) * Math.sign(d) < 0)) return null;

  // 交わる位置は**符号ではなく面積の比**で出す (符号だけだと必ず真ん中になる)。
  const at = c / (c - d);
  return {
    x: one.from.x + (one.to.x - one.from.x) * at,
    y: one.from.y + (one.to.y - one.from.y) * at,
  };
}

/** `from`→`to` から見て `at` がどちら側か。**大きさは 2 点が作る面積**。 */
const side = (from: Point, to: Point, at: Point): number =>
  (to.x - from.x) * (at.y - from.y) - (to.y - from.y) * (at.x - from.x);

const sharesEnd = (one: Segment, other: Segment): boolean =>
  same(one.from, other.from) || same(one.from, other.to)
  || same(one.to, other.from) || same(one.to, other.to);

const same = (one: Point, other: Point): boolean => one.x === other.x && one.y === other.y;

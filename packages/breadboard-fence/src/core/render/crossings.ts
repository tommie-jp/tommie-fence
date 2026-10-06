import type { Point } from '../types.ts';

/** 端から端までの 1 区間。配線は折れ点で区切った区間の並び。 */
type Segment = { readonly from: Point; readonly to: Point };

/**
 * **交差しているのに接点ではない場所**を配線ごとに拾う (perfboard-fence の
 * `render/crossings.ts` と同じ考え方。あちらは直線、こちらは折れ線)。
 *
 * 配線は基板の上に浮いていて、途中で別の線と重なっても電気的には何も起きない。
 * ところが図の上では 2 本が同じ点で出会うので、**つながっているように見える**
 * (溝をまたいで下の段へ渡す線が並ぶと起きやすい)。
 *
 * 拾った点は跨ぎ (半円) を描く場所になる (`render/wires.ts`)。返すのは
 * **あとに書いた線のぶんだけ** — 2 本とも跨ぐと、どちらが上か分からなくなる。
 */
export function crossingPoints(wires: readonly (readonly Point[])[]): readonly (readonly Point[])[] {
  const segmented = wires.map(segmentsOf);
  return segmented.map((segments, index) => segmented
    .slice(0, index)
    .flatMap((earlier) => segments.flatMap((segment) => earlier
      .map((other) => meeting(segment, other))
      .filter((point): point is Point => point !== null))));
}

const segmentsOf = (points: readonly Point[]): readonly Segment[] =>
  points.slice(1).map((to, index) => ({ from: points[index]!, to }));

/**
 * 2 区間が**途中で**交わる点。端を共有しているだけ (同じ穴に集まる線) は交差ではない
 * — そこは実際につながっている接点なので、跨ぐと嘘になる。
 */
function meeting(one: Segment, other: Segment): Point | null {
  if (sharesEnd(one, other)) return null;

  const a = side(one.from, one.to, other.from);
  const b = side(one.from, one.to, other.to);
  const c = side(other.from, other.to, one.from);
  const d = side(other.from, other.to, one.to);

  // **重なりも、端が線に乗っているものも除く** (0 を含めない)。同じ行を並んで走る線や、
  // 折れ点が別の線の上に乗っているだけの所は、跨いでも見やすくならない。
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

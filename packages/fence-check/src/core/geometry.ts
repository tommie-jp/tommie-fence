import type { ScenePoint, SceneRect } from 'fence-kit';

/** 端から端までの 1 区間。 */
export type Segment = { readonly from: ScenePoint; readonly to: ScenePoint };

/** 同じ点と見なす距離 (px)。番地は小数 2 桁まで書けるので、丸めの揺れだけを吸う。 */
export const SAME_POINT = 0.5;

export const isSamePoint = (a: ScenePoint, b: ScenePoint): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) <= SAME_POINT;

/** 折れ線を区間に切る。長さ 0 の区間は落とす。 */
export const segmentsOf = (points: readonly ScenePoint[]): readonly Segment[] =>
  points.slice(1)
    .map((to, index) => ({ from: points[index]!, to }))
    .filter((segment) => !isSamePoint(segment.from, segment.to));

/** 長方形の 4 隅。 */
export function corners(rect: SceneRect): readonly ScenePoint[] {
  const cos = Math.cos(rect.angle);
  const sin = Math.sin(rect.angle);
  const w = rect.width / 2;
  const h = rect.height / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x = 0, y = 0]) => ({
    x: rect.cx + x * cos - y * sin,
    y: rect.cy + x * sin + y * cos,
  }));
}

const shadow = (points: readonly ScenePoint[], axis: ScenePoint): { min: number; max: number } => {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
};

/**
 * 2 つの長方形がどれだけ食い込んでいるか (px)。**分離軸**で見て、4 つの軸の
 * 影の重なりのうち一番浅いもの — 軸に沿った箱どうしなら、重なった矩形の短辺。
 * 離れているか触れているだけなら 0。
 */
export function penetration(a: SceneRect, b: SceneRect): number {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return 0;
  const ca = corners(a);
  const cb = corners(b);
  const axes = [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]
    .map((angle) => ({ x: Math.cos(angle), y: Math.sin(angle) }));
  let depth = Number.POSITIVE_INFINITY;
  for (const axis of axes) {
    const sa = shadow(ca, axis);
    const sb = shadow(cb, axis);
    const overlap = Math.min(sa.max, sb.max) - Math.max(sa.min, sb.min);
    if (overlap <= 0) return 0;
    depth = Math.min(depth, overlap);
  }
  return depth;
}

/**
 * 区間のうち長方形の中を通る長さ (px)。長方形の向きに直してから
 * 軸に沿った箱で切る (Liang–Barsky)。
 */
export function lengthInside(segment: Segment, rect: SceneRect): number {
  if (rect.width <= 0 || rect.height <= 0) return 0;
  const cos = Math.cos(-rect.angle);
  const sin = Math.sin(-rect.angle);
  const local = (point: ScenePoint): ScenePoint => {
    const dx = point.x - rect.cx;
    const dy = point.y - rect.cy;
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  };
  const p = local(segment.from);
  const q = local(segment.to);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const w = rect.width / 2;
  const h = rect.height / 2;
  let enter = 0;
  let leave = 1;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, p.x + w], [dx, w - p.x], [-dy, p.y + h], [dy, h - p.y],
  ];
  for (const [step, room] of edges) {
    if (step === 0) {
      if (room <= 0) return 0;
      continue;
    }
    const t = room / step;
    if (step < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter >= leave) return 0;
  }
  return (leave - enter) * Math.hypot(dx, dy);
}

const cross = (o: ScenePoint, a: ScenePoint, b: ScenePoint): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * 2 区間が**どちらの途中でも**交わる点 (十字)。端で触れる (T 字・つながり) と
 * 平行に重なるのは交差としない。無ければ null。
 */
export function crossingOf(one: Segment, other: Segment): ScenePoint | null {
  const d1 = cross(other.from, other.to, one.from);
  const d2 = cross(other.from, other.to, one.to);
  const d3 = cross(one.from, one.to, other.from);
  const d4 = cross(one.from, one.to, other.to);
  if (!(d1 * d2 < 0 && d3 * d4 < 0)) return null;
  const t = d1 / (d1 - d2);
  const point = {
    x: one.from.x + (one.to.x - one.from.x) * t,
    y: one.from.y + (one.to.y - one.from.y) * t,
  };
  const ends = [one.from, one.to, other.from, other.to];
  return ends.some((end) => isSamePoint(end, point)) ? null : point;
}

/** 点が区間の**途中** (端を除く) に乗っているか。 */
export function isInside(point: ScenePoint, segment: Segment): boolean {
  if (isSamePoint(point, segment.from) || isSamePoint(point, segment.to)) return false;
  const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
  if (length === 0) return false;
  const distance = Math.abs(cross(segment.from, segment.to, point)) / length;
  if (distance > SAME_POINT) return false;
  const t = ((point.x - segment.from.x) * (segment.to.x - segment.from.x)
    + (point.y - segment.from.y) * (segment.to.y - segment.from.y)) / (length * length);
  return t > 0 && t < 1;
}

/** 向き (度、0〜359 の整数)。4 方向の数え上げで同じ向きをまとめるのに使う。 */
export const headingOf = (from: ScenePoint, to: ScenePoint): number =>
  ((Math.round((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI) % 360) + 360) % 360;

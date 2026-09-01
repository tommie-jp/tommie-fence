import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point } from '../types.ts';

/**
 * 部品の胴の形と、その重なり。
 *
 * **描画とここで同じ形を使う。** 別々に持つと、片方を直したときに
 * 「図では重なって見えるのに何も言わない」あるいはその逆になる
 * (`pinRef` を 2 か所に持って ERC が黙った件と同じ型)。
 */

/** 胴の高さ。ピッチ (20) の中に収まる太さ。 */
export const BODY_HEIGHT = 11;
/** 胴が穴に掛からないよう、両端から詰める幅。 */
export const BODY_INSET = 9;
/** 玉の直径 (LED)。**足の間隔で変わらない。** */
export const DOME_SIZE = BODY_HEIGHT + 2;

/**
 * 玉で描く部品 — **胴が足の間を跨がない形**。丸い本体から足が 2 本出るので、
 * 足を遠くへ広げても本体の大きさは変わらない。
 * 描画 (`render/parts.ts`) と当たり判定が同じ集合を見る。
 */
const DOME_TYPES: ReadonlySet<string> = new Set(['led']);

export const isDome = (type: string): boolean => DOME_TYPES.has(type);

/** 中心・大きさ・傾きで表した長方形。 */
export type OrientedRect = {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  /** ラジアン。x 軸が足の向き。 */
  readonly angle: number;
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * 足の間隔を穴の数で数える。**斜めは足から足への直線**で測る —
 * 胴が跨ぐのはその直線であって、行や列の差ではない。
 */
export function spanOf(part: PlacedPart): number | null {
  const [first, second] = part.pins;
  if (!first || !second) return null;
  return Math.hypot(
    second.address.col - first.address.col,
    second.address.row - first.address.row,
  );
}

/** 胴の長方形。足が 2 本そろっていなければ null。 */
export function bodyRect(part: PlacedPart, layout: Layout): OrientedRect | null {
  const [first, second] = part.pins;
  if (!first || !second) return null;

  const from = layout.point(first.address);
  const to = layout.point(second.address);
  const center = midpoint(from, to);
  const length = Math.hypot(to.x - from.x, to.y - from.y);

  // **描かれている形をそのまま返す。** 玉の部品は足を広げても本体が伸びないので、
  // 足の間隔から胴を作ると、離れた部品と重なっていると言い出す。
  const width = isDome(part.type) ? DOME_SIZE : Math.max(length - BODY_INSET * 2, BODY_HEIGHT);

  return {
    cx: center.x,
    cy: center.y,
    width,
    height: isDome(part.type) ? DOME_SIZE : BODY_HEIGHT,
    angle: Math.atan2(to.y - from.y, to.x - from.x),
  };
}

/** 長方形の 4 隅。 */
function corners(rect: OrientedRect): Point[] {
  const cos = Math.cos(rect.angle);
  const sin = Math.sin(rect.angle);
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([x = 0, y = 0]) => ({
    x: rect.cx + x * cos - y * sin,
    y: rect.cy + x * sin + y * cos,
  }));
}

const project = (points: readonly Point[], axis: Point): { min: number; max: number } => {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
};

/**
 * 2 つの胴が重なっているか。**分離軸定理** — 傾いた長方形どうしは、
 * 4 辺の法線のどれかで影が離れていれば重なっていない。
 *
 * 触れているだけ (影がちょうど接する) は重なりとしない。実物でも
 * 隣り合わせに並べることはできる。
 */
export function overlaps(a: OrientedRect, b: OrientedRect): boolean {
  const cornersA = corners(a);
  const cornersB = corners(b);
  const axes = [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]
    .map((angle) => ({ x: Math.cos(angle), y: Math.sin(angle) }));

  return axes.every((axis) => {
    const shadowA = project(cornersA, axis);
    const shadowB = project(cornersB, axis);
    return shadowA.max > shadowB.min && shadowB.max > shadowA.min;
  });
}

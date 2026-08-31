import type { Point, Rect } from '../types.ts';

/**
 * 2 点が張る矩形が、部品の矩形と重なるかどうか。
 *
 * **触れているだけでは重なったことにしない**: 端点が部品の縁にちょうど載る配線
 * (部品の足から出る配線がまさにそれ) まで避け始めると、どこにも引けなくなる。
 */
export function boxHitsRect(a: Point, b: Point, rect: Rect, margin: number): boolean {
  return Math.min(a.x, b.x) < rect.x + rect.width + margin
    && Math.max(a.x, b.x) > rect.x - margin
    && Math.min(a.y, b.y) < rect.y + rect.height + margin
    && Math.max(a.y, b.y) > rect.y - margin;
}

export const segmentHitsAny = (
  a: Point,
  b: Point,
  rects: readonly Rect[],
  margin: number,
): boolean => rects.some((rect) => boxHitsRect(a, b, rect, margin));

/** 折れ線のどこかが矩形に当たるか。 */
export function pathHitsAny(points: readonly Point[], rects: readonly Rect[], margin: number): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (segmentHitsAny(points[index - 1]!, points[index]!, rects, margin)) return true;
  }
  return false;
}

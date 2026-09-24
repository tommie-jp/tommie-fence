import type { Board, Mm } from '../types.ts';
import { TOUCH } from './shapes.ts';
import type { Axis, Shape } from './shapes.ts';

/**
 * 平行に向かい合う 2 本の線路の隙間 — **結合線路** (ヘアピン・インターディジタル・
 * 結合器) の寸法。図では書かせずに**測って出す** (書いた数と形が食い違わない)。
 *
 * 数えるのは、**別の形どうし**で、向きが同じ区間が 1mm 以上並び、隙間が
 * 基材の厚さの 2 倍以内のものだけ。それより離れると結合は弱く、寸法を出しても
 * 図が字で埋まるだけになる。
 */
export type Coupling = {
  readonly a: string;
  readonly b: string;
  /** 隙間 (mm)。 */
  readonly spacing: number;
  readonly axis: Axis;
  /** 隙間の真ん中 (字を置く所)。 */
  readonly at: Mm;
  /** 並んでいる長さ (mm)。 */
  readonly overlap: number;
  readonly line: number | null;
};

const MIN_OVERLAP = 1;

export function couplingsOf(shapes: readonly Shape[], board: Board): readonly Coupling[] {
  const lines = shapes.filter((shape) => shape.kind === 'line');
  const found: Coupling[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const [a, b] = [lines[i], lines[j]];
      if (a === undefined || b === undefined) continue;
      let best: Coupling | null = null;
      for (const pa of a.pieces) {
        for (const pb of b.pieces) {
          if (pa.axis === null || pa.axis !== pb.axis) continue;
          const [ra, rb] = [pa.rect, pb.rect];
          // 並ぶ向きの重なりと、向かい合う向きの隙間。
          const [a0, a1, b0, b1] = pa.axis === 'x'
            ? [ra.x, ra.x + ra.width, rb.x, rb.x + rb.width]
            : [ra.y, ra.y + ra.height, rb.y, rb.y + rb.height];
          const overlap = Math.min(a1, b1) - Math.max(a0, b0);
          if (overlap < MIN_OVERLAP) continue;
          const [c0, c1, d0, d1] = pa.axis === 'x'
            ? [ra.y, ra.y + ra.height, rb.y, rb.y + rb.height]
            : [ra.x, ra.x + ra.width, rb.x, rb.x + rb.width];
          const spacing = c1 <= d0 ? d0 - c1 : d1 <= c0 ? c0 - d1 : -1;
          if (spacing <= TOUCH || spacing > board.h * 2) continue;
          if (best !== null && best.spacing <= spacing) continue;
          const along = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
          const across = c1 <= d0 ? (c1 + d0) / 2 : (d1 + c0) / 2;
          best = {
            a: a.id, b: b.id, spacing: Math.round(spacing * 100) / 100, axis: pa.axis, overlap,
            at: pa.axis === 'x' ? { x: along, y: across } : { x: across, y: along },
            line: b.line,
          };
        }
      }
      if (best !== null) found.push(best);
    }
  }
  return found;
}

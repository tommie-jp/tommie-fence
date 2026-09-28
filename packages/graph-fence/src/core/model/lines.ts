import { LIMITS } from '../limits.ts';
import { evaluate } from './expr.ts';
import type { Expr } from './expr.ts';

/**
 * 線。**元は 3 通り** — 式 (理想・計算)、点列 (予想・本文の表)、実測 (`data:` の CSV)。
 * 式と点列は破線でつなぎ、実測は点 (○) で打って**線で結ばない**
 * (手で測った 10 点ほどを結ぶと、測っていない所まで在るように見える。52 の docs/98 §5.1)。
 */

export type Point = { readonly x: number; readonly y: number };

export type LineSource =
  | { readonly kind: 'expr'; readonly expr: Expr; readonly text: string }
  | { readonly kind: 'points'; readonly points: readonly Point[] }
  | { readonly kind: 'data'; readonly points: readonly Point[]; readonly column: string };

export type LineSpec = {
  readonly name: string;
  /** 刷る単位 (枠を分ける鍵)。 */
  readonly unit: string;
  readonly source: LineSource;
  /** 書いた順の番号 (色が決まる)。実測だけの線は理想の線の後ろに続く。 */
  readonly index: number;
  readonly line: number | null;
};

/** 横軸の範囲と目盛の取り方 (標本の間隔を決める)。 */
export type XRange = { readonly min: number; readonly max: number; readonly log: boolean };

/** 理想 (式・点列) か実測か。 */
export const isMeasured = (line: LineSpec): boolean => line.source.kind === 'data';

/** 描いてよい値か (有限で、上限の内)。 */
export const drawable = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= LIMITS.valueMax;

/**
 * 描く点の列。式は x の範囲を {@link LIMITS.samples} 点に (対数の軸なら対数で等間隔)。
 * **描けない値 (NaN・無限・上限の外) は抜く** — SVG に NaN を書かない。
 */
export function sampleLine(spec: LineSpec, range: XRange): readonly Point[] {
  const { source } = spec;
  if (source.kind !== 'expr') return source.points.filter((point) => drawable(point.x) && drawable(point.y) && (!range.log || point.x > 0));
  const count = LIMITS.samples;
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const x = range.log
      ? 10 ** (Math.log10(range.min) + t * (Math.log10(range.max) - Math.log10(range.min)))
      : range.min + t * (range.max - range.min);
    const y = evaluate(source.expr, x);
    if (drawable(y)) points.push({ x, y });
  }
  return points;
}

/**
 * x での値。**式はその x で計算**、点列は前後の点の間を直線で (対数の軸なら log x で)、
 * 実測は一番近い点 (vna のマーカーと同じ — 測っていない所を作らない)。
 * 範囲の外・描けない値は null (読み値は —)。
 */
export function valueAt(spec: LineSpec, x: number, log: boolean): number | null {
  const { source } = spec;
  if (source.kind === 'expr') {
    const y = evaluate(source.expr, x);
    return drawable(y) ? y : null;
  }
  // 対数の軸では x ≤ 0 の点は置けない (log が決まらない)。抜いて読む。
  const points = source.points.filter((point) => drawable(point.x) && drawable(point.y) && (!log || point.x > 0));
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || x < first.x || x > last.x) return null;
  if (source.kind === 'data') {
    let best = first;
    for (const point of points) if (Math.abs(point.x - x) < Math.abs(best.x - x)) best = point;
    return best.y;
  }
  const scale = (value: number): number => (log ? Math.log10(value) : value);
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1] as Point;
    const right = points[index] as Point;
    if (x < left.x || x > right.x) continue;
    if (right.x === left.x) return right.y;
    const t = (scale(x) - scale(left.x)) / (scale(right.x) - scale(left.x));
    return left.y + t * (right.y - left.y);
  }
  return last.x === x ? last.y : null;
}

/** 頂点 (一番大きい値の点)。点が無ければ null。 */
export function peakOf(points: readonly Point[]): Point | null {
  let best: Point | null = null;
  for (const point of points) if (best === null || point.y > best.y) best = point;
  return best;
}

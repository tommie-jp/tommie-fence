import { element, num, svgText } from 'fence-kit';
import type { Layout, Rect } from '../layout/screen.ts';
import { fractionY } from '../layout/scales.ts';
import { MARK } from './grid.ts';
import type { Theme } from './theme.ts';
import type { Scale } from './trace.ts';

/**
 * XY の曲線。**横も縦も 8 目盛** — `fractionY` (8 目盛・縁に寄せる) を両軸に使う。
 * 点は 0.5 px より動かないものを間引く (8192 点をそのまま書くと SVG が 100 kB を越える)。
 * 最後の点は必ず残す (閉じた曲線が閉じて見える)。理想だけなので実線 (実測を重ねない)。
 */
const MIN_STEP = 0.5;

export function xyPoints(x: ArrayLike<number>, y: ArrayLike<number>, grid: Rect, xScale: Scale, yScale: Scale): readonly (readonly [number, number])[] {
  const count = Math.min(x.length, y.length);
  const points: (readonly [number, number])[] = [];
  let last: readonly [number, number] | null = null;
  for (let index = 0; index < count; index += 1) {
    const px = grid.x + fractionY(x[index] ?? 0, xScale.perDiv, xScale.position) * grid.width;
    const py = grid.y + (1 - fractionY(y[index] ?? 0, yScale.perDiv, yScale.position)) * grid.height;
    const far = last === null || Math.hypot(px - last[0], py - last[1]) >= MIN_STEP;
    if (far || index === count - 1) {
      last = [px, py];
      points.push(last);
    }
  }
  return points;
}

export function renderXyCurve(points: readonly (readonly [number, number])[], color: string): string {
  if (points.length === 0) return '';
  return element('polyline', {
    points: points.map(([px, py]) => `${num(px)},${num(py)}`).join(' '),
    fill: 'none',
    stroke: color,
    'stroke-width': 1.5,
    'stroke-linejoin': 'round',
    'data-channel': 'xy',
  });
}

/**
 * 横軸の 0 の印 `1▼` (格子の上の余白)。縦軸の 0 は時間の画面と同じ `▶` を左に置く。
 * `fraction` は 0 = 左、1 = 右。
 */
export function renderXMark(label: string, fraction: number, layout: Layout, theme: Theme, color: string): string {
  const { x, y, width } = layout.grid;
  const mx = x + fraction * width;
  const triangle = element('polygon', {
    points: `${num(mx - MARK / 2)},${num(y - 1 - MARK)} ${num(mx + MARK / 2)},${num(y - 1 - MARK)} ${num(mx)},${num(y - 1)}`,
    fill: color,
  });
  return triangle + svgText(mx - MARK / 2 - 1, y - 1 - MARK / 2 + theme.metrics.smallSize * 0.35, label, {
    anchor: 'end', fill: color, 'font-size': num(theme.metrics.smallSize),
  });
}

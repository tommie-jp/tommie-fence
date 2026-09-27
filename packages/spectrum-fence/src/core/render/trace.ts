import { BOLD_FAMILY, element, num, svgText } from 'fence-kit';
import { xOf, yOf } from '../layout/scales.ts';
import type { Axes } from '../layout/scales.ts';
import type { Rect } from '../layout/screen.ts';
import type { Point } from '../model/trace.ts';
import type { Theme } from './theme.ts';

/**
 * トレースの折れ線。**点が格子の px より多ければ、px の列ごとの min / max に間引く**
 * (FFT 型の 3200 bin を 400 px に。scope の trace.ts と同じ描き方)。
 * 理想は破線 `5 3`、実測は実線。読み値は間引く前の点で読む。
 */
const DASH = '5 3';

export function decimate(points: readonly Point[], axes: Axes, grid: Rect): readonly (readonly [number, number])[] {
  const columns = Math.max(1, Math.round(grid.width));
  if (points.length <= columns) return points.map((point) => [xOf(point.f, axes, grid), yOf(point.level, axes, grid)]);
  const lows = new Float64Array(columns).fill(Infinity);
  const highs = new Float64Array(columns).fill(-Infinity);
  const lowAt = new Int32Array(columns);
  const highAt = new Int32Array(columns);
  points.forEach((point, index) => {
    const column = Math.min(columns - 1, Math.max(0, Math.floor(((point.f - axes.start) / (axes.stop - axes.start)) * columns)));
    if (point.level < (lows[column] ?? Infinity)) {
      lows[column] = point.level;
      lowAt[column] = index;
    }
    if (point.level > (highs[column] ?? -Infinity)) {
      highs[column] = point.level;
      highAt[column] = index;
    }
  });
  // 列の中で先に来たほうを先に置く (線が行き来しない)。
  const out: (readonly [number, number])[] = [];
  for (let column = 0; column < columns; column += 1) {
    const low = lows[column] ?? Infinity;
    const high = highs[column] ?? -Infinity;
    if (low === Infinity) continue;
    const x = grid.x + ((column + 0.5) / columns) * grid.width;
    const [a, b] = (lowAt[column] ?? 0) <= (highAt[column] ?? 0) ? [low, high] : [high, low];
    out.push([x, yOf(a, axes, grid)]);
    if (a !== b) out.push([x, yOf(b, axes, grid)]);
  }
  return out;
}

export function renderTrace(points: readonly Point[], basis: 'model' | 'data', axes: Axes, grid: Rect, color: string): string {
  const drawn = decimate(points, axes, grid);
  if (drawn.length === 0) return '';
  return element('polyline', {
    points: drawn.map(([x, y]) => `${num(x)},${num(y)}`).join(' '),
    fill: 'none',
    stroke: color,
    'stroke-width': 1.5,
    'stroke-linejoin': 'round',
    ...(basis === 'model' ? { 'stroke-dasharray': DASH } : {}),
    'data-basis': basis,
  });
}

/** 番号が格子の上にはみ出す高さ。これより上の点では印を下向きに返す。 */
const GLYPH_REACH = 17;

/**
 * マーカーの印 (▽ と番号)。先が点を指す。**格子の上の縁に近い点では ▲ を点の下に**
 * 置く (vna の写し)。
 */
export function renderMarker(point: Point, label: string, axes: Axes, grid: Rect, color: string, theme: Theme): string {
  const x = xOf(point.at, axes, grid);
  const y = yOf(point.level, axes, grid);
  const below = y - GLYPH_REACH < grid.y;
  const tip = below ? 7 : -7;
  const path = `M${num(x)},${num(y)} L${num(x - 4)},${num(y + tip)} L${num(x + 4)},${num(y + tip)} Z`;
  const size = theme.metrics.smallSize;
  return element('path', { d: path, fill: color, 'data-marker': label })
    + svgText(x, below ? y + 9 + size * 0.8 : y - 9, label, {
      fill: color, 'font-size': num(size), 'font-weight': 600, 'font-family': BOLD_FAMILY, halo: theme.palette.halo, haloWidth: 2.5,
    });
}

import { element, num, svgText } from 'fence-kit';
import type { Rect } from '../layout/screen.ts';
import { fractionY } from '../layout/scales.ts';
import type { Trace } from '../model/readings.ts';
import type { Screen } from '../model/screen.ts';
import type { Theme } from './theme.ts';

/**
 * 波の折れ線。**8192 点を px の列ごとの min / max に間引く** (実機の描き方と同じ)。
 * 1 本の `polyline` は格子の幅 × 2 点まで (400 px なら 800 点)。読み値は間引く前の点で測る。
 * 理想は破線 `5 3`、実測は実線。
 */
export type Scale = { readonly perDiv: number; readonly position: number };

const DASH = '5 3';

/** 画面の中の点を px の列に畳む。列の中で先に来たほうを先に置く (線が行き来しない)。 */
export function decimate(trace: Trace, grid: Rect, screen: Screen, scale: Scale): readonly (readonly [number, number])[] {
  const columns = Math.max(1, Math.round(grid.width));
  const lows = new Float64Array(columns).fill(Infinity);
  const highs = new Float64Array(columns).fill(-Infinity);
  const firstAt = new Int32Array(columns).fill(-1);
  const lowAt = new Int32Array(columns);
  const highAt = new Int32Array(columns);
  const { samples } = trace;
  for (let index = 0; index < samples.length; index += 1) {
    const t = trace.t0 + index * trace.dt;
    const x = (t - screen.left) / screen.span;
    if (x < -1e-9 || x > 1 + 1e-9) continue;
    const column = Math.min(columns - 1, Math.max(0, Math.floor(x * columns)));
    const value = samples[index] ?? 0;
    if (firstAt[column] === -1) firstAt[column] = index;
    if (value < (lows[column] ?? Infinity)) {
      lows[column] = value;
      lowAt[column] = index;
    }
    if (value > (highs[column] ?? -Infinity)) {
      highs[column] = value;
      highAt[column] = index;
    }
  }
  const yOf = (volts: number): number => grid.y + (1 - fractionY(volts, scale.perDiv, scale.position)) * grid.height;
  const points: (readonly [number, number])[] = [];
  for (let column = 0; column < columns; column += 1) {
    if (firstAt[column] === -1) continue;
    const x = grid.x + ((column + 0.5) / columns) * grid.width;
    const low = yOf(lows[column] ?? 0);
    const high = yOf(highs[column] ?? 0);
    if (low === high) points.push([x, low]);
    else if ((lowAt[column] ?? 0) <= (highAt[column] ?? 0)) points.push([x, low], [x, high]);
    else points.push([x, high], [x, low]);
  }
  return points;
}

export function renderTrace(trace: Trace, grid: Rect, screen: Screen, scale: Scale, color: string): string {
  const points = decimate(trace, grid, screen, scale);
  if (points.length === 0) return '';
  return element('polyline', {
    points: points.map(([x, y]) => `${num(x)},${num(y)}`).join(' '),
    fill: 'none',
    stroke: color,
    'stroke-width': 1.5,
    'stroke-linejoin': 'round',
    ...(trace.basis === 'model' ? { 'stroke-dasharray': DASH } : {}),
    'data-channel': trace.name,
  });
}

/** カーソル。縦の破線と、上端に `X1` `X2`。 */
export function renderCursor(t: number, name: string, grid: Rect, screen: Screen, theme: Theme): string {
  const x = grid.x + ((t - screen.left) / screen.span) * grid.width;
  return element('line', {
    x1: num(x), y1: num(grid.y), x2: num(x), y2: num(grid.y + grid.height),
    stroke: theme.palette.caption, 'stroke-width': 1, 'stroke-dasharray': '2 2',
  }) + svgText(x + 2, grid.y + theme.metrics.smallSize + 1, name, {
    anchor: 'start', fill: theme.palette.caption, 'font-size': num(theme.metrics.smallSize), halo: theme.palette.halo,
  });
}

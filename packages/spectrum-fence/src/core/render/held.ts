import { element, num } from 'fence-kit';
import type { Axes } from '../layout/scales.ts';
import type { Rect } from '../layout/screen.ts';
import type { Point } from '../model/trace.ts';
import { decimate, renderTrace } from './trace.ts';

/** 塗りの濃さ。線の下を薄く塗り、重なる今の掃引の線を読めるままにする。 */
const FILL_OPACITY = 0.22;

/**
 * MAX HOLD のトレース。**線 (`data-basis="hold"`) と、その下の薄い塗り** (`data-hold-fill`)。
 * 塗りは格子の下端まで — 保持した最大の下に、掃引の間に一度でもそこまで届いたことを示す。
 */
export function renderHeld(points: readonly Point[], axes: Axes, grid: Rect, color: string): string {
  const drawn = decimate(points, axes, grid);
  const first = drawn[0];
  const last = drawn.at(-1);
  if (first === undefined || last === undefined) return '';
  const bottom = grid.y + grid.height;
  const shape = [...drawn, [last[0], bottom], [first[0], bottom]] as const;
  const fill = element('polygon', {
    points: shape.map(([x, y]) => `${num(x)},${num(y)}`).join(' '),
    fill: color,
    'fill-opacity': FILL_OPACITY,
    stroke: 'none',
    'data-hold-fill': '1',
  });
  return fill + renderTrace(points, 'hold', axes, grid, color);
}


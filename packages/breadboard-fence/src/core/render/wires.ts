import type { Point } from '../types.ts';
import { PALETTE } from './palette.ts';
import { element, num, roundedPath } from './svg.ts';

const CORNER_RADIUS = 10;
const WIRE_WIDTH = 3.4;
const END_RADIUS = 2.8;

export function renderWire(points: readonly Point[], color: string): string {
  const path = roundedPath(points, CORNER_RADIUS);
  if (!path) return '';

  const line = element('path', {
    d: path, fill: 'none', stroke: color, 'stroke-width': WIRE_WIDTH, 'stroke-linecap': 'round', opacity: 0.92,
  });
  const ends = [points[0], points[points.length - 1]]
    .map((point) =>
      point ? element('circle', { cx: num(point.x), cy: num(point.y), r: END_RADIUS, fill: PALETTE.hole }) : '',
    )
    .join('');

  return line + ends;
}

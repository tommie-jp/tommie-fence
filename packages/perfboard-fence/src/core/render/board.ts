import { element, num, svgText } from 'fence-kit';
import { rowLabel } from '../model/address.ts';
import type { Layout } from '../model/layout.ts';
import type { Board } from '../types.ts';
import type { Theme } from './theme.ts';

/** 名前を板の縁からどれだけ外へ置くか。 */
const LABEL_OFFSET = 8;

/**
 * 板と穴と、行・列の名前を描く。
 *
 * **穴は 1 つにつき 1 つの円**。ランドは同じ円の縁 (stroke) で描く。
 * 別の円を重ねると要素数が倍になり、大きい板 (120 × 120 = 14,400 穴) で
 * SVG がそのぶん重くなる。
 */
export function renderBoard(board: Board, layout: Layout, theme: Theme): string {
  const { palette, metrics } = theme;
  const { x, y, width, height } = layout.board;

  const plate = element('rect', {
    x: num(x),
    y: num(y),
    width: num(width),
    height: num(height),
    rx: 4,
    fill: palette.plate,
    stroke: palette.plateEdge,
    'stroke-width': 1,
  });

  // ランドは穴のまわりの銅箔。円の縁 (stroke) として描く。
  // **stroke は線の中心から内外へ半分ずつ乗る**ので、半径を穴の半径にすると
  // 内側へ食い込んで、見える穴がテーマの値より小さくなる。内側の縁が穴の半径、
  // 外側の縁がランドの半径に来るように、半径は 2 つの中点に置く。
  const ring = (metrics.landSize - metrics.holeSize) / 2;
  const ringRadius = (metrics.holeSize + metrics.landSize) / 4;
  const holes: string[] = [];
  for (let row = 1; row <= board.rows; row += 1) {
    for (let col = 1; col <= board.cols; col += 1) {
      holes.push(element('circle', {
        cx: num(layout.colX(col)),
        cy: num(layout.rowY(row)),
        r: num(ringRadius),
        fill: palette.hole,
        stroke: palette.land,
        'stroke-width': num(ring),
      }));
    }
  }

  const labels: string[] = [];
  for (let row = 1; row <= board.rows; row += 1) {
    labels.push(svgText(x - LABEL_OFFSET, layout.rowY(row), rowLabel(row), {
      anchor: 'end',
      fill: palette.label,
      'font-size': num(metrics.textSize),
      'dominant-baseline': 'middle',
    }));
  }
  for (let col = 1; col <= board.cols; col += 1) {
    labels.push(svgText(layout.colX(col), y - LABEL_OFFSET, String(col), {
      fill: palette.label,
      'font-size': num(metrics.textSize),
    }));
  }

  return `${plate}${holes.join('')}${labels.join('')}`;
}

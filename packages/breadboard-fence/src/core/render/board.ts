import type { Layout } from '../model/layout.ts';
import { HOLE_ROWS, RAIL_ROWS } from '../types.ts';
import type { Board, RailRow } from '../types.ts';
import { PALETTE } from './palette.ts';
import { element, num, svgText } from './svg.ts';

const HOLE_SIZE = 5.2;
const STRIPE_GAP = 10;
const LABEL_INSET = 11;

// ボードの印字。穴の粒と紛れないよう、実物のシルク印刷より大きく太くする。
const RAIL_FONT = 17;
const ROW_FONT = 13;
const COLUMN_FONT = 11.5;
const LABEL_WEIGHT = 700;

const railColor = (rail: RailRow): string => (rail.startsWith('+') ? PALETTE.positive : PALETTE.negative);

const stripeOffset = (rail: RailRow): number => (rail === '+t' || rail === '-b' ? -STRIPE_GAP : STRIPE_GAP);

/** ブレッドボード本体 (板・溝・電源レール・全部の穴・行番号) を描く。 */
export function renderBoard(board: Board, layout: Layout): string {
  const { x, y, width, height } = layout.board;
  const left = layout.colX(1);
  const right = layout.colX(board.columns);

  const parts: string[] = [
    element('rect', { x: num(x), y: num(y), width: num(width), height: num(height), rx: 7, fill: PALETTE.plate, stroke: PALETTE.plateEdge }),
    element('rect', { x: num(x), y: num(layout.ravineY - 6), width: num(width), height: 12, fill: PALETTE.ravine }),
  ];

  for (const rail of RAIL_ROWS) {
    const color = railColor(rail);
    const stripeY = layout.rowY(rail) + stripeOffset(rail);
    parts.push(
      element('line', {
        x1: num(left - 10), y1: num(stripeY), x2: num(right + 10), y2: num(stripeY),
        stroke: color, 'stroke-width': 1.6,
      }),
    );
    for (const labelX of [x + LABEL_INSET, x + width - LABEL_INSET]) {
      parts.push(
        svgText(labelX, layout.rowY(rail) + 6, rail.startsWith('+') ? '+' : '−', {
          'font-size': RAIL_FONT,
          'font-weight': LABEL_WEIGHT,
          fill: color,
        }),
      );
    }
  }

  for (const row of [...RAIL_ROWS, ...HOLE_ROWS]) {
    for (let col = 1; col <= board.columns; col += 1) {
      parts.push(
        element('rect', {
          x: num(layout.colX(col) - HOLE_SIZE / 2),
          y: num(layout.rowY(row) - HOLE_SIZE / 2),
          width: HOLE_SIZE, height: HOLE_SIZE, rx: 1, fill: PALETTE.hole,
        }),
      );
    }
  }

  for (const row of HOLE_ROWS) {
    for (const labelX of [x + LABEL_INSET, x + width - LABEL_INSET]) {
      parts.push(
        svgText(labelX, layout.rowY(row) + 4.5, row, {
          'font-size': ROW_FONT,
          'font-weight': LABEL_WEIGHT,
          fill: PALETTE.label,
        }),
      );
    }
  }

  for (let col = 1; col <= board.columns; col += 1) {
    if (col !== 1 && col % 5 !== 0) continue;
    const options = {
      'font-size': COLUMN_FONT,
      'font-weight': LABEL_WEIGHT,
      fill: PALETTE.label,
      // 配線がレーンを通るので、番号が読めるように地の色で縁取る。
      halo: PALETTE.plate,
    };
    parts.push(svgText(layout.colX(col), layout.rowY('a') - 12, String(col), options));
    parts.push(svgText(layout.colX(col), layout.rowY('j') + 17, String(col), options));
  }

  return parts.join('\n');
}

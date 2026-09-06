import type { Layout } from '../model/layout.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Board, HoleRow, RailRow, Rect } from '../types.ts';
import type { Palette, RenderTheme } from './theme.ts';
import { TEXT_HALO_WIDTH, element, num, svgText } from './svg.ts';

const STRIPE_GAP = 10;
const LABEL_INSET = 11;

// ボードの印字。穴の粒と紛れないよう、実物のシルク印刷より大きく太くする。
const RAIL_FONT = 17;
const ROW_FONT = 13;
const COLUMN_FONT = 11.5;
const LABEL_WEIGHT = 700;

const railColor = (rail: RailRow, palette: Palette): string =>
  rail.startsWith('+') ? palette.positive : palette.negative;

/** ブレッドボード本体 (板・溝・電源レール・全部の穴・行番号) を描く。 */
export function renderBoard(
  board: Board,
  layout: Layout,
  theme: RenderTheme,
  // **名札が乗る所には印字しない** (`captions.ts` が数えた帯)。板の印字は
  // 縁取りで消しきれず、字の隙間から欠けた数字が覗いて汚れて見える
  // (実機で `TH1 10k` の間に `5` の欠片が出ていた)。番号は 5 列おきに
  // 何度も出るので、1 つ伏せても数えられなくならない。
  covered: readonly Rect[] = [],
): string {
  const { palette, metrics } = theme;
  const { x, y, width, height } = layout.board;
  const left = layout.colX(1);
  const right = layout.colX(board.columns);
  const font = (size: number): string => num(size * metrics.boardTextScale);

  const parts: string[] = [
    element('rect', { x: num(x), y: num(y), width: num(width), height: num(height), rx: 7, fill: palette.plate, stroke: palette.plateEdge }),
    element('rect', { x: num(x), y: num(layout.ravineY - 6), width: num(width), height: 12, fill: palette.ravine }),
  ];

  // レールを外した板では縞も ± の印字もレールの穴も無い。
  const rails = board.rails ?? [];

  rails.forEach((rail, index) => {
    const color = railColor(rail, palette);
    // 色の線は上下のペアを挟むように、ペアの 1 本目の上・2 本目の下に引く。
    const stripeY = layout.rowY(rail) + (index % 2 === 0 ? -STRIPE_GAP : STRIPE_GAP);
    parts.push(
      element('line', {
        x1: num(left - 10), y1: num(stripeY), x2: num(right + 10), y2: num(stripeY),
        stroke: color, 'stroke-width': 1.6,
      }),
    );
    for (const labelX of [x + LABEL_INSET, x + width - LABEL_INSET]) {
      parts.push(
        svgText(labelX, layout.rowY(rail) + 6, rail.startsWith('+') ? '+' : '−', {
          'font-size': font(RAIL_FONT),
          'font-weight': LABEL_WEIGHT,
          fill: color,
        }),
      );
    }
  });

  for (const row of [...rails, ...HOLE_ROWS]) {
    for (let col = 1; col <= board.columns; col += 1) {
      parts.push(
        element('rect', {
          x: num(layout.colX(col) - metrics.holeSize / 2),
          y: num(layout.rowY(row) - metrics.holeSize / 2),
          width: num(metrics.holeSize), height: num(metrics.holeSize), rx: 1, fill: palette.hole,
          // 暗い板では塗りだけでは穴が読めないので、明るい縁で立たせる。
          stroke: palette.holeEdge ?? undefined,
        }),
      );
    }
  }

  const letter = (row: HoleRow): string => (board.letters === 'upper' ? row.toUpperCase() : row);
  for (const row of HOLE_ROWS) {
    for (const labelX of [x + LABEL_INSET, x + width - LABEL_INSET]) {
      parts.push(
        svgText(labelX, layout.rowY(row) + 4.5, letter(row), {
          'font-size': font(ROW_FONT),
          'font-weight': LABEL_WEIGHT,
          fill: palette.label,
        }),
      );
    }
  }

  for (let col = 1; col <= board.columns; col += 1) {
    if (board.numbers === 'every-5' && col !== 1 && col % 5 !== 0) continue;
    const options = {
      'font-size': font(COLUMN_FONT),
      'font-weight': LABEL_WEIGHT,
      fill: palette.label,
      // 配線がレーンを通るので、番号が読めるように地の色で縁取る。
      halo: palette.plate,
      haloWidth: TEXT_HALO_WIDTH * metrics.boardTextScale,
    };
    const width = String(col).length * COLUMN_FONT * metrics.boardTextScale * 0.6;
    for (const y of [layout.rowY('a') - 12, layout.rowY('j') + 17]) {
      const spot = { x: layout.colX(col) - width / 2, y: y - COLUMN_FONT * metrics.boardTextScale, width, height: COLUMN_FONT * metrics.boardTextScale * 1.2 };
      if (covered.some((band) => hides(band, spot))) continue;
      parts.push(svgText(layout.colX(col), y, String(col), options));
    }
  }

  return parts.join('\n');
}

/** 2 つの矩形が重なっているか (板の印字を伏せるかどうかの判定)。 */
const hides = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
  && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;

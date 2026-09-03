import { element, num, svgText } from 'fence-kit';
import { slotEdges } from '../model/board.ts';
import { axisLabel } from './labels.ts';
import type { Layout } from '../model/layout.ts';
import type { Board } from '../types.ts';
import type { ResolvedLabels, Theme } from './theme.ts';

/** 名前の付け方を書かなかったとき (図を組まずに板だけ描くとき) の既定。 */
const DEFAULT_LABELS: ResolvedLabels = {
  row: 'alpha', col: 'numeric', case: 'upper', sides: ['left', 'top'],
};

/** 名前を板の縁からどれだけ外へ置くか。 */
const LABEL_OFFSET = 8;

/**
 * 板と穴と、行・列の名前を描く。
 *
 * **穴は 1 つにつき 1 つの円**。ランドは同じ円の縁 (stroke) で描く。
 * 別の円を重ねると要素数が倍になり、大きい板 (120 × 120 = 14,400 穴) で
 * SVG がそのぶん重くなる。
 */
export function renderBoard(
  board: Board,
  layout: Layout,
  theme: Theme,
  labels: ResolvedLabels = DEFAULT_LABELS,
): string {
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

  // **名前は書かれた辺にだけ出す。** 既定は左と上だけで、4 辺に出すと
  // 小さい板では名前のほうが板より目立つ。
  const drawn: string[] = [];
  const rowLabelAt = (at: number, row: number): string =>
    svgText(at, layout.rowY(row), axisLabel(row, labels.row, labels.case), {
      // **縦に並ぶ名前は中央に寄せる。** 右端で揃えると、桁の違う名前 (`9` と `10`、
      // `Z` と `AA`) が左へはみ出して、列の名前と揃わない。
      anchor: 'middle',
      fill: palette.label,
      'font-size': num(metrics.textSize),
      'dominant-baseline': 'middle',
    });
  const colLabelAt = (at: number, col: number): string =>
    svgText(layout.colX(col), at, axisLabel(col, labels.col, labels.case), {
      fill: palette.label,
      'font-size': num(metrics.textSize),
    });

  // **スロットの銅箔にも番号を出す。** 配線の端は銅箔にも付けられるので、
  // `slots: c0 -- c1` と書くには番号が要る。銅箔は穴の並びの外側 1 本
  // (`0` と `最後 + 1`) にあり、`isSlot` と同じ数え方 (実機で指摘された)。
  const edges = slotEdges(board);
  const rowFrom = edges === 'ends' ? 0 : 1;
  const rowTo = edges === 'ends' ? board.rows + 1 : board.rows;
  const colFrom = edges === 'sides' ? 0 : 1;
  const colTo = edges === 'sides' ? board.cols + 1 : board.cols;

  for (let row = rowFrom; row <= rowTo; row += 1) {
    if (labels.sides.includes('left')) drawn.push(rowLabelAt(x - LABEL_OFFSET, row));
    if (labels.sides.includes('right')) drawn.push(rowLabelAt(x + width + LABEL_OFFSET, row));
  }
  for (let col = colFrom; col <= colTo; col += 1) {
    if (labels.sides.includes('top')) drawn.push(colLabelAt(y - LABEL_OFFSET, col));
    // 下の名前はベースラインが板から離れる向きに来るので、字の高さぶん下げる。
    if (labels.sides.includes('bottom')) {
      drawn.push(colLabelAt(y + height + LABEL_OFFSET + metrics.textSize * 0.8, col));
    }
  }

  return `${plate}${holes.join('')}${drawn.join('')}`;
}

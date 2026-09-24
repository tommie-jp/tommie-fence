import { fenceError, notice } from '../errors.ts';
import { formatPoint } from '../model/point.ts';
import type { Board, CopperSpec, FenceError, Mm, RectMm } from '../types.ts';

/**
 * 銅の形を**矩形の集まり**にする。触れ合い (ネット)・切れ目・描画・当たりが
 * 全部この矩形を読む — 1 か所で作るので、図と導通が食い違わない
 * (perfboard の Phase 5「胴の形を 1 か所にした」と同じ約束)。
 *
 * **線路は縦横の区間だけ。** 斜めを入れると矩形の重なりで済まなくなり、
 * 要る題 (本の「銅」31 題) に斜めは無い (52 の docs/74)。
 */

/** 向き。線路の区間は x (横) か y (縦)。島と via は向きを持たない。 */
export type Axis = 'x' | 'y';

/** 矩形 1 つ。線路の区間なら向きと、表が地の板で両脇に切る溝の幅を持つ。 */
export type Piece = {
  readonly rect: RectMm;
  readonly axis: Axis | null;
  /** 島のまわりの溝 (mm)。表が地の板でだけ描く。 */
  readonly gap: number;
};

/** 銅の形 1 つ。**名前はネットの名前にもなる**。 */
export type Shape = {
  readonly id: string;
  readonly kind: 'line' | 'pad' | 'via';
  readonly pieces: readonly Piece[];
  readonly line: number | null;
};

/** 触れているとみなす距離 (mm)。座標は 0.01mm に丸めてあるので、その半分。 */
export const TOUCH = 0.005;

/** via の銅 (ランド) は穴の径にこれを足す (両側 0.4mm の輪)。 */
export const VIA_RING = 0.8;

/** 区間の矩形。**折れ目 (内側の点) では幅の半分だけ延ばす** — 角が欠けないように。 */
function segmentRect(a: Mm, b: Mm, width: number, extendStart: boolean, extendEnd: boolean): { rect: RectMm; axis: Axis } | null {
  const half = width / 2;
  if (a.y === b.y) {
    const forward = b.x > a.x;
    const x0 = (forward ? a.x : b.x) - ((forward ? extendStart : extendEnd) ? half : 0);
    const x1 = (forward ? b.x : a.x) + ((forward ? extendEnd : extendStart) ? half : 0);
    return { rect: { x: x0, y: a.y - half, width: x1 - x0, height: width }, axis: 'x' };
  }
  if (a.x === b.x) {
    const forward = b.y > a.y;
    const y0 = (forward ? a.y : b.y) - ((forward ? extendStart : extendEnd) ? half : 0);
    const y1 = (forward ? b.y : a.y) + ((forward ? extendEnd : extendStart) ? half : 0);
    return { rect: { x: a.x - half, y: y0, width, height: y1 - y0 }, axis: 'y' };
  }
  return null;
}

export const centred = (at: Mm, width: number, height: number): RectMm =>
  ({ x: at.x - width / 2, y: at.y - height / 2, width, height });

/** 矩形が板からはみ出しているか (縁は含む)。 */
const outside = (board: Board, rect: RectMm): boolean =>
  rect.x < -TOUCH || rect.y < -TOUCH
  || rect.x + rect.width > board.width + TOUCH || rect.y + rect.height > board.height + TOUCH;

export type ShapesResult = {
  readonly shapes: readonly Shape[];
  /** 地の切り欠き (銅ではない)。 */
  readonly slots: readonly { readonly id: string; readonly rect: RectMm; readonly line: number | null }[];
  readonly errors: readonly FenceError[];
};

export function shapesOf(copper: readonly CopperSpec[], board: Board): ShapesResult {
  const shapes: Shape[] = [];
  const slots: { id: string; rect: RectMm; line: number | null }[] = [];
  const errors: FenceError[] = [];

  for (const spec of copper) {
    if (spec.kind === 'slot') {
      const rect = centred(spec.at, spec.width, spec.height);
      if (outside(board, rect)) errors.push(fenceError(`${spec.id} が板からはみ出しています`, spec.line, spec.id));
      slots.push({ id: spec.id, rect, line: spec.line });
      continue;
    }
    const pieces: Piece[] = [];
    if (spec.kind === 'line') {
      const gap = spec.gap ?? board.cut;
      const last = spec.points.length - 1;
      for (let index = 0; index < last; index += 1) {
        const [a, b] = [spec.points[index], spec.points[index + 1]];
        if (a === undefined || b === undefined) continue;
        const made = segmentRect(a, b, spec.width, index > 0, index + 1 < last);
        if (made === null) {
          // **斜めは断って、残りの区間は描く** (1 区間のために線路ごと消さない)。
          errors.push(fenceError(
            `${spec.id} の ${formatPoint(a)} → ${formatPoint(b)} が斜めです (縦横の区間に折って書きます)`,
            spec.line,
            formatPoint(b),
          ));
          continue;
        }
        pieces.push({ rect: made.rect, axis: made.axis, gap });
      }
    } else if (spec.kind === 'pad') {
      pieces.push({ rect: centred(spec.at, spec.width, spec.height), axis: null, gap: board.cut });
    } else {
      const size = spec.drill + VIA_RING;
      pieces.push({ rect: centred(spec.at, size, size), axis: null, gap: board.cut });
    }
    if (pieces.some((piece) => outside(board, piece.rect))) {
      errors.push(fenceError(`${spec.id} が板からはみ出しています`, spec.line, spec.id));
    }
    if (spec.kind === 'via' && board.ground !== 'back' && board.ground !== 'both') {
      errors.push(notice(`${spec.id}: 裏に地が無い板なので、via はどこへもつながりません (board の ground)`, spec.line, spec.id));
    }
    shapes.push({ id: spec.id, kind: spec.kind, pieces, line: spec.line });
  }
  return { shapes, slots, errors };
}

/** 矩形どうしが触れているか (辺が接していれば触れている)。 */
export const rectsTouch = (a: RectMm, b: RectMm): boolean =>
  a.x <= b.x + b.width + TOUCH && b.x <= a.x + a.width + TOUCH
  && a.y <= b.y + b.height + TOUCH && b.y <= a.y + a.height + TOUCH;

/** 点が矩形の中か (縁を含む)。 */
export const contains = (rect: RectMm, point: Mm, margin = TOUCH): boolean =>
  point.x >= rect.x - margin && point.x <= rect.x + rect.width + margin
  && point.y >= rect.y - margin && point.y <= rect.y + rect.height + margin;

/** 矩形を四方に広げる。 */
export const grow = (rect: RectMm, by: number): RectMm =>
  ({ x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 });

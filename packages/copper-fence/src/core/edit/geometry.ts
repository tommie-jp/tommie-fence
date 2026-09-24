import { edgeLength } from '../model/board.ts';
import { round2 } from '../model/point.ts';
import { SMA } from '../parts/footprint.ts';
import type { Board, Mm, Side } from '../types.ts';

/**
 * 線路の点を**縦横の折れ線**に直す。斜めになった区間には折れ目を足す
 * (横に進んでから縦へ。同じ点が続けば 1 つに畳む)。線路の端をマップで動かすと
 * 斜めになりがちで、そのまま書くと「斜めの区間は描けません」になるため。
 */
export function straighten(points: readonly Mm[]): readonly Mm[] {
  const out: Mm[] = [];
  for (const point of points) {
    const last = out.at(-1);
    if (last !== undefined && last.x === point.x && last.y === point.y) continue;
    if (last !== undefined && last.x !== point.x && last.y !== point.y) out.push({ x: point.x, y: last.y });
    out.push(point);
  }
  return out;
}

/** 点に一番近い辺と、その辺に沿った位置 (SMA の胴が角にかからない所まで寄せる)。 */
export function nearestEdge(board: Board, point: Mm): { readonly side: Side; readonly offset: number } {
  const distances: readonly (readonly [Side, number])[] = [
    ['left', point.x], ['right', board.width - point.x], ['top', point.y], ['bottom', board.height - point.y],
  ];
  const [side] = [...distances].sort((a, b) => a[1] - b[1])[0] ?? ['left', 0];
  const along = side === 'left' || side === 'right' ? point.y : point.x;
  const half = SMA.size / 2;
  const offset = Math.min(Math.max(along, half), edgeLength(board, side) - half);
  return { side, offset: round2(offset) };
}

/** 点を中心のまわりに時計回りに 90 度ずつ回す。 */
export function turnAround(point: Mm, center: Mm, quarters: number): Mm {
  const turns = ((quarters % 4) + 4) % 4;
  let [x, y] = [point.x - center.x, point.y - center.y];
  for (let i = 0; i < turns; i += 1) [x, y] = [-y, x];
  return { x: round2(center.x + x), y: round2(center.y + y) };
}

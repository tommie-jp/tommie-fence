import { textWidth } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { edgeMountOf } from '../placement/geometry.ts';
import { isEdgeMount } from '../parts/types.ts';
import type { PlacedPart, Point } from '../types.ts';
import type { ResolvedLabels } from './theme.ts';

/** 行の名前を、胴の先端からどれだけ離して置くか (基板の縁から離す距離と同じ)。 */
export const LABEL_OFFSET = 8;

/** 行ごとの、名前を置き直す横の位置。左の名前と右の名前を別に持つ。 */
export type RowLabelShifts = {
  readonly left: ReadonlyMap<number, number>;
  readonly right: ReadonlyMap<number, number>;
};

export const NO_SHIFTS: RowLabelShifts = { left: new Map(), right: new Map() };

/**
 * 基板の左右の縁に載せた端面の SMA が覆う行の名前を、**胴の先端より外**へ出す。
 *
 * 名前は縁取りして部品より上に描いているが、金物の胴と凹の腕 (`h0` `j0`) が
 * 名前の位置にちょうど重なり、`H` `I` `J` が読めなかった (教科書の治具の図)。
 * 覆う行だけを動かし、ほかの行は動かさない — 名前の列が乱れるのは覆われた
 * 数行だけで、どの行の名前かは高さで読める。
 */
export function rowLabelShifts(
  parts: readonly PlacedPart[],
  layout: Layout,
  labels: ResolvedLabels,
  textSize: number,
  rows: { readonly from: number; readonly to: number },
): RowLabelShifts {
  const left = new Map<number, number>();
  const right = new Map<number, number>();
  for (const part of parts) {
    if (!isEdgeMount(part.type, part.variant)) continue;
    const mount = edgeMountOf(part, layout);
    if (mount === null) continue;
    const { rect } = mount;
    const ux = Math.cos(rect.angle);
    // 横向き (左右の縁) だけ。上下の縁は列の名前の話。
    if (Math.abs(ux) < 0.9) continue;
    const toLeft = ux > 0;
    if (!labels.sides.includes(toLeft ? 'left' : 'right')) continue;
    const tipX = rect.cx - ux * rect.width / 2;
    const reach = Math.max(rect.height / 2, ...mount.tips.map(Math.abs)) + textSize / 2;
    for (let row = rows.from; row <= rows.to; row += 1) {
      if (Math.abs(layout.rowY(row) - rect.cy) >= reach) continue;
      const half = (textWidth('W') * textSize) / 2;
      if (toLeft) {
        const at = tipX - LABEL_OFFSET - half;
        left.set(row, Math.min(left.get(row) ?? at, at));
      } else {
        const at = tipX + LABEL_OFFSET + half;
        right.set(row, Math.max(right.get(row) ?? at, at));
      }
    }
  }
  return { left, right };
}

/** 置き直した名前の端 (画布の広さを決めるのに使う)。 */
export const shiftedLabelPoints = (shifts: RowLabelShifts, layout: Layout, textSize: number): Point[] => {
  const half = (textWidth('W') * textSize) / 2;
  return [
    ...[...shifts.left].map(([row, x]) => ({ x: x - half, y: layout.rowY(row) })),
    ...[...shifts.right].map(([row, x]) => ({ x: x + half, y: layout.rowY(row) })),
  ];
};

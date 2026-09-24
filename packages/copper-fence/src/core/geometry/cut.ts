import type { Mm, RectMm } from '../types.ts';
import { TOUCH, contains } from './shapes.ts';
import type { Axis, Shape } from './shapes.ts';

/**
 * **チップの下の線路を切る。** 直列に入れるチップは、実物も線路をカッターで
 * 切ってそこへ半田付けする。切れ目を別に書かせない — 部品の位置と切れ目が
 * 食い違う図を作れないように、**部品が切れ目を作る** (52 の docs/73 §4)。
 *
 * 切るのは**チップの向きと同じ向きの区間**だけ。横の線路に縦に置いたチップ
 * (`r90`) は線路を切らない — 線路から地へ落とすシャントの置き方になる。
 */

export type ChipCut = {
  /** 切ったチップの名前。 */
  readonly part: string;
  readonly at: Mm;
  readonly axis: Axis;
  /** 切った隙間 (mm)。 */
  readonly gap: number;
  /** 切った線路の名前。 */
  readonly shape: string;
  /** 切った区間の幅 (mm)。描くとき溝の形に使う。 */
  readonly width: number;
};

export type ChipToCut = {
  readonly part: string;
  readonly at: Mm;
  /** 書かれた向き。null なら乗った区間の向き。 */
  readonly axis: Axis | null;
  readonly gap: number;
};

export type CutResult = {
  readonly shapes: readonly Shape[];
  readonly cuts: readonly ChipCut[];
  /** チップごとの向き (乗った区間の向き、無ければ書かれた向き、それも無ければ横)。 */
  readonly axes: ReadonlyMap<string, Axis>;
};

/** 区間を中心の点で割る。割った残りが無い側は落とす。 */
function split(rect: RectMm, axis: Axis, at: Mm, gap: number): RectMm[] {
  const half = gap / 2;
  if (axis === 'x') {
    const left = { ...rect, width: at.x - half - rect.x };
    const right = { ...rect, x: at.x + half, width: rect.x + rect.width - (at.x + half) };
    return [left, right].filter((one) => one.width > TOUCH);
  }
  const top = { ...rect, height: at.y - half - rect.y };
  const bottom = { ...rect, y: at.y + half, height: rect.y + rect.height - (at.y + half) };
  return [top, bottom].filter((one) => one.height > TOUCH);
}

export function cutUnderChips(shapes: readonly Shape[], chips: readonly ChipToCut[]): CutResult {
  let current = shapes.map((shape) => ({ ...shape, pieces: [...shape.pieces] }));
  const cuts: ChipCut[] = [];
  const axes = new Map<string, Axis>();

  for (const chip of chips) {
    let done = false;
    for (const shape of current) {
      if (done || shape.kind !== 'line') continue;
      const index = shape.pieces.findIndex((piece) =>
        piece.axis !== null && (chip.axis === null || piece.axis === chip.axis) && contains(piece.rect, chip.at));
      const piece = shape.pieces[index];
      if (piece === undefined || piece.axis === null) continue;
      const parts = split(piece.rect, piece.axis, chip.at, chip.gap);
      const pieces = [
        ...shape.pieces.slice(0, index),
        ...parts.map((rect) => ({ ...piece, rect })),
        ...shape.pieces.slice(index + 1),
      ];
      current = current.map((one) => (one === shape ? { ...shape, pieces } : one));
      cuts.push({
        part: chip.part, at: chip.at, axis: piece.axis, gap: chip.gap, shape: shape.id,
        width: piece.axis === 'x' ? piece.rect.height : piece.rect.width,
      });
      axes.set(chip.part, piece.axis);
      done = true;
    }
    if (!done) axes.set(chip.part, chip.axis ?? 'x');
  }
  return { shapes: current, cuts, axes };
}

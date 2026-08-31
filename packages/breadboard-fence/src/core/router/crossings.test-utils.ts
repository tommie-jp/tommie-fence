import type { Point } from '../types.ts';

/**
 * 配線どうしの交差を数える物差し。**図を描くのには使わない**ので、
 * 出荷する core からは外してある。「どれだけ減ったか」を測るためのもので、
 * 読むのはテストだけ。
 */
const AXIS_TOLERANCE = 0.01;
const isVertical = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < AXIS_TOLERANCE;
const isHorizontal = (a: Point, b: Point): boolean => Math.abs(a.y - b.y) < AXIS_TOLERANCE;

const key = (x: number, y: number): string => `${Math.round(x * 100)},${Math.round(y * 100)}`;

const terminals = (path: readonly Point[]): string[] => {
  const first = path[0];
  const last = path[path.length - 1];
  return first && last ? [key(first.x, first.y), key(last.x, last.y)] : [];
};

/**
 * 2 本の配線が交わる回数。**同じ穴で出会うぶんは数えない**:
 * 同じ穴につながる 2 本が根元で重なるのは交差ではなく分岐で、
 * ここを数えると避けようのないものを避けようとしてしまう。
 *
 * 見逃すのは**両方の端点が揃っている**ところだけ。片方の端点にすぎない点は、
 * もう片方にとってはただの通り道なので数える (穴の上を素通りしている)。
 */
export function crossings(first: readonly Point[], second: readonly Point[]): number {
  const shared = new Set(terminals(first).filter((point) => terminals(second).includes(point)));
  let count = 0;

  for (let i = 1; i < first.length; i += 1) {
    for (let j = 1; j < second.length; j += 1) {
      const at = crossingPoint(first[i - 1]!, first[i]!, second[j - 1]!, second[j]!);
      if (at && !shared.has(key(at.x, at.y))) count += 1;
    }
  }

  return count;
}

/** 図の中の配線ぜんぶを見て、交わっている箇所の総数を返す。 */
export function countCrossings(paths: readonly (readonly Point[])[]): number {
  let total = 0;
  for (let i = 0; i < paths.length; i += 1) {
    for (let j = i + 1; j < paths.length; j += 1) {
      total += crossings(paths[i]!, paths[j]!);
    }
  }
  return total;
}

/**
 * 縦の線分と横の線分が交わる点。**T 字に突き当たっただけのものも数える**
 * (図の上では線が線を切って見えるため)。同じ向きどうしは、重なっていても
 * 交差とは呼ばない (並走はスロットで分けるほうの問題)。
 */
function crossingPoint(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const pair = isVertical(a1, a2) && isHorizontal(b1, b2)
    ? { vertical: [a1, a2] as const, horizontal: [b1, b2] as const }
    : isHorizontal(a1, a2) && isVertical(b1, b2)
      ? { vertical: [b1, b2] as const, horizontal: [a1, a2] as const }
      : null;
  if (!pair) return null;

  const [v1, v2] = pair.vertical;
  const [h1, h2] = pair.horizontal;
  const within = (value: number, a: number, b: number): boolean =>
    value >= Math.min(a, b) - AXIS_TOLERANCE && value <= Math.max(a, b) + AXIS_TOLERANCE;

  return within(h1.y, v1.y, v2.y) && within(v1.x, h1.x, h2.x) ? { x: v1.x, y: h1.y } : null;
}

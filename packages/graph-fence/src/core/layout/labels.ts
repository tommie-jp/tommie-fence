import type { Rect } from './page.ts';

/**
 * 点の名札の置き場。**点の周りの 8 方向を決まった順に試し、最初に空いている所へ置く**
 * (上 → 右上 → 右 → 右下 → 下 → 左下 → 左 → 左上。近い輪で空きが無ければ、少し離した輪で同じ順に)。空いている = 枠の内に収まり、
 * 先に置いた名札・ほかの名札つきの点・線のどれにも掛からない。
 *
 * どこも空いていなければ**上に置いて枠の内へ寄せ、`clash` で言う** — 名札は図の中身なので
 * 省かない (mark の字は読み値の表に同じ値があるので省くが、名札は図にしか無い)。
 * 入力だけで決まる純粋な関数 (同じ図は何度描いても同じ)。座標は SVG の px。
 */

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Pixel = { readonly x: number; readonly y: number };

/** 置きたい名札: 点の位置と、字の大きさ。 */
export type LabelRequest = Pixel & { readonly width: number; readonly height: number };

export type PlacedLabel = { readonly box: Box; readonly clash: boolean };

/**
 * 点の印と名札の間。**近い輪から順に試す** — 枠の隅の点や、線が斜めに抜ける点では、
 * すぐ隣は線に掛かるが、少し離せば線の下 (上) に収まる。
 */
const GAPS = [5, 13, 21, 29, 37] as const;
/** 名札つきの点の周りに空けておく半径 (印の ● に字を掛けない)。 */
const DOT_CLEARANCE = 4;

const candidates = ({ x, y, width, height }: LabelRequest, gap: number): readonly Box[] => [
  { x: x - width / 2, y: y - gap - height },
  { x: x + gap, y: y - gap - height },
  { x: x + gap + 2, y: y - height / 2 },
  { x: x + gap, y: y + gap },
  { x: x - width / 2, y: y + gap },
  { x: x - gap - width, y: y + gap },
  { x: x - gap - 2 - width, y: y - height / 2 },
  { x: x - gap - width, y: y - gap - height },
].map((corner) => ({ ...corner, width, height }));

const within = (box: Box, rect: Rect): boolean =>
  box.x >= rect.x && box.y >= rect.y && box.x + box.width <= rect.x + rect.width && box.y + box.height <= rect.y + rect.height;

const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 線分が箱に掛かるか (Liang–Barsky で箱の内に残る区間があるかを見る)。 */
export function segmentCrossesBox(from: Pixel, to: Pixel, box: Box): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let enter = 0;
  let leave = 1;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, from.x - box.x], [dx, box.x + box.width - from.x], [-dy, from.y - box.y], [dy, box.y + box.height - from.y],
  ];
  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }
    const t = distance / direction;
    if (direction < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return true;
}

/** 線に掛かるかを見るときに箱を縮める幅。字の箱の縁は余白なので、線が角をかすめるだけなら掛かったと数えない。 */
const LINE_INSET = 2;

const crossesAny = (box: Box, lines: readonly (readonly Pixel[])[]): boolean => lines.some((line) => {
  const inner = { x: box.x + LINE_INSET, y: box.y + LINE_INSET, width: box.width - LINE_INSET * 2, height: box.height - LINE_INSET * 2 };
  for (let index = 1; index < line.length; index += 1) {
    if (segmentCrossesBox(line[index - 1] as Pixel, line[index] as Pixel, inner)) return true;
  }
  return false;
});

const clampInto = (box: Box, rect: Rect): Box => ({
  ...box,
  x: Math.max(rect.x, Math.min(box.x, rect.x + rect.width - box.width)),
  y: Math.max(rect.y, Math.min(box.y, rect.y + rect.height - box.height)),
});

/** `wanted` の順に置く (書いた順が優先)。`lines` は避ける線 (px の折れ線)。 */
export function placeLabels(wanted: readonly LabelRequest[], rect: Rect, lines: readonly (readonly Pixel[])[]): readonly PlacedLabel[] {
  const dots: readonly Box[] = wanted.map((one) => ({
    x: one.x - DOT_CLEARANCE, y: one.y - DOT_CLEARANCE, width: DOT_CLEARANCE * 2, height: DOT_CLEARANCE * 2,
  }));
  const taken: Box[] = [];
  return wanted.map((one) => {
    // 枠の縁の点では、候補を枠の内へ寄せてから確かめる (寄せた先が点や線に掛かれば採らない)。
    const options = GAPS.flatMap((gap) => candidates(one, gap)).map((box) => clampInto(box, rect));
    const free = options.find((box) => within(box, rect)
      && !taken.some((other) => boxesOverlap(box, other))
      && !dots.some((dot) => boxesOverlap(box, dot))
      && !crossesAny(box, lines));
    const box = free ?? (options[0] as Box);
    taken.push(box);
    return { box, clash: free === undefined };
  });
}

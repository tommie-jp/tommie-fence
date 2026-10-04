import { textWidth } from 'fence-kit';
import type { Rect } from '../types.ts';
import type { Theme } from './theme.ts';

/**
 * 名札の置き場所を配る。**呼んだ順に決まる** — 先に置いたものは動かず、
 * ぶつかったほうが 1 行ずつ下がる。
 *
 * 名札は胴の下と決まっているが (実機で「すべての部品名は部品の下側に表示する」)、
 * 隣り合う行に部品を置くと**上の部品の名札と下の部品の名札が同じ高さに並ぶ**。
 * 板に書いた注釈も先に場所を取る — 番地で置き場所を指定したほうが強い。
 */
export type CaptionRoom = {
  /** その基準線に置いたときの、下げる距離 (px)。置いた帯は取られたものとして覚える。 */
  readonly drop: (x: number, baseline: number, width: number) => number;
  /**
   * 横書きの名札の基準線を選ぶ。**既定は胴の下** (`below`)。そこが線・ほかの胴・
   * ほかの名札と重ならなければ動かさない (既存の図を変えない)。重なれば胴の上
   * (`above`) と 1 行・2 行下げた位置を試し、どこも塞がっていれば今までどおり
   * 名札だけを避けて下げる。`owner` の胴は避けない (自分の胴の脇に置くので)。
   */
  readonly place: (x: number, below: number, above: number, width: number, owner: string) => number;
  /**
   * 縦書き (90 度回した) の名札の置き場所を候補から選ぶ。先頭が既定。
   * どれも塞がっていれば先頭。選んだ帯は取られたものとして覚える。
   */
  readonly pick: (candidates: readonly Rect[], owner: string) => number;
  /** その帯に線・ほかの胴が掛かるか (名札どうしは見ない)。 */
  readonly blocked: (box: Rect, owner: string) => boolean;
};

/**
 * 名札が避ける形。**太さのある線分**で表す — 配線は線そのもの、胴は
 * 長い軸に沿った線分と、その半分の厚み。`owner` は胴の持ち主 (配線は null)。
 */
export type Obstacle = {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly half: number;
  readonly owner: string | null;
};

/** 逃がす段の高さ (字の大きさに対する比)。1 行ぶん。 */
const LINE = 1.15;

/** 下げる上限。これ以上下げると、どの部品の名前か分からなくなる。 */
const LIMIT = 2;

/** 字が基準線から上へ出る高さと、下へ出る深さ。 */
const CAP = 0.72;
const DESCENT = 0.2;

export function captionRoom(
  theme: Theme,
  taken: readonly Rect[] = [],
  obstacles: readonly Obstacle[] = [],
  bounds: Rect | null = null,
): CaptionRoom {
  const placed: Rect[] = [...taken];
  const step = theme.metrics.textSize * LINE;
  const labelFree = (box: Rect): boolean => !placed.some((one) => overlaps(one, box));
  const shapeFree = (box: Rect, owner: string): boolean =>
    !obstacles.some((one) => one.owner !== owner && segmentHits(one, box));
  const inside = (box: Rect): boolean => bounds === null
    || (box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height);
  const free = (box: Rect, owner: string): boolean => labelFree(box) && shapeFree(box, owner) && inside(box);
  return {
    place(x, below, above, width, owner) {
      const at = (baseline: number): Rect => bandAt(x, baseline, width, theme);
      const drops = [below, below + step, below + LIMIT * step];
      const first = at(below);
      // **線や胴に当たったときだけ上を先に試す** — 線は下に続いていることが多く、
      // 下げても同じ線に当たる。名札どうしなら今までどおり下げるのが先。
      const order = !shapeFree(first, owner)
        ? [below, above, ...drops.slice(1)]
        : [...drops, above];
      const chosen = order.find((baseline) => free(at(baseline), owner))
        ?? drops.find((baseline) => labelFree(at(baseline)))
        ?? below + LIMIT * step;
      placed.push(at(chosen));
      return chosen;
    },
    blocked: (box, owner) => !shapeFree(box, owner),
    pick(candidates, owner) {
      const index = Math.max(0, candidates.findIndex((box) => free(box, owner)));
      const chosen = candidates[index];
      if (chosen !== undefined) placed.push(chosen);
      return index;
    },
    drop(x, baseline, width) {
      let drop = 0;
      let box = bandAt(x, baseline, width, theme);
      while (drop < LIMIT && placed.some((one) => overlaps(one, box))) {
        drop += 1;
        box = bandAt(x, baseline + drop * step, width, theme);
      }
      placed.push(box);
      return drop * step;
    },
  };
}

/** 中央揃えで置いた字 1 行が占める帯。 */
export const bandAt = (x: number, baseline: number, width: number, theme: Theme): Rect => ({
  x: x - width / 2,
  y: baseline - theme.metrics.textSize * CAP,
  width,
  height: theme.metrics.textSize * (CAP + DESCENT),
});

/** その字が図の上で占める幅。**書く側と同じ見積もり** (`fence-kit` の textWidth)。 */
export const captionWidth = (text: string, theme: Theme): number =>
  textWidth(text) * theme.metrics.textSize;

const overlaps = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
  && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;

/**
 * 太さのある線分が矩形に掛かるか。矩形を線の太さの半分だけ広げ、
 * 線分をその矩形で切り取れるかを見る (Liang–Barsky)。
 */
export function segmentHits(line: Obstacle, box: Rect): boolean {
  const left = box.x - line.half;
  const right = box.x + box.width + line.half;
  const top = box.y - line.half;
  const bottom = box.y + box.height + line.half;
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  let enter = 0;
  let leave = 1;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, line.from.x - left], [dx, right - line.from.x],
    [-dy, line.from.y - top], [dy, bottom - line.from.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter >= leave) return false;
  }
  return true;
}

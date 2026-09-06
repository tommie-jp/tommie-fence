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
};

/** 逃がす段の高さ (字の大きさに対する比)。1 行ぶん。 */
const LINE = 1.15;

/** 下げる上限。これ以上下げると、どの部品の名前か分からなくなる。 */
const LIMIT = 2;

/** 字が基準線から上へ出る高さと、下へ出る深さ。 */
const CAP = 0.72;
const DESCENT = 0.2;

export function captionRoom(theme: Theme, taken: readonly Rect[] = []): CaptionRoom {
  const placed: Rect[] = [...taken];
  const step = theme.metrics.textSize * LINE;
  return {
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

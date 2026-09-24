import { textWidth } from 'fence-kit';
import type { Rect } from '../types.ts';

/**
 * 字の置き場。**先に置いた字と部品の胴を避けて、候補の中から選ぶ**。
 *
 * 銅張り基板の図は線路・名札・隙間の字が狭い所に集まる (MMIC の足の手前の細い線路、
 * ヘアピンの並んだ腕)。決め打ちの場所に置くと字が字に重なって読めない。
 * **どの候補も塞がっていれば最初の候補に置く** — 黙って消すと、書いたはずの
 * 線路の Z0 が図から無くなる。
 */
export type Anchor = 'start' | 'middle' | 'end';

export type Candidate = {
  readonly x: number;
  /** ベースライン。 */
  readonly y: number;
  readonly anchor: Anchor;
};

/** 字の外接矩形 (ベースラインから上へ 0.8、下へ 0.25)。 */
export function textBox(candidate: Candidate, text: string, size: number): Rect {
  const width = textWidth(text) * size;
  const x = candidate.anchor === 'start' ? candidate.x : candidate.anchor === 'middle' ? candidate.x - width / 2 : candidate.x - width;
  return { x, y: candidate.y - size * 0.8, width, height: size * 1.05 };
}

const PAD = 1;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width + PAD && b.x < a.x + a.width + PAD && a.y < b.y + b.height + PAD && b.y < a.y + a.height + PAD;

const inside = (box: Rect, area: Rect): boolean =>
  box.x >= area.x - PAD && box.y >= area.y - PAD
  && box.x + box.width <= area.x + area.width + PAD && box.y + box.height <= area.y + area.height + PAD;

export type Placer = {
  /** 置けない所として控える (部品の胴)。 */
  readonly block: (box: Rect) => void;
  /** 候補から置き場を選んで控える。`area` の外の候補は選ばない。 */
  readonly choose: (candidates: readonly Candidate[], text: string, size: number, area: Rect | null) => Candidate | null;
};

export function createPlacer(): Placer {
  const taken: Rect[] = [];
  return {
    block: (box) => {
      taken.push(box);
    },
    choose: (candidates, text, size, area) => {
      const first = candidates[0];
      if (first === undefined) return null;
      const found = candidates.find((candidate) => {
        const box = textBox(candidate, text, size);
        return (area === null || inside(box, area)) && !taken.some((other) => overlaps(box, other));
      }) ?? first;
      taken.push(textBox(found, text, size));
      return found;
    },
  };
}

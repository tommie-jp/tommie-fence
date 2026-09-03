import { footprintOf } from './footprint.ts';

/**
 * 部品の向き。**アンカー 1 つで置く形** (DIP / SIP) にだけ書ける。
 *
 * 足を並べて書く部品 (2 本足・3 本足) の向きは**穴の順そのもの**なので、
 * 語では書かない — 同じことを 2 通りで書けるようにすると、食い違ったときに
 * どちらが本当か決められなくなる (52 の docs/14)。
 *
 * **語彙と意味は circuit-fence と揃える。** 回転は**時計回り**、
 * 意味は**反転してから回す**。3 つのフェンスを同じノートで書く人が、
 * 覚え直さなくてよいようにするため。
 */

export type Turn = { readonly rotate: 0 | 90 | 180 | 270; readonly mirror: boolean };

export const NO_TURN: Turn = { rotate: 0, mirror: false };

export const isTurned = (turn: Turn): boolean => turn.rotate !== 0 || turn.mirror;

/** 回転の語 → **時計回り**の角度。`r0` は書かない (向きを書かないのと同じ)。 */
const ROTATIONS: Readonly<Record<string, 90 | 180 | 270>> = { r90: 90, r180: 180, r270: 270 };

export const MIRROR_WORD = 'mirror';

/** 向きの語。**値ではないもの**の一覧として外からも引く。 */
export const ORIENTATIONS: readonly string[] = [...Object.keys(ROTATIONS), MIRROR_WORD];

export const isRotationWord = (token: string): boolean => token in ROTATIONS;

export const rotationOf = (token: string): Turn['rotate'] | null => ROTATIONS[token] ?? null;

/** その角度を書く語。0 度は語を書かない。 */
export const rotationWord = (rotate: Turn['rotate']): string =>
  (rotate === 0 ? '' : `r${rotate}`);

/**
 * 書ける向き。**形が決める** — アンカー 1 つで置く形だけが語で回る。
 *
 * `full` は 4 方向と反転 (格子が一様なので、どちらへ回しても挿せる)。
 * 足を並べて書く形は `none` (穴の順が向きなので、語は要らない)。
 */
export type Orient = 'none' | 'full';

export function orientOf(type: string): Orient {
  const footprint = footprintOf(type, null);
  if (footprint === null) return 'none';
  return footprint.kind === 'dip' || footprint.kind === 'sip' ? 'full' : 'none';
}

import type { StripId } from 'fence-kit';
import type { Mm, RectMm } from '../types.ts';
import { contains, grow, rectsTouch } from './shapes.ts';
import type { Piece, Shape } from './shapes.ts';

/**
 * 島 — **触れ合う銅の形の集まり**。1 つの島が 1 つの導通グループ (ネットの
 * 材料) で、perfboard の「穴 1 つ」、breadboard の「列の 5 穴」にあたる。
 * 線路とスタブが T 字に触れていれば 1 つ、チップで切れた線路は 2 つ。
 */
export type Island = {
  /** 導通グループの名前。`island:` に最初に書いた形の名前を付ける。 */
  readonly strip: StripId;
  /** 最初に書いた形の名前。ネットの名前にもなる。 */
  readonly name: string;
  readonly pieces: readonly Piece[];
  /** 島を作っている形の名前 (書いた順)。 */
  readonly members: readonly string[];
};

/** 地の導通グループ。 */
export const GND: StripId = 'gnd';

export const islandStrip = (name: string): StripId => `island:${name}`;

export function islandsOf(shapes: readonly Shape[]): readonly Island[] {
  // **形の中の矩形どうしも触れているとは限らない** (チップで切った線路は 2 つに分かれる)。
  // だから形ではなく矩形を単位に数え、あとで形の名前を集める。
  const pieces = shapes.flatMap((shape, shapeIndex) => shape.pieces.map((piece) => ({ piece, shapeIndex })));
  const pieceParent = pieces.map((_, index) => index);
  const findPiece = (index: number): number => {
    let root = index;
    while (pieceParent[root] !== root) root = pieceParent[root] ?? root;
    let cursor = index;
    while (pieceParent[cursor] !== root) {
      const next = pieceParent[cursor] ?? root;
      pieceParent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const [a, b] = [pieces[i], pieces[j]];
      if (a === undefined || b === undefined) continue;
      if (rectsTouch(a.piece.rect, b.piece.rect)) {
        const [ra, rb] = [findPiece(i), findPiece(j)];
        if (ra !== rb) pieceParent[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
  }

  const groups = new Map<number, { pieces: Piece[]; members: string[] }>();
  pieces.forEach(({ piece, shapeIndex }, index) => {
    const root = findPiece(index);
    const group = groups.get(root) ?? { pieces: [], members: [] };
    group.pieces.push(piece);
    const id = shapes[shapeIndex]?.id ?? '';
    if (!group.members.includes(id)) group.members.push(id);
    groups.set(root, group);
  });

  // **同じ名前の島を 2 つ作らない。** 切れた線路の 2 つ目の島は `L1~2` と呼ぶ。
  const used = new Map<string, number>();
  return [...groups.values()].map((group) => {
    const first = group.members[0] ?? '';
    const count = (used.get(first) ?? 0) + 1;
    used.set(first, count);
    const name = count === 1 ? first : `${first}~${count}`;
    return { strip: islandStrip(name), name, pieces: group.pieces, members: group.members };
  });
}

/** 点が乗っている島。無ければ null。 */
export const islandAt = (islands: readonly Island[], point: Mm): Island | null =>
  islands.find((island) => island.pieces.some((piece) => contains(piece.rect, point))) ?? null;

/** 島のまわりの溝 (表が地の板)。島の矩形を溝の幅だけ広げたもの。 */
export const cutZones = (islands: readonly Island[]): readonly RectMm[] =>
  islands.flatMap((island) => island.pieces.map((piece) => grow(piece.rect, piece.gap)));

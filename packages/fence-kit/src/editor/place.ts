import { applyRewrite } from './lines.ts';
import type { Edit, LineEdit } from './edits.ts';

/**
 * 部品を**置く**ときの、フェンスに依らない部分。
 *
 * マップは押した穴を 1 つ送るだけで、残りの穴と向きはフェンスが決める
 * (52 の docs/17)。そのうち**盤面の綴りを知らなくても書ける 2 つ**をここに置く —
 * 足の間隔の表と、置いた行を回す・反転する段取り。穴の並べ方そのもの
 * (レールを断る、板の外を断る) は板を知っている側の仕事。
 */

/**
 * 2 本足を 1 穴で置くときの、足から足までの穴の数。**examples の最頻値**から —
 * 種類ごとの実寸 (1/4W か 1/6W か) は知らないので、書かれてきた図の手癖に合わせる
 * (resistor は 55 件中 42 件が 5、led は 34 件中 19 件が 1)。
 *
 * **穴の並んだ板 (breadboard / perfboard) が使う。** circuit の升目は実寸ではなく
 * 記号の置き場なので、別の既定 (2 升) を持つ。
 */
const LEAD_SPANS: Readonly<Record<string, number>> = { resistor: 5, led: 1 };
const FALLBACK_SPAN = 3;

export const leadSpan = (type: string): number => LEAD_SPANS[type] ?? FALLBACK_SPAN;

/**
 * 押した穴をアンカーに、足を並べる位置 (アンカーからいくつ先か)。
 * 2 本足は間隔を空け、3 本足は隣どうし。
 */
export const leadOffsets = (type: string, holes: number): readonly number[] =>
  (holes === 2 ? [0, leadSpan(type)] : Array.from({ length: holes }, (_, index) => index));

/** 回す・反転するの答え (各フェンスの `MoveResult` / `RewriteResult` がそのまま入る)。 */
export type Rewritten<E> =
  | {
    readonly ok: true;
    readonly value: { readonly edits?: readonly Edit[]; readonly lines?: readonly LineEdit[] };
  }
  | { readonly ok: false; readonly error: E };

export type OrientResult<E> =
  | { readonly ok: true; readonly lines: readonly LineEdit[] }
  | { readonly ok: false; readonly error: E };

/**
 * 足した行を、**置く前に**回す・反転する。
 *
 * 置いてから回すと履歴が 2〜3 歩に割れるので、本文の写しに 1 行足してから
 * **回す側の関数をそのまま通し** (`turnPart` / `flipPart`)、出来上がった 1 行だけを
 * 足す。回す規則を 2 か所に持たないための形。
 *
 * 直った行を探すのは `lineOf` — **フェンスの読み手に訊く**。行の頭が `ID:` で
 * 始まるかで探すと、同じ名前の `points:` の行を掴むことがある。
 */
export function orientInserted<E>(
  source: string,
  added: readonly LineEdit[],
  orient: { readonly turn?: number; readonly flip?: boolean },
  tools: {
    readonly turn: (placed: string, quarters: number) => Rewritten<E>;
    readonly flip: (placed: string) => Rewritten<E>;
    /** 置いた部品の行 (字下げごと)。読み直せなければ null。 */
    readonly lineOf: (placed: string) => string | null;
  },
): OrientResult<E> {
  const quarters = orient.turn ?? 0;
  if (quarters === 0 && orient.flip !== true) return { ok: true, lines: added };

  let placed = applyRewrite(source, { lines: added });
  if (quarters !== 0) {
    const turned = tools.turn(placed, quarters);
    if (!turned.ok) return turned;
    placed = applyRewrite(placed, turned.value);
  }
  if (orient.flip === true) {
    const flipped = tools.flip(placed);
    if (!flipped.ok) return flipped;
    placed = applyRewrite(placed, flipped.value);
  }

  const written = tools.lineOf(placed);
  if (written === null) return { ok: true, lines: added };
  // 足すのは**鍵が先、部品の行が後**なので、直すのは最後の `insert`。
  const last = added.map((one) => one.kind === 'insert').lastIndexOf(true);
  return {
    ok: true,
    lines: added.map((one, index) => (index === last ? { ...one, text: written } : one)),
  };
}

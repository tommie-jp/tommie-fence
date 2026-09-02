/**
 * フェンスの本文を書き換えるときの数え方。**3 つのフェンスで同じ**なので
 * ここに置く (綴りも語彙もフェンスごとに違うが、行と桁の数え方は同じ)。
 *
 * どれも純粋な形と 1 つの関数だけ。当てるのは使う側 (vscode を知る層)。
 */

/** 行の中の 1 か所の差し替え。行は 1 始まり、桁は 0 始まり。 */
export type Edit = {
  readonly line: number;
  readonly column: number;
  readonly length: number;
  readonly text: string;
};

/**
 * フェンスの中の 1 か所。行は 1 始まり、桁は 0 始まり (`Edit` と同じ数え方)。
 * **どこに書かれているかを指す**だけで、書き換えの中身は持たない。
 */
export type Span = { readonly line: number; readonly column: number; readonly length: number };

/** つながっている端子の組。名前は並べ替えて持つ (向きは意味を持たない)。 */
export type Connection = readonly [string, string];

/** 書き換えで離れる接続と生まれる接続。 */
export type NetDiff = { readonly lost: readonly Connection[]; readonly gained: readonly Connection[] };

/**
 * 行そのものの出し入れ。行は 1 始まり (フェンスの中の行)。
 * **行の中の差し替え (`Edit`) と混ぜない** — 当て方が違う (桁を書き換えるか、
 * 行を出し入れするか) し、桁の履歴では行の増減を追えない。
 *
 * `insert` は**その行の前**に入れる (末尾へ足すときは行数 + 1)。
 */
export type LineEdit =
  | { readonly kind: 'insert'; readonly line: number; readonly text: string }
  | { readonly kind: 'delete'; readonly line: number };

/** 1 回の書き換え。行の中の差し替えと、行の出し入れの両方を持てる。 */
export type Rewrite = {
  readonly edits: readonly Edit[];
  readonly lines: readonly LineEdit[];
  readonly diff: NetDiff;
};

/**
 * フェンスの取り出しがその行から剥がした字下げ。**行ごとに数える。**
 *
 * 取り出しは開き記号の字下げぶん「まで」を剥がすので、開き記号より浅い行からは
 * 剥がした量が少ない。開き記号の量を一律に足し戻すと、その行だけ桁が右へずれて
 * **別の場所を書き換える** (箇条書きの中のフェンスで実際に踏まれた)。
 */
export const strippedIndent = (opening: string, lineText: string): number =>
  Math.min(
    (/^ {0,3}/.exec(opening)?.[0] ?? '').length,
    (/^ */.exec(lineText)?.[0] ?? '').length,
  );

/**
 * 接続の変化を、動かしたあとのお知らせに添える 1 文にする。無変化なら null。
 *
 * **黙らせない** — 動かすと接続が変わることがあるので、変わったら言う。
 * 変わらなかったときに言わないのも同じ約束のうち (言うと嘘になる)。
 */
export function describeDiff(diff: NetDiff): string | null {
  const parts: string[] = [];
  if (diff.lost.length > 0) {
    parts.push(`離れた接続: ${diff.lost.map((pair) => pair.join(' — ')).join(', ')}`);
  }
  if (diff.gained.length > 0) {
    // 同じところに 2 つ来るのは**つながった**というお知らせ (禁止ではない)。
    parts.push(`つながった接続: ${diff.gained.map((pair) => pair.join(' — ')).join(', ')}`);
  }
  return parts.length === 0 ? null : parts.join(' / ');
}

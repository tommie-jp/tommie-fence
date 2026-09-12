import type { WireSpec } from '../types.ts';

/**
 * 仕様から**配線の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * **1 行が 2 本以上になることがある。** `- a1 -- b1 -- c1` は「a1–b1」と
 * 「b1–c1」の 2 本として読まれるので、組み直すときは**同じ行の仕様を
 * つないで 1 本の鎖に戻す** (例 22 文書では 108 行のうち 5 行がこの形)。
 *
 * 端点は読んだ行と列ではなく**書かれた綴り**を使う (`spelling`)。
 * `points:` の名前で書いた端が、書き戻すときに番地へ化けないようにするため。
 */

/** 同じ行に書かれた配線を、書かれた順に渡す。**頭に `- ` は付けない** (呼ぶ側の字下げの話)。 */
export function spellWires(wires: readonly WireSpec[]): string {
  const [first, ...rest] = wires;
  if (first === undefined) return '';

  // 鎖の頭 (最初の from) から始めて、あとは「演算子 + to」を継ぐ。
  return rest.reduce(
    (chain, wire) => `${chain} ${wire.operator} ${wire.spelling[1]}`,
    `${first.spelling[0]} ${first.operator} ${first.spelling[1]}`,
  );
}

/** 行ごとにまとめる。**書かれた順を保つ** (並べ替えると鎖がつながらない)。 */
export function wiresByLine(wires: readonly WireSpec[]): ReadonlyMap<number, readonly WireSpec[]> {
  const byLine = new Map<number, WireSpec[]>();
  for (const wire of wires) {
    const rows = byLine.get(wire.line);
    if (rows === undefined) byLine.set(wire.line, [wire]);
    else rows.push(wire);
  }
  return byLine;
}

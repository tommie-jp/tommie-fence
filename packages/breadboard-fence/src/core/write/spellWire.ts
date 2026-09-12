import type { WireSpec } from '../types.ts';

/**
 * 仕様から**配線の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * **1 行が 2 本以上になることがある。** `- b10 -- b14 -- b21` は 2 本として
 * 読まれるので、組み直すときは**同じ行の仕様をつないで 1 本の鎖に戻す**。
 *
 * 読む側 (`parser/compact.ts`) と**同じ並び**で書く:
 * `端点 -- 端点 [-- 端点 …] [色] [迂回ヒント]`
 *
 * 端は読んだ番地ではなく**書かれた綴り** (`spelling`) を使う。`points:` の
 * 名前で書いた端が、書き戻すときに番地へ化けないようにするため。
 */

/**
 * 迂回ヒント。`[v20 h-30]` の形で末尾に付く。**書かれた字をそのまま戻す** —
 * 区切りは `,` でも空白でもよいので、読んだ値からは書かれた形に戻せない。
 */
const hintWords = (written: string | null): readonly string[] =>
  (written === null ? [] : [`[${written}]`]);

/** 同じ行に書かれた配線を、書かれた順に渡す。**頭の `- ` は付けない**。 */
export function spellWires(wires: readonly WireSpec[]): string {
  const [first, ...rest] = wires;
  if (first === undefined) return '';

  const chain = rest.reduce(
    (made, wire) => `${made} -- ${wire.spelling[1]}`,
    `${first.spelling[0]} -- ${first.spelling[1]}`,
  );
  // 色と迂回ヒントは鎖ぜんぶに掛かる (読む側も 1 行に 1 つずつしか受けない)。
  return [chain, ...(first.color === null ? [] : [first.color]), ...hintWords(first.hintsWritten)].join(' ');
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

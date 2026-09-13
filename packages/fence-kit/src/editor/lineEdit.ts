import type { Edit } from './edits.ts';

/**
 * 1 行の**書き換える前と後**から、差し替えの並びを作る (52 の docs/54 の段 3)。
 *
 * 中身から組み直した行をそのまま書き戻すと、行まるごとの差し替えになる。
 * VS Code では**戻す単位とカーソルの位置**がそれに引きずられる — 値を 1 つ
 * 直しただけなのに、行ぜんぶを打ち直したように見える。
 *
 * **語の数が同じなら、違う語ごとに差し替える。** いまの当て方 (綴りを差し替える)
 * と同じ形になる — 部品を動かせば番地 2 つぶんの差し替え、値を直せば値 1 つぶん。
 * 光らせる場所 (`partSpans`) が語の単位なので、差し替えも語の単位にそろえる。
 *
 * 語の数が違うとき (値を足した・消した) は、**前と後で違う所をまとめて 1 つ**にする。
 * 同じなら空。桁はフェンスの中の 0 始まり。
 */

type Word = { readonly column: number; readonly text: string };

const wordsOf = (line: string): readonly Word[] =>
  [...line.matchAll(/\S+/g)].map((found) => ({ column: found.index ?? 0, text: found[0] }));

/** 前と後で違う所をまとめて 1 つにする。頭と尻が重ならないように詰める。 */
function spanEdit(line: number, before: string, after: string): Edit {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head && tail < after.length - head
    && before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) tail += 1;

  return { line, column: head, length: before.length - head - tail, text: after.slice(head, after.length - tail) };
}

export function lineEdits(line: number, before: string, after: string): readonly Edit[] {
  if (before === after) return [];

  const was = wordsOf(before);
  const now = wordsOf(after);
  // 語の数が同じで、**語の間の空白も同じ**なら、違う語だけを差し替える。
  // 空白まで違うと語の位置がずれるので、まとめて 1 つにしたほうが確か。
  const sameShape = was.length === now.length
    && was.every((word, at) => word.column - (was[at - 1]?.column ?? 0) - (was[at - 1]?.text.length ?? 0)
      === (now[at]?.column ?? 0) - (now[at - 1]?.column ?? 0) - (now[at - 1]?.text.length ?? 0));
  if (!sameShape) return [spanEdit(line, before, after)];

  return was.flatMap((word, at) => {
    const next = now[at];
    return next === undefined || next.text === word.text
      ? []
      : [{ line, column: word.column, length: word.text.length, text: next.text }];
  });
}

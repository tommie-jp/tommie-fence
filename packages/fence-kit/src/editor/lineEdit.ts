import type { Edit } from './edits.ts';

/**
 * 1 行の**書き換える前と後**から、差し替え 1 つを作る (52 の docs/54 の段 3)。
 *
 * 中身から組み直した行をそのまま書き戻すと、行まるごとの差し替えになる。
 * VS Code では**戻す単位とカーソルの位置**がそれに引きずられる — 値を 1 つ
 * 直しただけなのに、行ぜんぶを打ち直したように見える。**前と後で違う所だけ**を
 * 差し替えにすれば、いまの当て方 (綴りを差し替える) と同じ見え方になる。
 *
 * 同じなら null (書き換えるものが無い)。桁はフェンスの中の 0 始まり。
 */
export function lineEdit(line: number, before: string, after: string): Edit | null {
  if (before === after) return null;

  // 頭から揃っている字数と、尻から揃っている字数。**重ならないように**尻を詰める。
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head && tail < after.length - head
    && before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) tail += 1;

  return {
    line,
    column: head,
    length: before.length - head - tail,
    text: after.slice(head, after.length - tail),
  };
}

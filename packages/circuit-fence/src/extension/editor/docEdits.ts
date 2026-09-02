import type { Edit } from '../../core/edit/move.ts';
import { indentOn } from './documentLike.ts';
import type { DocLike } from './documentLike.ts';
import { changesOf } from './history.ts';
import type { Change } from './history.ts';

/**
 * フェンスの中の編集を、Markdown の行と桁の書き換え (当てる前) にする。
 * **vscode を知らない**ので、そのままテストに掛かる。当てるのは host の仕事。
 */
export function changesForFence(document: DocLike, fenceLine: number, edits: readonly Edit[]): readonly Change[] {
  // **綴りの長さが変わると、同じ行の後ろの桁がずれる** (`a9 b9` → `a10 b10`)。
  // 当てたあとの桁を控えるのは `changesOf` の仕事。
  return changesOf(edits.map((one) => {
    // フェンスの中の行 → Markdown の行。開き記号の行のぶんだけずらす
    // (`shiftErrors` と同じ手口)。どちらも 1 始まりなので +fenceLine、
    // vscode は 0 始まりなので -1。
    const line = fenceLine + one.line - 1;
    const column = one.column + indentOn(document, fenceLine, line);
    return { line, column, before: document.lineAt(line).text.slice(column, column + one.length), after: one.text };
  }));
}

import type { Edit } from '../../core/edit/move.ts';
import { indentOn } from './documentLike.ts';
import type { DocLike } from './documentLike.ts';

/**
 * フェンスの中の編集を、Markdown の行と桁の書き換え (当てる前) にする。
 * **vscode を知らない**ので、そのままテストに掛かる。当てるのは host の仕事。
 */

/** 書き換えの片側。**桁は側ごとに持つ** (下の `Change` の注記)。 */
export type Side = { readonly column: number; readonly text: string };

/**
 * 文書に当てる 1 か所の書き換え。行も桁も 0 始まり (vscode に合わせる)。
 *
 * **両側がそれぞれ自分の桁を持つ。** 同じ行で先の綴りの長さが変わると、
 * 後ろの綴りは別の桁へ動く (`a9 b9` → `a10 b10` で `b10` は 1 桁右)。
 * 片方の桁だけで数えると、当てる前の照合が落ちる。
 */
export type Change = {
  readonly line: number;
  /** いまそこにあるはずの字と、その桁。**当てる前に照合する。** */
  readonly from: Side;
  readonly to: Side;
};

/** 当てる前の 1 か所。桁は文書のもの (0 始まり)。 */
export type Replacement = {
  readonly line: number;
  readonly column: number;
  readonly before: string;
  readonly after: string;
};

/**
 * 当てる前の書き換えを、両側の桁つきの `Change` にする。
 *
 * **同じ行で先の綴りの長さが変わると、後ろの綴りは別の桁へ動く**
 * (`a9 b9` → `a10 b10` で `b10` は 1 桁右)。当てたあとの桁を控えないと、
 * 照合が落ちて当てられなくなる。
 */
export function changesOf(replacements: readonly Replacement[]): readonly Change[] {
  const shifts = new Map<number, number>();
  return [...replacements]
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .map((one) => {
      const shift = shifts.get(one.line) ?? 0;
      shifts.set(one.line, shift + (one.after.length - one.before.length));
      return {
        line: one.line,
        from: { column: one.column, text: one.before },
        to: { column: one.column + shift, text: one.after },
      };
    });
}

/**
 * フェンスの本文の生の行 (文書から読む)。**履歴の控えも照合もここを通す** —
 * 字下げも行末の空白も、剥がさずそのまま持つ。行数はフェンスの本文
 * (`extractCircuitFences` が返す `source`) の行数で数える。
 * 閉じていないフェンスは文書の終わりで止める (`lineAt` は範囲の外で投げる)。
 */
export function fenceBody(document: DocLike, fenceLine: number, source: string): readonly string[] {
  const end = Math.min(fenceLine + source.split('\n').length, document.lineCount);
  return Array.from({ length: Math.max(0, end - fenceLine) }, (_, index) => document.lineAt(fenceLine + index).text);
}
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

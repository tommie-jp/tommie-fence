import type { Edit, Rewrite } from './edits.ts';
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
  // `source` は各行に改行を付けて繋いだものなので、`split` の末尾に空の要素が
  // 1 つ増える。そのまま数えると**閉じ記号の行まで控えに入り**、元に戻すときに
  // その行を書き換え、閉じ記号を直した人には「手で書き換えられています」と
  // 言って元に戻せなくなる。
  const body = source.split('\n');
  if (body.at(-1) === '') body.pop();
  const end = Math.min(fenceLine + body.length, document.lineCount);
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

/**
 * **本文を 0 行にしない。** 0 行のフェンスには書き戻す範囲が無く (`replaceBody`
 * は 0 行を断る)、中身を全部消したあとで戻すことも置くこともできなくなる。
 * VS Code は範囲の中身を空にするだけなので元から 1 行残っていて、playground
 * (行ごと抜く) でだけ起きていた。空の 1 行を残して揃える。
 */
const keepOneLine = (lines: readonly string[]): readonly string[] => (lines.length === 0 ? [''] : lines);

/** フェンスの開き記号の字下げ (最大 3 つ)。**足す行はこれを頭に付ける。** */
const fenceIndent = (document: DocLike, fenceLine: number): string =>
  /^ {0,3}/.exec(document.lineAt(fenceLine - 1).text)?.[0] ?? '';

/**
 * 書き換えを当てたあとのフェンスの本文 (生の行)。**行の出し入れがある書き換えは
 * これを通す** — 桁の書き換え (`changesForFence`) では行を出し入れできない。
 *
 * 行の中の差し替えは行ごとに右から当てる (同じ行の桁がずれない)。桁は
 * フェンスの中のものなので、その行が剥がされた字下げのぶん右へ戻す。
 * 足す行は**開き記号の字下げ**を頭に付ける (中の行に合わせると、深く書かれた
 * 行の隣に足したときだけ深くなる)。
 */
export function bodyAfter(
  document: DocLike,
  fenceLine: number,
  source: string,
  rewrite: Rewrite,
): readonly string[] {
  const body = fenceBody(document, fenceLine, source);
  const edited = body.map((text, index) => {
    const on = [...rewrite.edits].filter((edit) => edit.line === index + 1).sort((a, b) => b.column - a.column);
    if (on.length === 0) return text;
    const indent = indentOn(document, fenceLine, fenceLine + index);
    return on.reduce(
      (now, edit) => now.slice(0, edit.column + indent) + edit.text + now.slice(edit.column + indent + edit.length),
      text,
    );
  });
  if (rewrite.lines.length === 0) return edited;

  const pad = fenceIndent(document, fenceLine);
  const dropped = new Set(rewrite.lines.filter((one) => one.kind === 'delete').map((one) => one.line));
  const added = new Map<number, string[]>();
  for (const one of rewrite.lines) {
    if (one.kind !== 'insert') continue;
    added.set(one.line, [...(added.get(one.line) ?? []), `${pad}${one.text}`]);
  }

  const out: string[] = [];
  edited.forEach((text, index) => {
    out.push(...(added.get(index + 1) ?? []));
    if (!dropped.has(index + 1)) out.push(text);
  });
  out.push(...(added.get(edited.length + 1) ?? []));
  return keepOneLine(out);
}

/** 本文の行。末尾の改行が作る空の要素は落とす (`fenceBody` と同じ数え方)。 */
const bodyLines = (source: string): readonly string[] => {
  const lines = source.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
};

/**
 * `after` の各行 (0 始まり) が、`before` のどの行をそのまま残したものか。
 * 並びを崩さずにいちばん多く対応させる (最長共通部分列)。フェンスの本文は
 * 数十行なので、表を丸ごと作って足りる。
 */
function keptLines(before: readonly string[], after: readonly string[]): ReadonlyMap<number, number> {
  const longest = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  const at = (i: number, j: number): number => longest[i]?.[j] ?? 0;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const row = longest[i];
      if (row !== undefined) row[j] = before[i] === after[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const kept = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      kept.set(j, i);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) i += 1;
    else j += 1;
  }
  return kept;
}

/**
 * 本文 (字下げを剥がしたもの) を丸ごと書き換えたあとの、フェンスの生の行。
 *
 * **まとめて当てる書き換え** (`runAll`) は途中の本文しか持たず、`bodyAfter` の
 * ように書き換えを 1 つずつ文書へ写せない。そこで元の本文と突き合わせて、
 * **変わっていない行は文書の行をそのまま**使う (字下げも行末の空白も剥がさない)。
 * 変わった行と足した行は開き記号の字下げを頭に付ける (`bodyAfter` の足す行と同じ)。
 *
 * 前は剥がした本文をそのまま書き戻していて、末尾の改行のぶん**閉じ記号の前に
 * 空行が 1 つ増え**、箇条書きの中のフェンスでは**字下げが消えていた** (52 の docs/47)。
 */
export function bodyFrom(document: DocLike, fenceLine: number, source: string, after: string): readonly string[] {
  const written = fenceBody(document, fenceLine, source);
  const now = bodyLines(after);
  const kept = keptLines(bodyLines(source), now);
  const pad = fenceIndent(document, fenceLine);
  return keepOneLine(now.map((text, index) => {
    const was = kept.get(index);
    const same = was === undefined ? undefined : written[was];
    return same ?? (text === '' ? '' : `${pad}${text}`);
  }));
}

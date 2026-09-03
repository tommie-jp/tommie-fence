import type { Edit, LineEdit } from './edits.ts';

/**
 * YAML の**行そのものを出し入れ**するときの共通の手口。
 * 3 つのフェンスとも「1 部品 = 1 行、1 配線 = 1 行」なので、消すのも足すのも
 * 行の単位になり、鍵 (`parts:` / `wires:`) の扱いも同じ形になる。
 *
 * ここが持つのは**行の数え方だけ**。何を消すか (その部品を指す配線や注釈まで
 * 連れていくか) はフェンスが決める。
 */

/** その鍵の行 (1 始まり)。無ければ 0。 */
export const keyLineOf = (lines: readonly string[], key: string): number =>
  lines.findIndex((text) => new RegExp(`^\\s*${key}\\s*:`).test(text)) + 1;

/** その行が鍵の行そのものか (`parts: {R1: …}` のような 1 行書き)。 */
export const isKeyLine = (lineText: string | undefined, key: string): boolean =>
  lineText !== undefined && new RegExp(`^\\s*${key}\\s*:`).test(lineText);

/**
 * フロー形式を断る文面。**その書き方では行が 1 つのものに対応しない**ので、
 * 行ごと消すと鍵まで消える。綴りの差し替え (動かす) は今までどおり効くので、
 * 消したい人は手で消す。
 */
export const FLOW_REFUSAL = 'フロー形式 (1 行に書いた形) は行ごと消せません。手で消します';

/**
 * 消す行を書き換えに直す。**行番号の順に並べて渡す** (当てる側が後ろから
 * 当てられるように)。0 は「鍵が無い」の印なので落とす。
 */
export const dropLines = (lines: Iterable<number>): readonly LineEdit[] =>
  [...new Set(lines)]
    .filter((line) => line > 0)
    .sort((a, b) => a - b)
    .map((line) => ({ kind: 'delete' as const, line }));

/**
 * 足す行を書き換えに直す。`line` の**前**に入れる (末尾へ足すときは行数 + 1)。
 */
export const insertLines = (
  entries: Iterable<{ readonly line: number; readonly text: string }>,
): readonly LineEdit[] =>
  [...entries].map(({ line, text }) => ({ kind: 'insert' as const, line, text }));

/** その鍵がフロー形式で書かれているか (鍵の行に中身まで載っている)。 */
export const isFlowKey = (lines: readonly string[], key: string): boolean => {
  const line = keyLineOf(lines, key);
  return line > 0 && (lines[line - 1] ?? '').replace(new RegExp(`^\\s*${key}\\s*:`), '').trim() !== '';
};

/**
 * その行 (1 始まり) の字下げ。足す行は**既にある行に合わせる**。
 *
 * **0 桁は「字下げが無い」ではない。** YAML の並びは列 0 にも書けるので、
 * そこへ 2 つ空けて足すと、足した行が前の値に畳み込まれてフェンスが読めなくなる
 * (図がまるごと消える。circuit で実際に踏んだ)。行そのものが無いときだけ 2 つにする。
 */
export const indentOf = (lines: readonly string[], line: number): string => {
  const text = lines[line - 1];
  if (text === undefined) return '  ';
  return /^\s*/.exec(text)?.[0] ?? '';
};

/** 末尾の空行より前。鍵ごと足すときの行き先 (末尾の空行の後ろに書かない)。 */
export const afterLastLine = (lines: readonly string[]): number => {
  const last = lines.map((text) => text.trim() !== '').lastIndexOf(true);
  return last < 0 ? 1 : last + 2;
};

/**
 * 鍵 (`wires:` など) の下に 1 行足す書き換え。**鍵が無ければ鍵ごと足す。**
 *
 * `lastLine` はその鍵の下にある最後の行 (無ければ 0)。字下げをそこから写すので、
 * 手で整えた並びに合う。
 */
export function appendUnderKey(
  lines: readonly string[],
  key: string,
  lastLine: number,
  text: string,
): readonly LineEdit[] {
  const at = keyLineOf(lines, key);
  if (at === 0) {
    const end = afterLastLine(lines);
    return [
      { kind: 'insert', line: end, text: `${key}:` },
      { kind: 'insert', line: end, text: `  ${text}` },
    ];
  }
  return lastLine > 0
    ? [{ kind: 'insert', line: lastLine + 1, text: `${indentOf(lines, lastLine)}${text}` }]
    : [{ kind: 'insert', line: at + 1, text: `  ${text}` }];
}

/**
 * 行の出し入れを当てる。
 *
 * **同じ行に 2 行足すときは書いた順に並ぶ。** 後ろから当てる素朴な当て方だと
 * 順が逆になる (鍵と中身を一緒に足すときに `wires:` が下へ行く)。
 * 行の前に足すものを溜めてから 1 度だけ流し込む。
 */
export function applyLineEdits(source: string, edits: readonly LineEdit[]): string {
  if (edits.length === 0) return source;

  const lines = source.split('\n');
  const dropped = new Set(edits.filter((one) => one.kind === 'delete').map((one) => one.line));
  const added = new Map<number, string[]>();
  for (const one of edits) {
    if (one.kind !== 'insert') continue;
    added.set(one.line, [...(added.get(one.line) ?? []), one.text]);
  }

  const out: string[] = [];
  lines.forEach((text, index) => {
    out.push(...(added.get(index + 1) ?? []));
    if (!dropped.has(index + 1)) out.push(text);
  });
  // 末尾へ足す分 (行数 + 1 を指す `insert`)。
  out.push(...(added.get(lines.length + 1) ?? []));
  return out.join('\n');
}

/**
 * 行の中の差し替えを当てる。**同じ行は右から** (左から当てると、綴りの長さが
 * 変わったとき後ろの桁がずれる — `a9 b9` → `a10 b10`)。
 *
 * 桁はフェンスの本文 (字下げを剥がした `source`) のもの。文書へ当てるときは
 * `docEdits.ts` が字下げを足し戻すが、ここは**本文の中だけで完結する**ので
 * そのまま当てられる (ゴーストや置く前の試し当てに使う)。
 */
export function applyEdits(source: string, edits: readonly Edit[]): string {
  if (edits.length === 0) return source;

  const lines = source.split('\n');
  return lines.map((text, index) => {
    const on = edits.filter((edit) => edit.line === index + 1).sort((a, b) => b.column - a.column);
    return on.reduce(
      (now, edit) => now.slice(0, edit.column) + edit.text + now.slice(edit.column + edit.length),
      text,
    );
  }).join('\n');
}

/**
 * 書き換えを丸ごと当てる (桁の差し替えのあと、行の出し入れ)。
 * **本文の中で試し当てをするための 1 本** — 置く前のゴーストは、これで
 * 当てたあとの本文から穴を読む。文書を触らないので、押す前に何度でも呼べる。
 */
export const applyRewrite = (
  source: string,
  rewrite: { readonly edits?: readonly Edit[]; readonly lines?: readonly LineEdit[] },
): string => applyLineEdits(applyEdits(source, rewrite.edits ?? []), rewrite.lines ?? []);

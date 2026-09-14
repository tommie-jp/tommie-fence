import { YAML_START, readYamlLine } from './scanYaml.ts';
import type { ReadLine, YamlState } from './scanYaml.ts';

/**
 * 行の中の、項目 1 つ (`R1: resistor a1 a3`) を書いた範囲。
 *
 * **1 行 = 1 項目と決めつけると、フロー形式を壊す。** `parts: {R1: …, R2: …}` の
 * R2 の値を直すつもりで行まるごと組み直すと R1 が消える。欄を直す側は
 * この範囲の中だけを書き換える。
 *
 * YAML を読み直さずに字面から決める (fence-kit は YAML を知らない)。**決められない
 * ときは null** を返す — 範囲を読み違えて書くより、断るほうがよい。
 * 読み違いの見張りは書き換える側にもある (書いたあと読み直す)。
 */
export type Entry = {
  /** 鍵の頭の桁 (引用符で囲んだ鍵なら引用符の桁)。 */
  readonly start: number;
  /** 項目の終わりの桁 (区切りの `,` `}`・コメント・後ろの空白を含まない)。 */
  readonly end: number;
  /** フロー形式の中の項目か。ブロック形式なら行の終わりまでがその項目。 */
  readonly flow: boolean;
};

/**
 * `line` 行目 (1 始まり) の `id:` で始まる項目。`from` より前の鍵は見ない
 * (同じ名前が 1 行に 2 つあるとき、前の項目の続きから探すため)。
 *
 * null になるのは — 鍵が見つからない、フロー形式の項目が次の行へ続いている
 * (`{R1: resistor a1\n  a3}`)、引用符が行をまたいでいる。
 */
export function entryOf(lines: readonly string[], line: number, id: string, from = 0): Entry | null {
  const text = lines[line - 1];
  if (text === undefined) return null;

  // **深さは文書の頭から数える。** 前の行の終わりの字 (`,` `{`) だけで決めると、
  // ブロック形式の値 `1,` の次の行をフロー形式と取り違える。
  let state: YamlState = YAML_START;
  for (const before of lines.slice(0, line - 1)) state = readYamlLine(before, state).after;
  const read = readYamlLine(text, state);

  const start = keyColumn(text, read, id, from);
  if (start === null) return null;
  const depth = read.depths[start] ?? 0;
  if (depth === 0) return { start, end: trimmedEnd(text, start, read.comment), flow: false };

  const stop = flowStop(text, read, start, depth);
  if (stop !== null) return { start, end: trimmedEnd(text, start, stop), flow: true };
  // 行の中で区切りが見つからない。次の行が区切りから始まるときだけ、行の終わりまで。
  if (read.after.quote !== null || !nextStartsWithStop(lines, line, read.after)) return null;
  return { start, end: trimmedEnd(text, start, read.comment), flow: true };
}

const trimmedEnd = (text: string, start: number, stop: number): number =>
  start + text.slice(start, stop).trimEnd().length;

const escaped = (id: string): string => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 鍵の頭の桁。**値の頭にあたる所だけ**を見る (行頭・`{` `,` の後ろ) —
 * 値の中や引用符の中の `R1:` は鍵ではない。`R1 :` `"R1":` `'R1':` も鍵。
 */
function keyColumn(text: string, read: ReadLine, id: string, from: number): number | null {
  const key = new RegExp(`^(?:${escaped(id)}|"${escaped(id)}"|'${escaped(id)}')\\s*:(?:\\s|$)`);
  for (let at = from; at < read.comment; at += 1) {
    if (read.quoted[at] === true) continue;
    const previous = text.slice(0, at).trimEnd().at(-1);
    if (previous !== undefined && previous !== '{' && previous !== ',') continue;
    if (key.test(text.slice(at, read.comment))) return at;
  }
  return null;
}

/** 項目の区切り (`,`、閉じる `}` `]`) の桁。同じ深さで、引用符の外にあるもの。 */
function flowStop(text: string, read: ReadLine, start: number, depth: number): number | null {
  for (let at = start; at < read.comment; at += 1) {
    if (read.quoted[at] === true || read.depths[at] !== depth) continue;
    const char = text[at];
    if (char === ',' || char === '}' || char === ']') return at;
  }
  return null;
}

/** 次の中身のある行 (空行とコメントだけの行は飛ばす) が区切りから始まるか。 */
function nextStartsWithStop(lines: readonly string[], line: number, state: YamlState): boolean {
  let now = state;
  for (const after of lines.slice(line)) {
    const read = readYamlLine(after, now);
    const body = after.slice(0, read.comment).trim();
    if (body !== '') return /^[,}\]]/.test(body);
    now = read.after;
  }
  return false;
}

/**
 * その行に**フロー形式の並びの中の項目**が書かれているか (`wires: [a1 -- a3, …]`、
 * `notes: [circle R1, …]` と、その折り返しの行)。
 *
 * 行を項目 1 つと見て書き換える操作 (注釈の字・向き・複製、配線の色) が、
 * 書き換える前に断るために使う。ブロック形式の項目の中身をフロー形式で書いた
 * 形 (`- {text a1: hi}`) は、行が項目 1 つなので含めない。
 */
export function flowItemOn(lines: readonly string[], line: number): boolean {
  const text = lines[line - 1];
  if (text === undefined) return false;
  let state: YamlState = YAML_START;
  for (const before of lines.slice(0, line - 1)) state = readYamlLine(before, state).after;
  const read = readYamlLine(text, state);

  const body = text.slice(0, read.comment);
  if (state.depth > 0 && body.trim() !== '') return true;
  // `鍵: [` / `鍵: {` — 鍵の値がそのままフロー形式。
  for (let at = 0; at < body.length; at += 1) {
    const char = body[at];
    if (read.quoted[at] === true || read.depths[at] !== 0 || (char !== '[' && char !== '{')) continue;
    if (body.slice(0, at).trimEnd().endsWith(':')) return true;
  }
  return false;
}

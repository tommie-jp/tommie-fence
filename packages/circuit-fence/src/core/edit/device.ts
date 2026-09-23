import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import type { Edit, LineEdit } from 'fence-kit';
import { DEVICE } from '../parts.ts';
import type { PartSpec } from '../types.ts';

/**
 * 機器 (`device`) を升目から触るときの書き換え (52 の docs/66 の段 1)。
 *
 * **機器はブロックで書く** (`M1:` の下に `type:` `at:` `pins:` …)。1 行を組み直す
 * 部品の道 (`writeFence`) に乗せると、鍵の行を 1 行形式で上書きして下の行が
 * 宙に浮き、フェンスごと読めなくなる (実機で確かめた)。だから**ブロックの中の
 * 1 行だけ**を書き換える — 動かすのは `at:`、回すのは `turn:`、値は `label:`。
 * breadboard の `edit/device.ts` と同じ考え方。
 *
 * **ブロックの範囲は YAML の読み取り結果から取る。** 字下げで数えると、ブロックの
 * 中の空行や浅いコメントで途切れ、消すと中身が宙に残った (コードレビューで出た)。
 */

export const isDevicePart = (part: PartSpec): boolean => part.type === DEVICE;

/** 1 行に並べた形 (`M1: {type: device, …}`) は升目から書き換えない。 */
export const FLOW_DEVICE = '1 行に並べた形の機器は升目からは書き換えられません。手で書き換えます';

type Block = {
  /** 鍵の行。 */
  readonly from: number;
  /** 中身の最後の行。 */
  readonly to: number;
  /** `{ … }` で書かれているか。 */
  readonly flow: boolean;
};

/** その機器のブロック。`parts:` の下の、鍵がその行にある項目を探す。 */
function blockOf(source: string, part: PartSpec): Block | null {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, uniqueKeys: false });
  if (!isMap(doc.contents)) return null;

  const lineAt = (offset: number): number => lineCounter.linePos(offset).line;
  for (const top of doc.contents.items) {
    if (!isScalar(top.key) || top.key.value !== 'parts' || !isMap(top.value)) continue;
    for (const pair of top.value.items) {
      const key = isScalar(pair.key) ? pair.key : null;
      if (key?.range == null || lineAt(key.range[0]) !== part.line) continue;
      if (!isMap(pair.value) || pair.value.range == null) return null;
      // 値の終わり (`range[1]`) は最後の字の次。行末の改行を跨がないよう 1 字戻す。
      const to = Math.max(part.line, lineAt(Math.max(pair.value.range[1] - 1, 0)));
      return { from: part.line, to, flow: pair.value.flow === true };
    }
  }
  return null;
}

type FieldSpan = { readonly line: number; readonly column: number; readonly length: number };

/**
 * ブロックの中の `key:` の値の桁。**行末のコメントは値に含めない** (書き換えても
 * 残す)。YAML ではコメントは空白のあとの `#` から。
 */
function fieldSpan(lines: readonly string[], block: Block, key: string): FieldSpan | null {
  const pattern = new RegExp(`^(\\s*${key}:[ \\t]*)(.*?)(?:[ \\t]+#.*)?[ \\t]*$`);
  for (let at = block.from + 1; at <= block.to; at += 1) {
    const found = pattern.exec(lines[at - 1] ?? '');
    if (found !== null) return { line: at, column: (found[1] ?? '').length, length: (found[2] ?? '').length };
  }
  return null;
}

/** ブロックの中の項目の字下げ (鍵の行の次にある、中身の行と同じ)。 */
function fieldIndent(lines: readonly string[], block: Block): string {
  for (let at = block.from + 1; at <= block.to; at += 1) {
    const one = lines[at - 1] ?? '';
    if (one.trim() === '' || one.trimStart().startsWith('#')) continue;
    return one.slice(0, one.length - one.trimStart().length);
  }
  const head = lines[block.from - 1] ?? '';
  return `${head.slice(0, head.length - head.trimStart().length)}  `;
}

export type DeviceRewrite = { readonly edits: readonly Edit[]; readonly lines: readonly LineEdit[] };

/**
 * ブロックの中の `key:` を `text` にする。**無ければブロックの末尾に足し、
 * `text` が null なら行ごと消す** (向きが元に戻った機器に `turn:` を残さない)。
 * 1 行に並べた形とブロックが見つからないときは null (呼ぶ側が断る)。
 */
export function setDeviceField(source: string, part: PartSpec, key: string, text: string | null): DeviceRewrite | null {
  const block = blockOf(source, part);
  if (block === null || block.flow) return null;
  const lines = source.split('\n');
  const found = fieldSpan(lines, block, key);
  if (found !== null) {
    return text === null
      ? { edits: [], lines: [{ kind: 'delete', line: found.line }] }
      : { edits: [{ ...found, text }], lines: [] };
  }
  if (text === null) return { edits: [], lines: [] };
  return { edits: [], lines: [{ kind: 'insert', line: block.to + 1, text: `${fieldIndent(lines, block)}${key}: ${text}` }] };
}

/** `at:` の値の桁。番地の点を動かすとき、機器の置き場も一緒に動かすのに使う。 */
export function deviceAtSpan(source: string, part: PartSpec): FieldSpan | null {
  const block = blockOf(source, part);
  return block === null || block.flow ? null : fieldSpan(source.split('\n'), block, 'at');
}

/**
 * 消すときに一緒に消す行 (鍵の行は含まない)。**ブロックの中の空行とコメントも**
 * 消す — 残すと、宙に浮いた中身か、持ち主の無いコメントになる。
 */
export function deviceBodyLines(source: string, part: PartSpec): readonly number[] {
  const block = blockOf(source, part);
  if (block === null) return [];
  return Array.from({ length: block.to - block.from }, (_, index) => block.from + 1 + index);
}

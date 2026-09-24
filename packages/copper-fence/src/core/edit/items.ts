import { REWRITE_REFUSAL, entryOf, keepSpacing, lineEdits, normalizeNewlines } from 'fence-kit';
import type { Edit } from 'fence-kit';
import { parseFence } from '../parser/parseFence.ts';
import type { CopperSpec, FenceDocument, LineSpec, PartSpec, WireSpec } from '../types.ts';

/**
 * エディタが書き換える**項目 1 つ** (`C1: capacitor/1608 20,10 10p`)。
 * 3 つのフェンスと同じく **1 部品 = 1 行**で、書き換えは語の単位 (値を 1 つ直せば
 * 差し替えも 1 つ。VS Code の戻す単位が行まるごとにならない)。
 *
 * **フロー形式 (`parts: {C1: …}`) は書き換えない** — 点の `,` がフロー形式の
 * 区切りと重なるので、そもそも読めない書き方でもある。
 */
export type Word = { readonly column: number; readonly text: string };

export type Item = {
  readonly line: number;
  /** 鍵の頭の桁と、値の頭・終わりの桁。 */
  readonly start: number;
  readonly valueStart: number;
  readonly end: number;
  readonly words: readonly Word[];
};

/** 本文と読んだ結果をまとめて持つ (1 回の操作で何度も読み直さない)。 */
export type Read = {
  readonly source: string;
  readonly lines: readonly string[];
  readonly doc: FenceDocument;
};

export const read = (source: string): Read => {
  const normalized = normalizeNewlines(source);
  return { source: normalized, lines: normalized.split('\n'), doc: parseFence(normalized).doc };
};

/** 行の中の、名前の付いた項目。見つからない・フロー形式なら null。 */
export function itemOf(lines: readonly string[], line: number | null, id: string): Item | null {
  if (line === null) return null;
  const entry = entryOf(lines, line, id);
  if (entry === null || entry.flow) return null;
  const text = lines[line - 1] ?? '';
  const colon = text.indexOf(':', entry.start);
  if (colon < 0 || colon >= entry.end) return null;
  let valueStart = colon + 1;
  while (valueStart < entry.end && text[valueStart] === ' ') valueStart += 1;
  const words = [...text.slice(valueStart, entry.end).matchAll(/\S+/g)]
    .map((found) => ({ column: valueStart + (found.index ?? 0), text: found[0] }));
  return { line, start: entry.start, valueStart, end: entry.end, words };
}

/** 項目の値を語の並びで書き直す。**書かれていた語の間の空白は残す**。 */
export function rewrite(lines: readonly string[], item: Item, words: readonly string[]): readonly Edit[] {
  const before = lines[item.line - 1] ?? '';
  const value = keepSpacing(before.slice(item.valueStart, item.end), words.join(' '));
  return lineEdits(item.line, before, `${before.slice(0, item.valueStart)}${value}${before.slice(item.end)}`);
}

/** 並びの項目 (`- P1 -- P2 red`) の語。`-` の後ろから。 */
export function listWords(lines: readonly string[], line: number): readonly Word[] | null {
  const text = lines[line - 1];
  if (text === undefined) return null;
  const dash = /^(\s*-\s+)/.exec(text);
  if (dash === null) return null;
  const from = dash[1]?.length ?? 0;
  const comment = text.indexOf(' #', from);
  const body = text.slice(from, comment < 0 ? undefined : comment);
  // **引用で囲んだ項目は書き換えない** (語を差し替えると引用符が片方だけ残る)。
  if (/["']/.test(body)) return null;
  return [...body.matchAll(/\S+/g)].map((found) => ({ column: from + (found.index ?? 0), text: found[0] }));
}

/** 並びの項目の語を書き直す。 */
export function rewriteList(lines: readonly string[], line: number, words: readonly string[]): readonly Edit[] | null {
  const now = listWords(lines, line);
  const first = now?.[0];
  const last = now?.at(-1);
  if (now === null || first === undefined || last === undefined) return null;
  const before = lines[line - 1] ?? '';
  const end = last.column + last.text.length;
  const value = keepSpacing(before.slice(first.column, end), words.join(' '));
  return lineEdits(line, before, `${before.slice(0, first.column)}${value}${before.slice(end)}`);
}

/** 名札。**配線と線路は `wire:行`** (殻の約束)、それ以外は名前。 */
const WIRE = /^wire:(\d+)$/;

export const wireLineOf = (handle: string): number | null => {
  // **`wire:N` だけ。** 数字だけの名前 (`5: pad …`) も書けるので、素の数を行と読むと別の物を掴む。
  const found = WIRE.exec(handle);
  return found === null ? null : Number(found[1]);
};

export type Found =
  | { readonly kind: 'part'; readonly part: PartSpec }
  | { readonly kind: 'shape'; readonly shape: Exclude<CopperSpec, LineSpec> }
  | { readonly kind: 'line'; readonly shape: LineSpec }
  | { readonly kind: 'jumper'; readonly wire: WireSpec };

/** 名札が指すもの。 */
export function find(doc: FenceDocument, handle: string): Found | null {
  const line = wireLineOf(handle);
  if (line !== null) {
    const shape = doc.copper.find((spec): spec is LineSpec => spec.kind === 'line' && spec.line === line);
    if (shape !== undefined) return { kind: 'line', shape };
    const wire = doc.wires.find((one) => one.line === line);
    return wire === undefined ? null : { kind: 'jumper', wire };
  }
  const part = doc.parts.find((one) => one.id === handle);
  if (part !== undefined) return { kind: 'part', part };
  const shape = doc.copper.find((spec) => spec.id === handle);
  if (shape === undefined) return null;
  return shape.kind === 'line' ? { kind: 'line', shape } : { kind: 'shape', shape };
}

export { REWRITE_REFUSAL };

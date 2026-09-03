import { wireColorNames } from './../render/palette.ts';
import { normalizeNewlines } from '../newlines.ts';
import type { Edit, NetDiff } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';

import { parseFence } from '../parser/parseFence.ts';
import type { FenceError } from '../types.ts';

/**
 * 配線の欄 (色)。**掴み手は書かれた行** — 配線に名前は無い (注釈と同じ考え方)。
 *
 * 色は行の末尾の語 1 つ。**書いていなければ足し、空にすれば消す**ので、
 * 「既定に戻す」も同じ欄でできる。
 */

const HANDLE = 'wire:';

export const isWireHandle = (handle: string): boolean => handle.startsWith(HANDLE);

export function wireLineOf(handle: string): number | null {
  if (!isWireHandle(handle)) return null;
  const line = Number(handle.slice(HANDLE.length));
  return Number.isInteger(line) && line > 0 ? line : null;
}

type WireResult =
  | { readonly ok: true; readonly value: { readonly edits: readonly Edit[]; readonly diff: NetDiff } }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): WireResult => ({ ok: false, error: fenceError(message, line) });

/** 掴み手が指している配線と、その行の字。 */
function locate(source: string, handle: string) {
  const line = wireLineOf(handle);
  if (line === null) return null;
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  const wire = doc?.wires.find((one) => one.line === line);
  if (wire === undefined) return null;
  return { wire, line, text: normalized.split('\n')[line - 1] ?? '' };
}

/** 配線の欄。**直せるのは色だけ** (つなぐ先は掴んで動かす)。 */
export function wireFields(source: string, handle: string) {
  const found = locate(source, handle);
  if (found === null) return null;
  return {
    id: `配線 (${found.line} 行目)`,
    type: 'wire',
    value: '',
    label: '',
    color: found.wire.color ?? '',
    can: ['color'] as const,
  };
}

/** 色を書き換える。**空にすると語ごと消える** (図の既定の色に戻る)。 */
export function setWireField(source: string, handle: string, field: string, text: string): WireResult {
  const found = locate(source, handle);
  if (found === null) return fail(`${wireLineOf(handle) ?? '?'} 行目に配線がありません`, wireLineOf(handle));
  if (field !== 'color') return fail(`配線に直せる欄は色だけです (${safeToken(field)} は直せません)`, found.line);

  const wanted = text.trim().toLowerCase();
  if (wanted !== '' && !wireColorNames().includes(wanted)) {
    return fail(`知らない配線色です: ${safeToken(text)} (使えるのは ${wireColorNames().join(', ')})`, found.line);
  }

  const written = found.wire.color;
  const body = found.text.replace(/\s+$/, '');
  // **書かれた色の綴りを探して差し替える。** 末尾から探すので、番地に色の名前が
  // 混じっていても取り違えない。
  const at = written === null ? body.length : body.toLowerCase().lastIndexOf(written.toLowerCase());
  if (written !== null && at < 0) return fail(`${found.line} 行目の色を行の中に見つけられませんでした`, found.line);

  const column = wanted === '' && written !== null && body[at - 1] === ' ' ? at - 1 : at;
  const length = written === null ? 0 : written.length + (column < at ? 1 : 0);
  const insert = wanted === '' ? '' : `${written === null ? ' ' : ''}${wanted}`;

  const edits: Edit[] = [{ line: found.line, column, length, text: insert }];
  return { ok: true, value: { edits, diff: { lost: [], gained: [] } } };
}

/** 色の候補 (`datalist`)。**書ける色はフェンスが決める。** */
export const renderColorOptions = (id: string): string =>
  `<datalist id="${id}">${wireColorNames().map((name) => `<option value="${name}">`).join('')}</datalist>`;

import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { fenceError, safeToken } from '../errors.ts';
import type { Edit, NetDiff } from 'fence-kit';
import type { FenceError } from '../types.ts';

/**
 * 配線の欄。**直せるのは種類 (折れ方) だけ。**
 *
 * `--` はまっすぐ、`-|` は先に横、`|-` は先に縦へ折れる。掴んで引き直さなくても
 * 折れ方だけ変えられるようにした (実機で頼まれて足した)。
 *
 * **色は書けない。** 板の 2 つは被覆の色を書く (実物の線が何色か、という話) が、
 * 回路図の線は図の地の文と同じ色で引くもので、1 本ずつ変える意味が無い
 * (色は `style: ink-color` で図ごとに決まる)。
 */

const HANDLE = 'wire:';

export const isWireHandle = (handle: string): boolean => handle.startsWith(HANDLE);

const wireLineOf = (handle: string): number | null => {
  if (!isWireHandle(handle)) return null;
  const line = Number(handle.slice(HANDLE.length));
  return Number.isInteger(line) && line > 0 ? line : null;
};

/** 書ける折れ方。**文法の綴りそのもの**で、欄に出す候補もこれ。 */
export const WIRE_KINDS: readonly string[] = ['--', '-|', '|-'];

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

export function wireFields(source: string, handle: string) {
  const found = locate(source, handle);
  if (found === null) return null;
  return {
    id: `配線 (${found.line} 行目)`,
    type: found.wire.operator,
    value: '',
    label: '',
    color: '',
    can: ['type'] as const,
    kinds: WIRE_KINDS,
  };
}

/**
 * 折れ方を書き換える。**行の中の綴りを差し替える**ので、番地も色も動かない。
 *
 * 綴りは 2 文字で、番地の中には出てこない (番地は英数字だけ)。それでも
 * **読めた綴りを探して差し替える** — 行の中の位置はモデルが持っていないので、
 * 字として見つけるしかない。
 */
export function setWireField(source: string, handle: string, field: string, text: string): WireResult {
  const found = locate(source, handle);
  if (found === null) return fail(`${wireLineOf(handle) ?? '?'} 行目に配線がありません`, wireLineOf(handle));
  if (field !== 'type') {
    return fail(`配線に直せる欄は種類だけです (${safeToken(field)} は直せません)`, found.line);
  }

  const wanted = text.trim();
  if (!WIRE_KINDS.includes(wanted)) {
    return fail(`知らない配線の種類です: ${safeToken(text)} (使えるのは ${WIRE_KINDS.join(' / ')})`, found.line);
  }

  const written = found.wire.operator;
  if (wanted === written) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };

  const at = found.text.indexOf(written);
  if (at < 0) return fail(`${found.line} 行目の ${written} を行の中に見つけられませんでした`, found.line);

  const edits: Edit[] = [{ line: found.line, column: at, length: written.length, text: wanted }];
  // 折れ方が変わっても、つながる先は同じ。ネットは動かない。
  return { ok: true, value: { edits, diff: { lost: [], gained: [] } } };
}

/** 色の候補。**回路図には無い**ので空の一覧を返す (欄も出ない)。 */
export const renderColorOptions = (id: string): string => `<datalist id="${id}"></datalist>`;

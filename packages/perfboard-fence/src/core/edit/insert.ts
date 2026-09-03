import { FLOW_REFUSAL, appendUnderKey, isFlowKey, normalizeNewlines } from 'fence-kit';
import type { LineEdit, NetDiff } from 'fence-kit';
import { fenceError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { parseFence } from '../parser/parseFence.ts';
import { PART_PREFIXES, holesOf, isPlaceable } from '../parts/catalog.ts';
import { resolveTypeName } from '../parts/types.ts';
import type { Address, FenceError } from '../types.ts';
import { diffAfterLines } from './diff.ts';

/**
 * 配線を 1 本足す。**行を 1 行足すだけ** — 1 配線 = 1 本の信号経路という
 * 文法の読みと揃える (消すのも同じ単位)。
 *
 * 置き場は `wires:` の下の最後の行の次。**字下げは既にある行から写す**ので、
 * 手で整えた並びに合う。鍵が無ければ鍵ごと足す。
 */

export type Addition = {
  readonly edits: readonly never[];
  readonly lines: readonly LineEdit[];
  readonly diff: NetDiff;
};

export type AdditionResult =
  | { readonly ok: true; readonly value: Addition }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): AdditionResult =>
  ({ ok: false, error: fenceError(message, line) });

/**
 * 端点から端点へ 1 本。色は書かない (既定の色。**色は後から欄で変える**もので、
 * 引くときに決めさせると、引くたびに選ばせることになる)。
 */
export function insertWire(source: string, from: Address, to: Address): AdditionResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return fail('フェンスを読めないので足せません (先にエラーを直します)', null);

  const board = doc.board;
  for (const end of [from, to]) {
    if (!isOnBoard(board, end)) return fail(`${formatAddress(end)} は板の外です`, null);
  }
  // 長さ 0 の線は図に出ない (押し間違いでしか生まれない)。
  if (formatAddress(from) === formatAddress(to)) {
    return fail(`両端が同じ穴です (${formatAddress(from)})`, null);
  }

  const lines = normalized.split('\n');
  if (isFlowKey(lines, 'wires')) return fail(`配線: ${FLOW_REFUSAL.replace('消せません', '足せません')}`, null);

  const last = doc.wires.reduce((deepest, wire) => Math.max(deepest, wire.line ?? 0), 0);
  const written = `- ${formatAddress(from)} -- ${formatAddress(to)}`;
  const added = appendUnderKey(lines, 'wires', last, written);

  return { ok: true, value: { edits: [], lines: added, diff: diffAfterLines(normalized, added) } };
}

/** 置く部品。番地は**書かれた綴り**で渡す。 */
export type NewPart = {
  readonly id: string;
  readonly type: string;
  readonly at: readonly Address[];
};

/**
 * 置く部品に付ける ID。**接頭辞ごとに最小の未使用番号** (`D1` が LED なら、
 * 次のダイオードは `D2`)。種類ごとに数えると、同じ接頭辞で番号が重なる。
 * 知らない種類は null (名前の付けようがない)。
 */
export function nextPartId(source: string, type: string): string | null {
  const resolved = resolveTypeName(type);
  if (!isPlaceable(resolved)) return null;
  const prefix = PART_PREFIXES[resolved];

  const { doc } = parseFence(normalizeNewlines(source));
  const used = new Set((doc?.parts ?? []).map((part) => part.id));
  for (let number = 1; number <= LIMITS.parts + 1; number += 1) {
    const id = `${prefix}${number}`;
    if (!used.has(id)) return id;
  }
  return null;
}

/**
 * 部品を 1 つ置く。**行を 1 行足すだけ。**
 *
 * **穴は並べて書くだけ。** この文法に `@` の形は無く、DIP / SIP も
 * アンカーの穴を 1 つ書く (`U1: dip8 c3`)。
 */
export function insertPart(source: string, part: NewPart): AdditionResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return fail('フェンスを読めないので置けません (先にエラーを直します)', null);

  const type = resolveTypeName(part.type);
  const wanted = holesOf(type);
  if (wanted === 0) return fail(`知らない部品の種類です: ${part.type}`, null);
  if (part.at.length !== wanted) {
    return fail(`${part.type} は穴を ${wanted} つ書きます (${part.at.length} つ渡されました)`, null);
  }
  if (doc.parts.some((one) => one.id === part.id)) {
    return fail(`その名前はもう使われています: ${part.id}`, null);
  }

  for (const hole of part.at) {
    if (!isOnBoard(doc.board, hole)) return fail(`${formatAddress(hole)} は板の外です`, null);
  }
  // 同じ穴に 2 本の足は挿せない。
  const spelled = part.at.map((hole) => formatAddress(hole));
  if (new Set(spelled).size !== spelled.length) {
    return fail('同じ穴に 2 本の足は挿せません', null);
  }

  const lines = normalized.split('\n');
  if (isFlowKey(lines, 'parts')) return fail(`部品: ${FLOW_REFUSAL.replace('消せません', '足せません')}`, null);

  const last = doc.parts.reduce((deepest, one) => Math.max(deepest, one.line ?? 0), 0);
  const holes = spelled.join(' ');
  const added = appendUnderKey(lines, 'parts', last, `${part.id}: ${type} ${holes}`);

  return { ok: true, value: { edits: [], lines: added, diff: diffAfterLines(normalized, added) } };
}

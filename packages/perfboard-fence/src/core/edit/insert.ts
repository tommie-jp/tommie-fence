import { FLOW_REFUSAL, appendUnderKey, isFlowKey, normalizeNewlines } from 'fence-kit';
import type { LineEdit, NetDiff } from 'fence-kit';
import { fenceError } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { parseFence } from '../parser/parseFence.ts';
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

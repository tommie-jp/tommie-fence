import type { Edit, NetDiff, Span } from 'fence-kit';
import { normalizeNewlines } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { Address, Board, FenceError, PartSpec } from '../types.ts';
import { diffAfter } from './diff.ts';
import { locateTokens } from './shared.ts';

/**
 * 部品を別の穴へ動かす。**フェンス本文 → 書き換えの並び**を返す純関数で、
 * DOM も Node も知らない (設計上の約束 1)。
 *
 * **最初の穴がアンカー**で、部品は形を保ったまま平行移動する
 * (`R1: resistor b3 b7` を `c3` へ動かすと `c3 c7`)。値も名前も触らない。
 *
 * 格子が一様なので、動かす量は行と列の差そのもの (ブレッドボードのレールや
 * 溝にあたるものが無い)。
 */

export type Move = { readonly edits: readonly Edit[]; readonly diff: NetDiff };

export type MoveResult =
  | { readonly ok: true; readonly value: Move }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): MoveResult =>
  ({ ok: false, error: fenceError(message, line) });

export type Located = {
  readonly part: PartSpec;
  readonly line: string;
  readonly lineNumber: number;
  readonly addresses: readonly Address[];
  readonly points: ReadonlyMap<string, Address>;
  readonly board: Board;
};

/** 書かれた穴を番地にする。`points:` の名前でも引ける。 */
const addressOf = (written: string, points: ReadonlyMap<string, Address>): Address | null =>
  parseAddress(written) ?? points.get(written) ?? null;

/**
 * 動かす部品と、その行と、書かれた穴。読めなければ理由を返す。
 *
 * **綴りの探し方はここ 1 か所。** 動かす側と回す側と光らせる側で別々に持つと、
 * 1 行に部品が 2 つ並ぶ書き方で片方だけが違う綴りを書き換える。
 */
export function locatePart(source: string, id: string): Located | { readonly error: FenceError } {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return { error: fenceError('フェンスを読めませんでした', null) };

  const part = doc.parts.find((one) => one.id === id);
  if (part === undefined) return { error: fenceError(`部品がありません: ${safeToken(id)}`, null) };
  if (part.line === null) return { error: fenceError(`${safeToken(id)} の行が分かりません`, null) };

  const line = normalized.split('\n')[part.line - 1];
  if (line === undefined) return { error: fenceError(`${safeToken(id)} の行が見つかりません`, part.line) };

  const points = new Map<string, Address>();
  for (const point of doc.points) {
    const address = parseAddress(point.written);
    if (address !== null) points.set(point.name, address);
  }

  const addresses: Address[] = [];
  for (const hole of part.holes) {
    const address = addressOf(hole, points);
    if (address === null) {
      return { error: fenceError(`穴として読めません: ${safeToken(hole)}`, part.line) };
    }
    addresses.push(address);
  }
  if (addresses.length === 0) {
    return { error: fenceError(`${safeToken(id)} は穴で置かれていないので動かせません`, part.line) };
  }

  return { part, line, lineNumber: part.line, addresses, points, board: doc.board };
}

export const isLocated = (found: Located | { error: FenceError }): found is Located => !('error' in found);

/** マップで掴める部品の名前。読めないフェンスでは空。 */
export function movablePartIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  if (doc === null) return [];
  return doc.parts.filter((part) => part.holes.length > 0 && part.line !== null).map((part) => part.id);
}

/** その部品の穴が書かれている場所。エディタで光らせるのに使う。 */
export function partSpans(source: string, id: string): readonly Span[] {
  const found = locatePart(source, id);
  if (!isLocated(found)) return [];

  const located = locateTokens(found.line, found.addresses, found.points);
  return located === null
    ? []
    : located.tokens.map((token) => ({ line: found.lineNumber, column: token.column, length: token.length }));
}

export function movePart(source: string, id: string, to: Address): MoveResult {
  const found = locatePart(source, id);
  if (!isLocated(found)) return { ok: false, error: found.error };

  const anchor = found.addresses[0];
  if (anchor === undefined) return fail(`${safeToken(id)} に穴がありません`, found.lineNumber);
  const step = { rows: to.row - anchor.row, cols: to.col - anchor.col };

  const targets = found.addresses.map((address) => ({
    row: address.row + step.rows,
    col: address.col + step.cols,
  }));
  const off = targets.find((address) => !isOnBoard(found.board, address));
  if (off !== undefined) {
    return fail(
      `${safeToken(id)} を ${formatAddress(to)} へは動かせません (${formatAddress(off)} が板の外です)`,
      found.lineNumber,
    );
  }

  const located = locateTokens(found.line, found.addresses, found.points);
  if (located === null) {
    return fail(`${safeToken(id)} の穴を行の中に見つけられませんでした`, found.lineNumber);
  }

  const edits: Edit[] = [];
  for (const [index, token] of located.tokens.entries()) {
    const before = found.addresses[index];
    const after = targets[index];
    if (before === undefined || after === undefined) continue;
    const written = formatAddress(after);
    // 動かない穴は書き換えない (名前で書いてある所を綴りに変えてしまわない)。
    if (formatAddress(before) === written) continue;
    edits.push({ line: found.lineNumber, column: token.column, length: token.length, text: written });
  }

  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

import type { Edit, NetDiff, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { createBoard } from '../model/board.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, FenceError, HoleRow, PartSpec } from '../types.ts';
import { diffAfter } from './diff.ts';
import { locateTokens } from './shared.ts';

/**
 * 部品を別の穴へ動かす。**フェンス本文 → 書き換えの並び**を返す純関数で、
 * vscode も DOM も知らない (設計上の約束)。
 *
 * **最初の穴がアンカー**で、部品は形を保ったまま平行移動する
 * (`R1: resistor a5 a10` を `c5` へ動かすと `c5 c10`)。
 * 値も極性の印 (`b12(A)` の `(A)`) も名前も触らない。
 */

export type Move = { readonly edits: readonly Edit[]; readonly diff: NetDiff };

export type MoveResult =
  | { readonly ok: true; readonly value: Move }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): MoveResult =>
  ({ ok: false, error: fenceError(message, line) });

/** 番地の行を数で。 */
const rowIndex = (row: HoleRow): number => HOLE_ROWS.indexOf(row);

type Step = { readonly rows: number; readonly cols: number };

/**
 * 動かす量。**穴どうしのときだけ行が動く。**
 *
 * レールは行そのものが極性 (`+t` の `+`) なので、行を足し引きしても意味を持たない
 * (`+t5` の 2 つ下は `-t5` ではない)。レールが絡む移動は列だけを動かす。
 */
function stepOf(from: Address, to: Address): Step {
  const cols = to.col - from.col;
  return from.kind === 'hole' && to.kind === 'hole'
    ? { rows: rowIndex(to.row) - rowIndex(from.row), cols }
    : { rows: 0, cols };
}

/** 動かした先。板から出るときは null (呼ぶ側が断る)。 */
function shifted(address: Address, step: Step, columns: number): Address | null {
  const col = address.col + step.cols;
  if (col < 1 || col > columns) return null;
  if (address.kind !== 'hole') return { ...address, col };

  const name = HOLE_ROWS[rowIndex(address.row) + step.rows];
  return name === undefined ? null : { kind: 'hole', row: name, col };
}

/** 書かれた穴を番地にする。`points:` の名前でも引ける。 */
const addressOf = (written: string, points: ReadonlyMap<string, string>): Address | null => {
  const direct = parseAddress(written);
  if (direct !== null) return direct;
  const named = points.get(written);
  return named === undefined ? null : parseAddress(named);
};

type Located = {
  readonly part: PartSpec;
  readonly line: string;
  readonly addresses: readonly Address[];
  readonly points: ReadonlyMap<string, Address>;
  readonly columns: number;
};

/** 動かす部品と、その行と、書かれた穴。読めなければ理由を返す。 */
function locate(source: string, id: string): Located | { readonly error: FenceError } {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return { error: fenceError('フェンスを読めませんでした', null) };

  const part = doc.parts.find((one) => one.id === id);
  if (part === undefined) return { error: fenceError(`部品がありません: ${safeToken(id)}`, null) };

  const line = normalized.split('\n')[part.line - 1];
  if (line === undefined) return { error: fenceError(`${safeToken(id)} の行が見つかりません`, part.line) };

  const points = new Map<string, Address>();
  for (const [name, written] of doc.points) {
    const address = parseAddress(written);
    if (address !== null) points.set(name, address);
  }

  const addresses: Address[] = [];
  for (const hole of part.holes) {
    const address = addressOf(hole.addr, doc.points);
    if (address === null) {
      return { error: fenceError(`穴として読めません: ${safeToken(hole.addr)}`, part.line) };
    }
    addresses.push(address);
  }
  if (addresses.length === 0) {
    // 帯に並べる機器 (`device`) は穴を持たない。掴む先が無いので動かせない。
    return { error: fenceError(`${safeToken(id)} は穴で置かれていないので動かせません`, part.line) };
  }

  return { part, line, addresses, points, columns: createBoard(doc.board).columns };
}

const isLocated = (found: Located | { error: FenceError }): found is Located => !('error' in found);

/** マップで掴める部品の名前。読めないフェンスでは空。 */
export function movablePartIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  if (doc === null) return [];
  return doc.parts.filter((part) => part.holes.length > 0).map((part) => part.id);
}

/** その部品の穴が書かれている場所。エディタで光らせるのに使う。 */
export function partSpans(source: string, id: string): readonly Span[] {
  const found = locate(source, id);
  if (!isLocated(found)) return [];

  const located = locateTokens(found.line, found.addresses, found.points);
  return located === null
    ? []
    : located.tokens.map((token) => ({ line: found.part.line, column: token.column, length: token.length }));
}

export function movePart(source: string, id: string, to: Address): MoveResult {
  const found = locate(source, id);
  if (!isLocated(found)) return { ok: false, error: found.error };

  const anchor = found.addresses[0];
  if (anchor === undefined) return fail(`${safeToken(id)} に穴がありません`, found.part.line);
  const step = stepOf(anchor, to);

  const targets: Address[] = [];
  for (const address of found.addresses) {
    const next = shifted(address, step, found.columns);
    if (next === null) {
      return fail(
        `${safeToken(id)} を ${formatAddress(to)} へは動かせません (板の外に出ます)`,
        found.part.line,
      );
    }
    targets.push(next);
  }

  const located = locateTokens(found.line, found.addresses, found.points);
  if (located === null) {
    return fail(`${safeToken(id)} の穴を行の中に見つけられませんでした`, found.part.line);
  }

  const edits: Edit[] = [];
  for (const [index, token] of located.tokens.entries()) {
    const before = found.addresses[index];
    const after = targets[index];
    if (before === undefined || after === undefined) continue;
    const written = formatAddress(after);
    // 動かない穴は書き換えない (名前で書いてあるところを綴りに変えてしまわない)。
    if (formatAddress(before) === written) continue;
    edits.push({ line: found.part.line, column: token.column, length: token.length, text: written });
  }

  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

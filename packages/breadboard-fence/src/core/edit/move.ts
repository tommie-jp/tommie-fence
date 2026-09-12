import type { GridStep } from 'fence-kit';
import type { Edit, NetDiff, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, isCrossing, parseAddress } from '../model/address.ts';
import { createBoard } from '../model/board.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, Board, FenceError, HoleRow, PartSpec } from '../types.ts';
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

type Step = GridStep;

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

export type Located = {
  readonly part: PartSpec;
  readonly line: string;
  readonly addresses: readonly Address[];
  readonly points: ReadonlyMap<string, Address>;
  readonly columns: number;
  /** 板そのもの (回す側が「板の外か」を見るのに使う)。 */
  readonly board: Board;
};

/**
 * 動かす部品と、その行と、書かれた穴。読めなければ理由を返す。
 *
 * **綴りの探し方はここ 1 か所。** 動かす側と回す側と光らせる側で別々に持つと、
 * 1 行に部品が 2 つ並ぶフロー形式で片方だけが違う綴りを書き換える
 * (circuit で実際に踏まれた型)。
 */
export function locatePart(source: string, id: string): Located | { readonly error: FenceError } {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);

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

  const board = createBoard(doc.board);
  return { part, line, addresses, points, columns: board.columns, board };
}

export const isLocated = (found: Located | { error: FenceError }): found is Located => !('error' in found);

/** マップで掴める部品の名前。読めないフェンスでは空。 */
export function movablePartIds(source: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc.parts.filter((part) => part.holes.length > 0).map((part) => part.id);
}

/** その部品の穴が書かれている場所。エディタで光らせるのに使う。 */
export function partSpans(source: string, id: string): readonly Span[] {
  const found = locatePart(source, id);
  if (!isLocated(found)) return [];

  const located = locateTokens(found.line, found.addresses, found.points);
  return located === null
    ? []
    : located.tokens.map((token) => ({ line: found.part.line, column: token.column, length: token.length }));
}

export function movePart(source: string, id: string, to: Address, trial = false): MoveResult {
  const found = locatePart(source, id);
  if (!isLocated(found)) return { ok: false, error: found.error };
  // **足は穴に挿す。** 交点の間へ落とされたら、書き込む前に断る (置く側と同じ
  // 規則。書いてしまうと、読み直したときにエラーになる図が残る)。
  if (!isCrossing(to)) {
    return fail(`${safeToken(id)} は穴の間には置けません (間に置けるのは注釈だけです)`, found.part.line);
  }

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

  return { ok: true, value: { edits, diff: trial ? { lost: [], gained: [] } : diffAfter(source, edits) } };
}

/**
 * その穴から `rows` 行・`cols` 列だけ離れた穴。板の外は null。
 *
 * **レールは行が極性そのもの**なので数に落ちない — 行を動かす指示は断り、
 * 列だけなら同じレールの上を動く (`+t5` の隣は `+t6`)。
 * 板の穴数は書いてある本文が決めるので、いちばん広い板 (`full`) で数える
 * (狭い板へ置いたときは、当てる側の `movePart` が改めて断る)。
 */
export function stepCell(written: string, rows: number, cols: number): string | null {
  const from = parseAddress(written);
  if (from === null) return null;
  // **端数も綴れる** (`b5c3`)。刻みは小数第 1 位までで、それより細かい数は
  // 綴りに直せない (`isCrossing` で見張っている番地の形に載らない)。
  const step = { rows: round(rows), cols: round(cols) };
  if (step.rows !== rows || step.cols !== cols) return null;
  return shiftedOn(from, step.rows, step.cols);
}

/** 小数第 1 位で丸める。綴りに載る刻みはここまで。 */
const round = (value: number): number => Number(value.toFixed(1));

/**
 * 2 つの穴の間の行数と列数。**まとめて選んだものを同じだけずらす**ために要る。
 * **レールは行が極性そのもの**で数に落ちないので、穴どうしのときだけ数える。
 */
export function stepsTo(from: string, to: string): GridStep | null {
  const start = parseAddress(from);
  const end = parseAddress(to);
  if (start === null || end === null) return null;
  if (start.kind !== 'hole' || end.kind !== 'hole') {
    return start.kind === end.kind ? { rows: 0, cols: end.col - start.col } : null;
  }
  return { rows: HOLE_ROWS.indexOf(end.row) - HOLE_ROWS.indexOf(start.row), cols: end.col - start.col };
}

/** 数え直した穴。行は `a`〜`j`、列は 1 から。 */
/**
 * その番地から行・列にずらした綴り。**端数は交点からの残り**として持つので、
 * 行をまたぐぶんは行の綴りへ、残りが組 (`c3`) になる。
 */
function shiftedOn(from: Address, rows: number, cols: number): string | null {
  const wholeCols = Math.floor((from.cols ?? 0) + cols);
  const col = from.col + wholeCols;
  const restCols = Number((((from.cols ?? 0) + cols) - wholeCols).toFixed(1));
  if (col < 1) return null;

  const wholeRows = Math.floor((from.rows ?? 0) + rows);
  const restRows = Number((((from.rows ?? 0) + rows) - wholeRows).toFixed(1));
  const rest = { ...(restRows === 0 ? {} : { rows: restRows }), ...(restCols === 0 ? {} : { cols: restCols }) };

  // レールは行が極性そのものなので、行はずらせない (端数だけは持てる)。
  if (from.kind !== 'hole') {
    return wholeRows !== 0 ? null : formatAddress({ ...from, col, ...rest });
  }
  const row = HOLE_ROWS[HOLE_ROWS.indexOf(from.row) + wholeRows];
  return row === undefined ? null : formatAddress({ kind: 'hole', row, col, ...rest });
}

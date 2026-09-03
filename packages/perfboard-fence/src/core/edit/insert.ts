import { FLOW_REFUSAL, appendUnderKey, isFlowKey, leadOffsets, needsRoom, normalizeNewlines, orientInserted } from 'fence-kit';
import type { LineEdit, NetDiff } from 'fence-kit';
import { fenceError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { parseFence } from '../parser/parseFence.ts';
import { PART_PREFIXES, holesOf, isPlaceable } from '../parts/catalog.ts';
import { resolveTypeName } from '../parts/types.ts';
import type { Address, Board, FenceError } from '../types.ts';
import { diffAfterLines } from './diff.ts';
import { flipPart, turnPart } from './turn.ts';
import { placeParts } from '../placement/place.ts';
import { isLocated, locatePart } from './move.ts';

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

/**
 * 置く部品。番地は**書かれた綴り**で渡す。
 *
 * **穴が 1 つなら残りはこちらで並べる** (マップは押した穴を 1 つ送るだけ)。
 * `turn` / `flip` は置く前に回す・反転する — ゴーストで見せた向きのまま書く。
 */
export type NewPart = {
  readonly id: string;
  readonly type: string;
  readonly at: readonly Address[];
  readonly turn?: number;
  readonly flip?: boolean;
  /** ゴーストの試し当て。**接続の変化を数えない** (捨てるので。fence-kit の `Trial`)。 */
  readonly preview?: boolean;
};

/** 何も変わらなかったことにする差分 (試し当て)。 */
const NO_DIFF: NetDiff = { lost: [], gained: [] };

/** 接続の変化。**試し当てのときは数えない** — 図を 2 枚組み直すぶんが丸ごと浮く。 */
const diffFor = (part: NewPart, source: string, lines: readonly LineEdit[]): NetDiff =>
  (part.preview === true ? NO_DIFF : diffAfterLines(source, lines));

/**
 * 押した穴 1 つから、残りの足を**同じ行の右へ**並べる。押した穴がアンカー
 * (先に書く足)。並べ方 (間隔) は `leadOffsets` が持つ — breadboard と同じ表なので
 * fence-kit にある (書く人の手癖は板が変わっても同じ)。
 *
 * 右へ入らなければ断る (左へ折り返すと、押した場所で向きが変わる)。
 * この板はレールが無く全穴が独立なので、断るのは板の外だけ。
 */
function spreadFrom(type: string, anchor: Address, wanted: number, board: Board): readonly Address[] | string {
  if (wanted <= 1) return [anchor];
  const holes: Address[] = leadOffsets(type, wanted)
    .map((step) => ({ row: anchor.row, col: anchor.col + step }));
  const last = holes[holes.length - 1] ?? anchor;
  if (holes.some((hole) => !isOnBoard(board, hole))) {
    return needsRoom(formatAddress(anchor), formatAddress(last), last.col - anchor.col);
  }
  return holes;
}

/**
 * 置いた行を、置く前に回す・反転する。段取りは fence-kit の `orientInserted` —
 * **回す側の関数をそのまま通す**ので、置いてから回したのと同じ行になる。
 * 直った行は**読み直して**探す (行の頭の綴りで探すと、同じ名前の `points:` を掴む)。
 */
function oriented(source: string, part: NewPart, added: readonly LineEdit[]): AdditionResult {
  const result = orientInserted(source, added, part, {
    turn: (placed, quarters) => turnPart(placed, part.id, quarters),
    flip: (placed) => flipPart(placed, part.id),
    lineOf: (placed) => {
      const found = locatePart(placed, part.id);
      return isLocated(found) ? found.line : null;
    },
  });
  return result.ok
    ? { ok: true, value: { edits: [], lines: result.lines, diff: diffFor(part, source, result.lines) } }
    : { ok: false, error: result.error };
}

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
  const anchor = part.at[0];
  // **穴 1 つで来たら残りを並べる** (2 本足・3 本足)。並べ方は板が決める。
  const at = part.at.length === 1 && anchor !== undefined && wanted > 1
    ? spreadFrom(type, anchor, wanted, doc.board)
    : part.at;
  if (typeof at === 'string') return fail(at, null);
  if (at.length !== wanted) {
    return fail(`${part.type} は穴を ${wanted} つ書きます (${at.length} つ渡されました)`, null);
  }
  if (doc.parts.some((one) => one.id === part.id)) {
    return fail(`その名前はもう使われています: ${part.id}`, null);
  }

  for (const hole of at) {
    if (!isOnBoard(doc.board, hole)) return fail(`${formatAddress(hole)} は板の外です`, null);
  }
  // 同じ穴に 2 本の足は挿せない。
  const spelled = at.map((hole) => formatAddress(hole));
  if (new Set(spelled).size !== spelled.length) {
    return fail('同じ穴に 2 本の足は挿せません', null);
  }

  const lines = normalized.split('\n');
  if (isFlowKey(lines, 'parts')) return fail(`部品: ${FLOW_REFUSAL.replace('消せません', '足せません')}`, null);

  const last = doc.parts.reduce((deepest, one) => Math.max(deepest, one.line ?? 0), 0);
  const holes = spelled.join(' ');
  const added = appendUnderKey(lines, 'parts', last, `${part.id}: ${type} ${holes}`);

  return oriented(normalized, part, added);
}

/** その部品が使っている穴 (書かれた綴り)。ゴーストの光らせ先。無ければ空。 */
export function partCells(source: string, id: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = doc?.parts.find((one) => one.id === id);
  if (!doc || part === undefined) return [];
  const placed = placeParts([part], doc.board).parts[0];
  return placed === undefined ? [] : placed.pins.map((pin) => formatAddress(pin.address));
}

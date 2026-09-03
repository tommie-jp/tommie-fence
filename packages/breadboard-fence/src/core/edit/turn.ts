import type { Edit } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, HoleRow } from '../types.ts';
import { diffAfter } from './diff.ts';
import { TURN_WORD, isTurned, orientOf } from '../parts/orient.ts';
import { lookupFootprint } from '../placement/footprints.ts';
import { isLocated, locatePart } from './move.ts';
import type { Located, MoveResult } from './move.ts';
import { locateTokens } from './shared.ts';

/**
 * 足を書いて置く部品を回す・反転する。**フェンス本文 → 書き換えの並び**を返す純関数。
 *
 * **文法は変えない。** 足を並べて書く部品 (2 本足・3 本足) の向きは
 * **穴の順そのもの**なので、回すのは「先に書いた足のまわりに残りを 90 度動かす」、
 * 反転は「両端の入れ替え」で済む。
 *
 * **アンカー 1 つで置く形 (DIP / SIP / ボード) は別の道。** 足の位置を形が決めるので
 * 穴に向きが出ない (52 の docs/14)。使う人にとってはどちらも「回す」「裏返す」の
 * 1 つの操作なので、違いはここで吸収する。
 *
 * - **回す (`R`) は半周。** この板で書けるのは `r180` だけなので
 *   (90 度は溝をまたぐ 2 列が同じ列に重なる)、`R` は語を出し入れする。
 * - **裏返す (`M`) はアンカーの行を移す。** 溝の向こう側へ渡った形は
 *   `@ f5` と書いたものそのもので、`mirror` の語は置いていない
 *   (同じ置き方を 2 通りで書けるようにしないため)。
 */

const fail = (message: string, line: number | null): MoveResult =>
  ({ ok: false, error: fenceError(message, line) });

/** 板は行が下へ、列が右へ増える。時計回りは (行, 列) → (列, -行)。 */
const quarter = (row: number, col: number): { readonly row: number; readonly col: number } =>
  ({ row: col, col: -row });

/** 90 度を `quarters` 回。正が時計回り (0 は何もしない)。 */
function spin(delta: { readonly row: number; readonly col: number }, quarters: number) {
  const times = ((quarters % 4) + 4) % 4;
  return Array.from({ length: times }).reduce<{ readonly row: number; readonly col: number }>(
    (turned) => quarter(turned.row, turned.col),
    delta,
  );
}

/** 穴の行を数で。**レールは行が極性そのもの**なので数に落ちない。 */
const rowIndex = (address: Address): number | null =>
  (address.kind === 'hole' ? HOLE_ROWS.indexOf(address.row) : null);

const rowAt = (index: number): HoleRow | null => HOLE_ROWS[index] ?? null;

/**
 * 掴んだ部品と、その足。回すのも裏返すのもここを通る。
 *
 * **足を 2 つ以上書いている部品だけ**が通る。アンカー 1 つで置く形は
 * 穴に向きが出ないので、そう言って断る (`@ e5` の DIP など)。
 */
function writtenLeadsAt(source: string, id: string, what: string) {
  const found = locatePart(source, id);
  if (!isLocated(found)) return { ok: false as const, error: found.error };

  if (found.addresses.length < 2) {
    return {
      ok: false as const,
      error: fenceError(
        `${safeToken(id)} は${what}せません`
        + ` (足の位置を形が決める部品なので、穴の順に向きが出ません)`,
        found.part.line,
      ),
    };
  }

  const located = locateTokens(found.line, found.addresses, found.points);
  if (located === null) {
    return {
      ok: false as const,
      error: fenceError(`${safeToken(id)} の穴を行の中に見つけられませんでした`, found.part.line),
    };
  }
  return { ok: true as const, found, tokens: located.tokens };
}

/**
 * 綴りを書き戻す編集。**書かれたままでよい端は触らない** (`null` を渡す) —
 * `points:` の名前で書かれた足を番地に直すと名前が外れ、あとで点を動かしても
 * 部品が付いてこなくなる (ネットの差分は空なので、何も言わずに切れる)。
 */
const editsFor = (
  line: number,
  tokens: readonly { readonly column: number; readonly length: number }[],
  texts: readonly (string | null)[],
): readonly Edit[] =>
  tokens.flatMap((token, index) => {
    const text = texts[index];
    return text === undefined || text === null
      ? []
      : [{ line, column: token.column, length: token.length, text }];
  });

/**
 * 語を 1 つ書き換える編集。**無ければ足し、消すなら前の空白ごと消す**
 * (行末に余りを残さない)。
 */
function wordEdit(
  line: number,
  found: { readonly column: number; readonly length: number } | null,
  text: string,
  insertAt: number,
): readonly Edit[] {
  if (found !== null) {
    const blank = text === '';
    return [{
      line,
      column: blank ? found.column - 1 : found.column,
      length: blank ? found.length + 1 : found.length,
      text,
    }];
  }
  return text === '' ? [] : [{ line, column: insertAt, length: 0, text: ` ${text}` }];
}

/** 語で回す部品か。**回すなら今の向きを返し、番地で回すなら null。** */
function anchoredTurn(source: string, id: string): Located | null {
  const found = locatePart(source, id);
  if (!isLocated(found)) return null;
  return orientOf(found.part.type) === 'half' ? found : null;
}

/**
 * 向きの語を出し入れする。**穴は動かさない** — 1 つの穴を基準に置く形なので、
 * 変わるのは向きだけで場所は変わらない。
 */
function turnByWord(source: string, found: Located, id: string): MoveResult {
  const located = locateTokens(found.line, found.addresses, found.points);
  const last = located?.tokens.at(-1);
  if (last === undefined) {
    return fail(`${safeToken(id)} の穴を行の中に見つけられませんでした`, found.part.line);
  }

  const after = last.column + last.length;
  const written = [...found.line.slice(after).matchAll(/\S+/g)]
    .map((match) => ({ column: after + (match.index ?? 0), length: match[0].length, text: match[0] }))
    .find((token) => token.text === TURN_WORD) ?? null;

  const edits = wordEdit(
    found.part.line,
    written,
    isTurned(found.part.turn) ? '' : TURN_WORD,
    after,
  );
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

/**
 * 溝の向こう側の行。**そこへ書き直したものが「裏返し」**。
 * 1 列に並ぶ形 (SIP) には向こう側が無い。
 */
function flippedRow(type: string, row: HoleRow): HoleRow | null {
  const kind = lookupFootprint(type)?.kind;
  if (kind === 'dip') return row === 'e' ? 'f' : 'e';
  if (kind !== 'board') return null;
  return rowAt((HOLE_ROWS.indexOf(row) + HOLE_ROWS.length / 2) % HOLE_ROWS.length);
}

/** アンカーを溝の向こう側の行へ書き直す (`@ e5` → `@ f5`)。 */
function flipByAnchor(source: string, found: Located, id: string): MoveResult {
  const anchor = found.addresses[0];
  const located = locateTokens(found.line, found.addresses, found.points);
  const token = located?.tokens[0];
  if (anchor === undefined || token === undefined) {
    return fail(`${safeToken(id)} の穴を行の中に見つけられませんでした`, found.part.line);
  }
  if (anchor.kind !== 'hole') {
    return fail(`${safeToken(id)} はレールに挿さっているので裏返せません`, found.part.line);
  }

  const row = flippedRow(found.part.type, anchor.row);
  if (row === null) {
    return fail(
      `${safeToken(id)} は裏返せません (1 列に並ぶので、裏返しても同じ穴に同じ順で挿さります)`,
      found.part.line,
    );
  }

  const edits: readonly Edit[] = [{
    line: found.part.line,
    column: token.column,
    length: token.length,
    text: formatAddress({ kind: 'hole', row, col: anchor.col }),
  }];
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

export function turnPart(source: string, id: string, quarters: number): MoveResult {
  // **この板で回せるのは半周だけ。** 4 分の 1 の要求は、奇数回なら半周に畳む
  // (2 回押せば元へ戻る)。90 度に相当する置き方がそもそも実物に無い。
  const anchored = anchoredTurn(source, id);
  if (anchored !== null) {
    return quarters % 2 === 0
      ? { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } }
      : turnByWord(source, anchored, id);
  }

  const grabbed = writtenLeadsAt(source, id, '回');
  if (!grabbed.ok) return { ok: false, error: grabbed.error };

  const { found, tokens } = grabbed;
  const anchor = found.addresses[0];
  if (anchor === undefined) return fail(`${safeToken(id)} の足がありません`, found.part.line);

  // **レールは行が極性そのもの。** 数に落ちないので回しようがない。
  const anchorRow = rowIndex(anchor);
  if (anchorRow === null || found.addresses.some((one) => rowIndex(one) === null)) {
    return fail(`${safeToken(id)} はレールに挿さっているので回せません (穴どうしなら回せます)`, found.part.line);
  }

  // **アンカー (先に書いた足) は動かさない。** 動かすと「回す」が「移動」になる。
  const landings: (Address | null)[] = found.addresses.map((one, index) => {
    if (index === 0) return null;
    const row = rowIndex(one);
    if (row === null) return null;
    const delta = spin({ row: row - anchorRow, col: one.col - anchor.col }, quarters);
    const landed = rowAt(anchorRow + delta.row);
    return landed === null ? null : { kind: 'hole', row: landed, col: anchor.col + delta.col };
  });

  for (const [index, landing] of landings.entries()) {
    if (index === 0) continue;
    if (landing === null || !isOnBoard(found.board, landing)) {
      return fail(`${safeToken(id)} を回すと板の外へ出ます`, found.part.line);
    }
  }

  // **一周は何もしない。** 同じ字を書き戻すと「動かしました」と嘘を言うことになる。
  const texts = landings.map((landing, index) => {
    const before = found.addresses[index];
    if (landing === null || before === undefined) return null;
    return formatAddress(landing) === formatAddress(before) ? null : formatAddress(landing);
  });
  if (texts.every((text) => text === null)) {
    return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  }

  const edits = editsFor(found.part.line, tokens, texts);
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

/**
 * 書かれた足の綴り全体。**極性の印まで含める** (`b12(A)`)。
 *
 * 番地だけを入れ替えると印がその場に残り、`b13(A) b12(K)` という**別の意味**の
 * 行になる (アノードが反対の穴へ移る)。裏返すのは部品なので、印も一緒に回る。
 */
function writtenSpan(
  lineText: string,
  token: { readonly column: number; readonly length: number },
): { readonly column: number; readonly length: number } {
  const after = lineText.slice(token.column + token.length);
  const tag = /^\([^)\s]*\)/.exec(after);
  return tag === null ? token : { column: token.column, length: token.length + tag[0].length };
}

export function flipPart(source: string, id: string): MoveResult {
  const anchored = anchoredTurn(source, id);
  if (anchored !== null) return flipByAnchor(source, anchored, id);

  const grabbed = writtenLeadsAt(source, id, '反転');
  if (!grabbed.ok) return { ok: false, error: grabbed.error };

  const { found } = grabbed;
  // 足の**並びを逆にする**。同じ穴を使うので、どの穴とどの穴がつながるかは
  // 変わらない (変わるのは、どちらの足がどちらの穴に挿さるか)。
  // 3 本足なら両端が入れ替わり、真ん中はその場に残る — 実物を裏返したときと同じ。
  //
  // **綴りごと入れ替える** — 番地に直すと `points:` の名前が外れ、
  // 印 (`(A)`) を置いていくと別の意味の行になる。
  const spans = grabbed.tokens.map((token) => writtenSpan(found.line, token));
  const spelling = (index: number): string => {
    const span = spans[index];
    return span === undefined ? '' : found.line.slice(span.column, span.column + span.length);
  };
  const texts = spans.map((_, index) => spelling(spans.length - 1 - index));

  const edits = editsFor(found.part.line, spans, texts);
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

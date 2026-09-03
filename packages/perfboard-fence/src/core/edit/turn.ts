import type { Edit } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import type { Address } from '../types.ts';
import { diffAfter } from './diff.ts';
import { isLocated, locatePart } from './move.ts';
import type { MoveResult } from './move.ts';
import { locateTokens } from './shared.ts';

/**
 * 足を書いて置く部品を回す・反転する。**フェンス本文 → 書き換えの並び**を返す純関数。
 *
 * **文法は変えない。** 足を並べて書く部品 (2 本足・3 本足) の向きは
 * **穴の順そのもの**なので、回すのは「先に書いた足のまわりに残りを 90 度動かす」、
 * 反転は「両端の入れ替え」で済む。
 *
 * **アンカー 1 つで置く形 (DIP / SIP / タクトスイッチ / ボード) は別の道。**
 * 足の位置を形が決めるので穴に向きが出ず、向きの語が要る (52 の docs/14)。
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
        found.lineNumber,
      ),
    };
  }

  const located = locateTokens(found.line, found.addresses, found.points);
  if (located === null) {
    return {
      ok: false as const,
      error: fenceError(`${safeToken(id)} の穴を行の中に見つけられませんでした`, found.lineNumber),
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

export function turnPart(source: string, id: string, quarters: number): MoveResult {
  const grabbed = writtenLeadsAt(source, id, '回');
  if (!grabbed.ok) return { ok: false, error: grabbed.error };

  const { found, tokens } = grabbed;
  const anchor = found.addresses[0];
  if (anchor === undefined) return fail(`${safeToken(id)} の足がありません`, found.lineNumber);

  // **アンカー (先に書いた足) は動かさない。** 動かすと「回す」が「移動」になる。
  // 格子が一様なので、回すのは行と列の差をそのまま回すだけ。
  const landings: (Address | null)[] = found.addresses.map((one, index) => {
    if (index === 0) return null;
    const delta = spin({ row: one.row - anchor.row, col: one.col - anchor.col }, quarters);
    return { row: anchor.row + delta.row, col: anchor.col + delta.col };
  });

  for (const [index, landing] of landings.entries()) {
    if (index === 0) continue;
    if (landing === null || !isOnBoard(found.board, landing)) {
      return fail(
        `${safeToken(id)} を回すと ${landing === null ? '足' : formatAddress(landing)} が板の外へ出ます`,
        found.lineNumber,
      );
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

  const edits = editsFor(found.lineNumber, tokens, texts);
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

export function flipPart(source: string, id: string): MoveResult {
  const grabbed = writtenLeadsAt(source, id, '反転');
  if (!grabbed.ok) return { ok: false, error: grabbed.error };

  const { found } = grabbed;
  // 足の**並びを逆にする**。同じ穴を使うので、どの穴とどの穴がつながるかは
  // 変わらない (変わるのは、どちらの足がどちらの穴に挿さるか)。
  // 3 本足なら両端が入れ替わり、真ん中はその場に残る — 実物を裏返したときと同じ。
  //
  // **書かれた綴りをそのまま入れ替える** — 組み直すと、手で整えた並びが
  // 黙って揃えられる。
  const spans = grabbed.tokens;
  const spelling = (index: number): string => {
    const span = spans[index];
    return span === undefined ? '' : found.line.slice(span.column, span.column + span.length);
  };
  const texts = spans.map((_, index) => spelling(spans.length - 1 - index));

  const edits = editsFor(found.lineNumber, spans, texts);
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

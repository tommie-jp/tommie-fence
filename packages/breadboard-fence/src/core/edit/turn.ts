import type { Edit } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, HoleRow } from '../types.ts';
import { diffAfter } from './diff.ts';
import { isLocated, locatePart } from './move.ts';
import type { MoveResult } from './move.ts';
import { locateTokens } from './shared.ts';

/**
 * 2 本足の部品を回す・反転する。**フェンス本文 → 書き換えの並び**を返す純関数。
 *
 * **文法は変えない。** 2 本足の向きは**穴の順そのもの**なので、回すのは
 * 「もう一方の足をアンカーの周りに 90 度動かす」、反転は「両端の入れ替え」で済む。
 *
 * **3 本足とタクトスイッチは回せない。** 1 つのアンカーで置く形は向きを表す語が
 * 要るが、この文法にはまだ無い (circuit は `r90` / `mirror` を足した。
 * こちらに入れるかは別の判断)。**黙って何もしない**のではなく、そう言って断る。
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

/** 掴んだ部品と、その 2 つの足。回すのも裏返すのもここを通る。 */
function twoLeadAt(source: string, id: string, what: string) {
  const found = locatePart(source, id);
  if (!isLocated(found)) return { ok: false as const, error: found.error };

  if (found.addresses.length !== 2) {
    return {
      ok: false as const,
      error: fenceError(
        `${safeToken(id)} は${what}せません (向きを書く語が文法にないので、${what}せるのは 2 本足の部品だけ)`,
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

export function turnPart(source: string, id: string, quarters: number): MoveResult {
  const grabbed = twoLeadAt(source, id, '回');
  if (!grabbed.ok) return { ok: false, error: grabbed.error };

  const { found, tokens } = grabbed;
  const [from, to] = found.addresses;
  if (from === undefined || to === undefined) return fail(`${safeToken(id)} の足がありません`, found.part.line);

  // **レールは行が極性そのもの。** 数に落ちないので回しようがない。
  const fromRow = rowIndex(from);
  const toRow = rowIndex(to);
  if (fromRow === null || toRow === null) {
    return fail(`${safeToken(id)} はレールに挿さっているので回せません (穴どうしなら回せます)`, found.part.line);
  }

  // **アンカー (先に書いた足) は動かさない。** 動かすと「回す」が「移動」になる。
  const delta = spin({ row: toRow - fromRow, col: to.col - from.col }, quarters);
  const row = rowAt(fromRow + delta.row);
  const landing: Address | null = row === null ? null : { kind: 'hole', row, col: from.col + delta.col };
  if (landing === null || !isOnBoard(found.board, landing)) {
    return fail(`${safeToken(id)} を回すと板の外へ出ます`, found.part.line);
  }

  // **一周は何もしない。** 同じ字を書き戻すと「動かしました」と嘘を言うことになる。
  if (formatAddress(landing) === formatAddress(to)) {
    return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  }

  const edits = editsFor(found.part.line, tokens, [null, formatAddress(landing)]);
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
  const grabbed = twoLeadAt(source, id, '反転');
  if (!grabbed.ok) return { ok: false, error: grabbed.error };

  const { found } = grabbed;
  // 足の入れ替え。**同じ 2 つの穴を使う**ので、どの穴とどの穴がつながるかは
  // 変わらない (変わるのは、どちらの足がどちらの穴に挿さるか = 極性)。
  // **綴りごと入れ替える** — 番地に直すと `points:` の名前が外れ、
  // 印 (`(A)`) を置いていくと別の意味の行になる。
  const spans = grabbed.tokens.map((token) => writtenSpan(found.line, token));
  const spelling = (index: number): string => {
    const span = spans[index];
    return span === undefined ? '' : found.line.slice(span.column, span.column + span.length);
  };

  const edits = editsFor(found.part.line, spans, [spelling(1), spelling(0)]);
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

import type { Edit } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';

import { footprintOf, pinsOf } from '../parts/footprint.ts';
import type { Address, FenceError } from '../types.ts';
import { MIRROR_WORD, isRotationWord, orientOf, rotationWord } from '../parts/orient.ts';
import type { Turn } from '../parts/orient.ts';
import { diffAfter } from './diff.ts';
import { isLocated, locatePart, offBoardCheck } from './move.ts';
import type { MoveResult } from './move.ts';
import { locateTokens } from './shared.ts';

/**
 * 足を書いて置く部品を回す・反転する。**フェンス本文 → 書き換えの並び**を返す純関数。
 *
 * **文法は変えない。** 足を並べて書く部品 (2 本足・3 本足) の向きは
 * **穴の順そのもの**なので、回すのは「先に書いた足のまわりに残りを 90 度動かす」、
 * 反転は「両端の入れ替え」で済む。
 *
 * **アンカー 1 つで置く形 (DIP / SIP) は語のほうを書き換える。** 足の位置を
 * 形が決めるので穴に向きが出ない (52 の docs/14)。使う人にとってはどちらも
 * 「回す」「裏返す」の 1 つの操作なので、違いはここで吸収する。
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
 * 軸にする足の番号。**名前で書かれた足があればそこ** — `points:` の名前は場所を
 * 指す約束なので、動かすと名前が外れる (番地に直すしかなくなり、あとで点を
 * 動かしても部品が付いてこない)。無ければ足の真ん中。
 */
function pivotIndex(
  lineText: string,
  tokens: readonly { readonly column: number; readonly length: number }[],
): number | null {
  const named = tokens.findIndex(
    (token) => parseAddress(lineText.slice(token.column, token.column + token.length)) === null,
  );
  return named < 0 ? null : named;
}

/**
 * 回す軸。**足の真ん中** — KiCad の `R` も選んだものの中心を軸にする。
 * 先に書いた足を軸にしていたころは、回すと胴が大きく振られて「移動」に見えた
 * (実機で指摘された)。
 *
 * **端から端への差を 0 に向けて丸める** (`trunc`)。番地は整数なので、足の間隔が
 * 奇数のときは真ん中が穴に来ない。0 に向けた丸めは符号の入れ替えと軸の入れ替えを
 * すり抜けるので、**軸が回っても同じ穴に留まる** — つまり 4 回回すと元に戻る
 * (真ん中に向かって丸めると、回すたびに軸が寄って戻らなくなる)。
 */
function pivotOf(addresses: readonly Address[]): Address | null {
  const first = addresses[0];
  const last = addresses[addresses.length - 1];
  if (first === undefined || last === undefined) return null;
  return {
    row: first.row + Math.trunc((last.row - first.row) / 2),
    col: first.col + Math.trunc((last.col - first.col) / 2),
  };
}

/**
 * 語で回す部品か。**語で回すなら向きを返し、番地で回すなら null。**
 * 読めなかったときだけ断りを返す (呼ぶ側がそのまま流す)。
 */
function anchoredTurn(
  source: string,
  id: string,
): { readonly ok: true; readonly turn: Turn } | { readonly ok: false; readonly error: FenceError } | null {
  const found = locatePart(source, id);
  if (!isLocated(found)) return { ok: false, error: found.error };
  return orientOf(found.part.type) === 'full' ? { ok: true, turn: found.part.turn } : null;
}

/**
 * 掴んだ部品と、その足。回すのも裏返すのもここを通る。
 *
 * **足を 2 つ以上書いている部品だけ**が通る。アンカー 1 つで置く形は
 * 手前で語の道へ分かれているので、ここへ来るのは向きの語も書けない形だけ —
 * 穴に向きが出ないことを言って断る。
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

/** 90 度を `quarters` 回したあとの角度。一周は元に戻る。 */
const spinBy = (rotate: Turn['rotate'], quarters: number): Turn['rotate'] =>
  ((((rotate / 90 + quarters) % 4) + 4) % 4) * 90 as Turn['rotate'];

/**
 * 向きの語を書き換える (アンカー 1 つで置く形)。**穴は動かさない** —
 * 1 つの穴を基準に置く形なので、変わるのは向きだけで場所は変わらない。
 *
 * 語は**最後の穴のすぐ後ろ**に足す (`ID: 種類 穴 [向き] [値]` の並び)。
 * 呼ぶ側は回転か反転の**どちらか一方だけ**を変える — 両方を一度に変えると、
 * 語が無いときに同じ桁へ 2 つ挿し込むことになる。
 */
function turnByWord(source: string, id: string, next: Turn): MoveResult {
  const found = locatePart(source, id);
  if (!isLocated(found)) return { ok: false, error: found.error };

  const located = locateTokens(found.line, found.addresses, found.points);
  const last = located?.tokens.at(-1);
  if (last === undefined) {
    return fail(`${safeToken(id)} の穴を行の中に見つけられませんでした`, found.lineNumber);
  }

  // **回した先が板の穴に落ちることを見る。** 落ちなければ図は描けず、
  // 掴んで回した人には帯だけが残る。番地で回すときと同じように、ここで断る。
  const footprint = footprintOf(found.part.type, found.part.variant);
  // **板から張り出す形だけが外に出られる** (`offBoardCheck`)。
  const outside = footprint === null
    ? null
    : offBoardCheck(found, pinsOf(footprint, found.addresses, found.board, next));
  if (outside !== null) {
    return fail(`${safeToken(id)} を回すと足が置けません (${outside})`, found.lineNumber);
  }

  const was = found.part.turn;
  const after = last.column + last.length;
  const tail = [...found.line.slice(after).matchAll(/\S+/g)]
    .map((match) => ({ column: after + (match.index ?? 0), length: match[0].length, text: match[0] }));

  const edits: Edit[] = [];
  if (next.rotate !== was.rotate) {
    edits.push(...wordEdit(found.lineNumber, tail.find((one) => isRotationWord(one.text)) ?? null,
      rotationWord(next.rotate), after));
  }
  if (next.mirror !== was.mirror) {
    edits.push(...wordEdit(found.lineNumber, tail.find((one) => one.text === MIRROR_WORD) ?? null,
      next.mirror ? MIRROR_WORD : '', after));
  }

  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

/**
 * 語を 1 つ書き換える編集。**無ければ足し、空にするなら前の空白ごと消す**
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

/**
 * 回す軸をどこに置くか。
 *
 * - `middle` (既定) — 足の真ん中。**掴んで回すとき**はこちら (KiCad と同じで、
 *   胴がその場で回る)
 * - `anchor` — 先に書いた足。**置く前に回すとき**はこちら。押した穴に足が来る
 *   のが置くときの約束なので、軸が動くと「押した穴に置けない」ことになる
 *   (KiCad も、運んでいる部品はカーソルを軸に回る)
 */
export type TurnAround = 'middle' | 'anchor';

export function turnPart(
  source: string,
  id: string,
  quarters: number,
  around: TurnAround = 'middle',
): MoveResult {
  const anchored = anchoredTurn(source, id);
  if (anchored !== null) {
    return anchored.ok
      ? turnByWord(source, id, { ...anchored.turn, rotate: spinBy(anchored.turn.rotate, quarters) })
      : { ok: false, error: anchored.error };
  }

  const grabbed = writtenLeadsAt(source, id, '回');
  if (!grabbed.ok) return { ok: false, error: grabbed.error };

  const { found, tokens } = grabbed;
  const named = pivotIndex(found.line, tokens);
  const pivot = around === 'anchor' || named !== null
    ? found.addresses[named ?? 0] ?? null
    : pivotOf(found.addresses);
  if (pivot === null) return fail(`${safeToken(id)} の足がありません`, found.lineNumber);

  // 格子が一様なので、回すのは軸からの行と列の差をそのまま回すだけ。
  const landings: Address[] = found.addresses.map((one) => {
    const delta = spin({ row: one.row - pivot.row, col: one.col - pivot.col }, quarters);
    return { row: pivot.row + delta.row, col: pivot.col + delta.col };
  });

  const why = offBoardCheck(found, landings);
  if (why !== null) return fail(`${safeToken(id)} を回すと足が置けません (${why})`, found.lineNumber);

  // **一周は何もしない。** 同じ字を書き戻すと「動かしました」と嘘を言うことになる。
  const texts = landings.map((landing, index) => {
    const before = found.addresses[index];
    if (before === undefined) return null;
    return formatAddress(landing) === formatAddress(before) ? null : formatAddress(landing);
  });
  if (texts.every((text) => text === null)) {
    return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  }

  const edits = editsFor(found.lineNumber, tokens, texts);
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

export function flipPart(source: string, id: string): MoveResult {
  const anchored = anchoredTurn(source, id);
  if (anchored !== null) {
    return anchored.ok
      ? turnByWord(source, id, { ...anchored.turn, mirror: !anchored.turn.mirror })
      : { ok: false, error: anchored.error };
  }

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

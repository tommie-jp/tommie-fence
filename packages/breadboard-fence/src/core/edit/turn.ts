import type { Edit } from 'fence-kit';
import { slideBy, slideInto } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { isOnBoard } from '../model/board.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, Board, HoleRow, RailRow } from '../types.ts';
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

/**
 * 上から下への行の並び。**レールも数に落とす。**
 *
 * レールは行が極性そのものなので数えていなかったが、そのせいで
 * **レールに挿した部品は回せなかった** (`Re: resistor -t20 e20` など)。
 * 実物の並びは上から `rails[0]` `rails[1]` a〜j `rails[2]` `rails[3]` なので、
 * そのまま並べれば穴と同じ勘定で回せる。レールの無い板 (mini) は穴だけ。
 */
type RowName = HoleRow | RailRow;

const rowOrder = (board: Board): readonly RowName[] =>
  (board.rails === null
    ? HOLE_ROWS
    : [board.rails[0], board.rails[1], ...HOLE_ROWS, board.rails[2], board.rails[3]]);

const nameOfRow = (address: Address): RowName =>
  (address.kind === 'hole' ? address.row : `${address.polarity}${address.side}`);

/** その番地の行の番号。並びに無ければ null。 */
const rowIndex = (order: readonly RowName[], address: Address): number | null => {
  const at = order.indexOf(nameOfRow(address));
  return at < 0 ? null : at;
};

/** 番号から番地へ。レールの行はレールの番地になる。 */
function addressAt(order: readonly RowName[], index: number, col: number): Address | null {
  const name = order[index];
  if (name === undefined) return null;
  if ((HOLE_ROWS as readonly string[]).includes(name)) return { kind: 'hole', row: name as HoleRow, col };
  const [polarity, side] = [...name] as ['+' | '-', 't' | 'b'];
  return { kind: 'rail', polarity, side, col };
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
    // **対称な形はそう言う。** タクトスイッチは回しても同じ穴どうしがつながる
    // ので、「向きが出ません」だと直しようのない断りに読める。
    const symmetric = lookupFootprint(found.part.type)?.kind === 'switch';
    return {
      ok: false as const,
      error: fenceError(
        symmetric
          ? `${safeToken(id)} は${what}しても同じ穴どうしがつながります (対称な形です)`
          : `${safeToken(id)} は${what}せません`
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
  return HOLE_ROWS[(HOLE_ROWS.indexOf(row) + HOLE_ROWS.length / 2) % HOLE_ROWS.length] ?? null;
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
 * 回す軸をどこに置くか。
 *
 * - `middle` (既定) — 足の真ん中。**掴んで回すとき**はこちら (KiCad と同じで、
 *   胴がその場で回る)
 * - `anchor` — 先に書いた足。**置く前に回すとき**はこちら。押した穴に足が来る
 *   のが置くときの約束なので、軸が動くと「押した穴に置けない」ことになる
 */
export type TurnAround = 'middle' | 'anchor';

export function turnPart(
  source: string,
  id: string,
  quarters: number,
  around: TurnAround = 'middle',
): MoveResult {
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
  const first = found.addresses[0];
  const last = found.addresses[found.addresses.length - 1];
  if (first === undefined || last === undefined) return fail(`${safeToken(id)} の足がありません`, found.part.line);

  // **レールも行の並びに入れて数える** (`rowOrder`)。挿さっていても回せる。
  const order = rowOrder(found.board);
  const firstRow = rowIndex(order, first);
  const lastRow = rowIndex(order, last);
  if (firstRow === null || lastRow === null || found.addresses.some((one) => rowIndex(order, one) === null)) {
    return fail(`${safeToken(id)} の行がこの板にありません (レールを剥がした板かもしれません)`, found.part.line);
  }

  // **もともとレールに居ない部品は、回してもレールへ移さない。** 電源に
  // つなぐのは回す操作の仕事ではない — 黙ってつながると回路の意味が変わる。
  // レールに挿さっている部品だけが、レールを含む並びの中で回る。
  const onRail = found.addresses.some((one) => one.kind === 'rail');
  const holesFrom = order.indexOf(HOLE_ROWS[0] as RowName);
  const range = onRail
    ? { least: 0, most: order.length - 1 }
    : { least: holesFrom, most: holesFrom + HOLE_ROWS.length - 1 };

  // **軸は足の真ん中** (KiCad の `R` も選んだものの中心を軸にする)。先に書いた足を
  // 軸にしていたころは、回すと胴が大きく振られて「移動」に見えた。
  // 丸めは 0 に向ける — 符号と軸の入れ替えをすり抜けるので、軸が回っても同じ穴に
  // 留まる (2 回押せば元に戻る)。
  const named = pivotIndex(found.line, tokens);
  const held = around === 'anchor' || named !== null ? found.addresses[named ?? 0] : undefined;
  const heldRow = held === undefined ? null : rowIndex(order, held);
  const pivotRow = held !== undefined && heldRow !== null
    ? heldRow
    : firstRow + Math.trunc((lastRow - firstRow) / 2);
  const pivotCol = held === undefined
    ? first.col + Math.trunc((last.col - first.col) / 2)
    : held.col;

  const turned = found.addresses.map((one) => {
    const row = rowIndex(order, one) ?? 0;
    const delta = spin({ row: row - pivotRow, col: one.col - pivotCol }, quarters);
    return { row: pivotRow + delta.row, col: pivotCol + delta.col };
  });

  // **板から出たら寄せ直す。回転そのものは断らない。** 縁に置いた部品を回すと
  // 足が外へ出るが、断ると「この部品は回らない」に見える (実機で
  // 「capacitor, inductor などほとんど回転できない」と言われたのがこれで、
  // 実は部品の種類ではなく**置いた行**で決まっていた)。足りない分だけ寄せる
  // ので、板に載っている回し方は 1 穴も動かない。
  //
  // **置く前 (`anchor`) は寄せない。** 押した穴に足が来るのが置くときの約束で、
  // 寄せると「押した穴に置けない」ことになる。入らないときは断り、
  // ゴーストを赤で見せる側 (`session.ts`) に任せる。
  const slide = around === 'anchor'
    ? { row: 0, col: 0 }
    : slideInto(turned, range, { least: 1, most: found.board.columns });
  if (slide === null) {
    return fail(`${safeToken(id)} は回しても板に収まりません`, found.part.line);
  }

  const landings: (Address | null)[] = slideBy(turned, slide)
    .map((one) => addressAt(order, one.row, one.col));

  for (const landing of landings) {
    if (landing === null || !isOnBoard(found.board, landing)) {
      return fail(`${safeToken(id)} を回すと板の外へ出ます`, found.part.line);
    }
    // **もともとレールに居ない部品をレールへ移さない。** 黙って電源に
    // つながると回路の意味が変わる (つなぐのは配線の仕事)。
    if (!onRail && landing.kind === 'rail') {
      return fail(`${safeToken(id)} を回すと足がレールに入ります (穴の中で回せる向きにします)`, found.part.line);
    }
  }
  // **同じレール行に 2 本は挿さない。** その行は丸ごと 1 本の電位なので、
  // 回した先が短絡した図になる (置くときと同じ見方。`insert.ts` の `onOneRail`)。
  const rails = landings.filter((one) => one?.kind === 'rail').map((one) => formatAddress(one as Address).slice(0, 2));
  if (new Set(rails).size !== rails.length) {
    return fail(`${safeToken(id)} を回すと足が 2 本とも同じレールに入ります (短絡になります)`, found.part.line);
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
  // **入れ替えるのは番地だけ。印 (`b12(A)`) はその場に残す。**
  // 印まで一緒に動かすと `b13(K) b12(A)` になり、**書き方が変わるだけで
  // 意味は元のまま** — カソードは同じ穴に挿さったままなので、押しても図が
  // 変わらない (実機で「varicap が反転できない」と言われたのがこれ。
  // 印を書いた部品ぜんぶ — ダイオードの仲間・LED・電解・3 本足 — が効かなかった)。
  // 印を置いていけば `b12(K) b13(A)`、つまりカソードが反対の穴へ移る。
  // これが実物を裏返したときに起きること。
  //
  // 番地の綴りはそのまま持っていく — `points:` の名前で書かれた足を番地に
  // 直すと名前が外れ、あとで点を動かしても部品が付いてこなくなる。
  const spans = grabbed.tokens;
  const spelling = (index: number): string => {
    const span = spans[index];
    return span === undefined ? '' : found.line.slice(span.column, span.column + span.length);
  };
  const texts = spans.map((_, index) => spelling(spans.length - 1 - index));

  const edits = editsFor(found.part.line, spans, texts);
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

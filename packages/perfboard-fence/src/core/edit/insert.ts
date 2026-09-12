import {
  appendUnderKey, applyEdits, applyLineEdits, FLOW_REFUSAL, isFlowKey, keysUnder, leadOffsets, needsRoom,
  normalizeNewlines, orientInserted, wireColor,
} from 'fence-kit';
import type { LineEdit, NetDiff } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { formatAddress } from '../model/address.ts';
import { DEFAULT_BOARD_SIZE, isOnBoard, isSolderable } from '../model/board.ts';
import { parseFence } from '../parser/parseFence.ts';
import { holesOf, partPrefix } from '../parts/catalog.ts';
import { resolveTypeName, splitPartType } from '../parts/types.ts';
import type { Address, Board, FenceError } from '../types.ts';
import { diffAfterLines } from './diff.ts';
import { locateTokens } from './shared.ts';
import { flipPart, turnPart } from './turn.ts';
import { placeParts } from '../placement/place.ts';
import { isLocated, locatePart, stepCell } from './move.ts';

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
 * 本文が始まる行 (1 始まり)。**YAML の文書開始記号 (`---`)・ディレクティブ
 * (`%YAML`)・頭のコメント・空行を越えた、最初の中身の行。**
 *
 * `board:` をここより上へ入れると、読めていたフェンスが読めなくなる
 * (`---` の上に書くと「Source contains multiple documents」)。**書き足しが
 * 読めなくするなら、止めないために入れた枝が自分で穴を開けたことになる。**
 * 中身が 1 行も無ければ 1 行目 (空のフェンスに最初の 1 つを置くとき)。
 */
function bodyStart(lines: readonly string[]): number {
  const at = lines.findIndex((text) => {
    const trimmed = text.trim();
    return trimmed !== '' && !trimmed.startsWith('#') && !trimmed.startsWith('%')
      && trimmed !== '---' && trimmed !== '...';
  });
  return at === -1 ? 1 : at + 1;
}

/** 頭のキーとしての `board:`。**字下げされた `board:` は数えない** (機器の名前でありうる)。 */
const hasBoardKey = (lines: readonly string[]): boolean => lines.some((text) => /^board\s*:/.test(text));

/**
 * `board:` が書かれていなければ、**本文の頭に 1 行書き足す**。
 *
 * この板は穴の数が `board:` でしか決まらないので、書いていないフェンスは
 * 既定の板 (`DEFAULT_BOARD`) で読んでいる。そこへ部品だけ足すと、**図は出るのに
 * board: が要ると言われ続ける**フェンスが残る。最初に置いたときに書いてしまえば、
 * 読み直した板と書いてある板が一致する (52 の docs/54 の決め 6)。
 *
 * 先に返すので `applyLineEdits` が同じ行への差し込みを**この順で**並べる。
 */
const boardLine = (lines: readonly string[]): readonly LineEdit[] =>
  hasBoardKey(lines) ? [] : [{ kind: 'insert', line: bodyStart(lines), text: `board: ${DEFAULT_BOARD_SIZE}` }];

/**
 * 端点から端点へ 1 本。**色は色見本で選んでいるときだけ書く** (実機で
 * 「色パレットから色を選択した後、配線するとその色で配線できるようにする」)。
 * 選んでいなければ書かない — 既定の色で引いて、あとから欄で直せる。
 */
export function insertWire(source: string, from: Address, to: Address, color?: string): AdditionResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);

  const board = doc.board;
  for (const end of [from, to]) {
    // **配線の端は半田付けできる所なら通す。** 穴のほかにスロットの銅箔がある
    // (実物のスロットは電源を引き回すために付いている)。置く先は穴だけ。
    if (!isSolderable(board, end)) return fail(`${formatAddress(end)} は板の外です`, null);
  }
  // 長さ 0 の線は図に出ない (押し間違いでしか生まれない)。
  if (formatAddress(from) === formatAddress(to)) {
    return fail(`両端が同じ穴です (${formatAddress(from)})`, null);
  }

  const lines = normalized.split('\n');
  if (isFlowKey(lines, 'wires')) return fail(`配線: ${FLOW_REFUSAL.replace('消せません', '足せません')}`, null);

  const last = doc.wires.reduce((deepest, wire) => Math.max(deepest, wire.line ?? 0), 0);
  // **色は色見本で選んだものだけ書く。** 知らない名前は書かない — 書式エラーの
  // 行を作るより、既定の色で引いておくほうが figure が読める
  // (色は属性の欄からいつでも直せる)。
  const inked = color !== undefined && wireColor(color) !== null ? ` ${color}` : '';
  const written = `- ${formatAddress(from)} -- ${formatAddress(to)}${inked}`;
  const added = [...boardLine(lines), ...appendUnderKey(lines, 'wires', last, written)];

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
    // **置く前の回しは押した穴を軸に。** 軸が動くと、押した穴に足が来ない。
    turn: (placed, quarters) => turnPart(placed, part.id, quarters, 'anchor'),
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
  // **姿つきの綴りも引ける** (`sma/female-edge`)。欄に出るのは書かれた綴りそのもの。
  const prefix = partPrefix(baseTypeOf(type));
  if (prefix === null) return null;

  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  // **読めなかった行の名前も使用中。** 種類の綴りを間違えた行は部品として
  // 数えられないので、名前だけを見ると空いていることになり、同じ名前の行を
  // 足してしまう (52 の docs/53)。字のほうからも名前を採る。
  // 機器も同じ `parts:` の下に書くので、字から採ると名前が 1 つの入れ物で揃う
  // (機器は別の並び `doc.devices` に入るため、読めた部品だけでは数えられない)。
  const used = new Set([
    ...doc.parts.map((part) => part.id),
    ...keysUnder(normalized.split('\n'), 'parts'),
  ]);
  for (let number = 1; number <= LIMITS.parts + 1; number += 1) {
    const id = `${prefix}${number}`;
    if (!used.has(id)) return id;
  }
  return null;
}

/**
 * 置いた行を**読み直して**、その部品がフェンスに現れたか。
 *
 * **「置きました」と言って何も増えないのが一番わるい。** 根がマップでない本文
 * (ただの字・並び) へ行を足すと、足した行ごと読めなくなる。読めた所を返す形に
 * した以上、その代償は黙って払わずに理由を言う (52 の docs/54)。
 *
 * **試し当て (ゴースト) では見ない** — 穴をまたぐたびに 1 回読み直すことになる。
 */
const LANDED = '置いた行を読み直せませんでした (フェンスの形を直してから置きます)';

function landed(source: string, lines: readonly LineEdit[], id: string): boolean {
  return parseFence(applyLineEdits(source, lines)).doc.parts.some((one) => one.id === id);
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

  // **書かれた綴りはそのまま行に書き、足の数は種類から引く**。
  const written = resolveTypeName(part.type);
  const type = baseTypeOf(part.type);
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
  const added = [...boardLine(lines), ...appendUnderKey(lines, 'parts', last, `${part.id}: ${written} ${holes}`)];

  // **穴 1 つで置く形 (DIP / SIP) は、足が書かれた穴より広がる。** 板に載るか
  // どうかは並べてみないと分からないので、置いた姿を読み直して確かめる
  // (足を並べて書く部品は上の `isOnBoard` で済んでいる)。
  if (wanted === 1 && partCells(applyLineEdits(normalized, added), part.id).length === 0) {
    return fail(`${part.type} は ${spelled[0] ?? ''} には収まりません (板から出ます)`, null);
  }

  if (part.preview !== true && !landed(normalized, added, part.id)) return fail(LANDED, null);
  return oriented(normalized, part, added);
}

/** 姿を落とした種類の名前 (`sma/female-edge` → `sma`)。 */
const baseTypeOf = (written: string): string => splitPartType(written).type;

/** その部品が使っている穴 (書かれた綴り)。ゴーストの光らせ先。無ければ空。 */
export function partCells(source: string, id: string): readonly string[] {
  const { doc } = parseFence(normalizeNewlines(source));
  const part = doc.parts.find((one) => one.id === id);
  if (part === undefined) return [];
  const placed = placeParts([part], doc.board).parts[0];
  return placed === undefined ? [] : placed.pins.map((pin) => formatAddress(pin.address));
}

/**
 * 部品をもう 1 つ。**行をそのまま写して、名前と穴だけ差し替える。**
 *
 * 種類・姿・値・書き方 (空白や `points:` の名前) がそのまま残るので、
 * 足の並びを組み直す必要が無い — 端面実装のコネクタや DIP のように
 * **足の並びが形で決まる部品**も、写せば正しい姿のままになる。
 * 置き直す形にすると、その並びを作り直せない部品ができる。
 *
 * ずらすのは**斜めに 1 穴**。重ねると、増えたことが図で分からない。
 */
export function duplicatePart(source: string, id: string, newId: string): AdditionResult {
  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc.parts.some((one) => one.id === newId)) {
    return fail(`その名前はもう使われています: ${newId}`, null);
  }

  const found = locatePart(normalized, id);
  if (!isLocated(found)) return { ok: false, error: found.error };

  const located = locateTokens(found.line, found.addresses, found.points);
  if (located === null) return fail(`${safeToken(id)} の穴を行の中に見つけられませんでした`, null);

  const moved = located.tokens.map((token) => {
    const written = found.line.slice(token.column, token.column + token.length);
    return stepCell(written, 1, 1);
  });
  const stuck = moved.indexOf(null);
  if (stuck >= 0) {
    return fail(`${safeToken(id)} の隣に置く場所がありません`, found.lineNumber);
  }

  // 穴の綴りを差し替えてから、鍵 (名前) を新しいものにする。
  const shifted = applyEdits(found.line, located.tokens.map((token, index) => ({
    line: 1, column: token.column, length: token.length, text: moved[index] ?? '',
  })));
  const renamed = shifted.replace(/^(\s*)[^\s:]+\s*:/, `$1${newId}:`);

  const lines = normalized.split('\n');
  if (isFlowKey(lines, 'parts')) return fail(`部品: ${FLOW_REFUSAL.replace('消せません', '足せません')}`, null);

  const last = doc.parts.reduce((deepest, one) => Math.max(deepest, one.line ?? 0), 0);
  // **複製も「置く」の一種**なので、`board:` が無ければ同じように書き足す。
  const added = [...boardLine(lines), ...appendUnderKey(lines, 'parts', last, renamed.trim())];
  return { ok: true, value: { edits: [], lines: added, diff: diffAfterLines(normalized, added) } };
}

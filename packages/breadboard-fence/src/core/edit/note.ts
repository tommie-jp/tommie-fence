import { FLOW_REFUSAL, dropLines, isKeyLine, keyLineOf } from 'fence-kit';
import type { Edit, LineEdit, NetDiff, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { normalizeNewlines } from '../newlines.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { createBoard, isOnBoard } from '../model/board.ts';
import { NOTE_MIRROR_WORD, noteRotationWord } from '../notes.ts';
import type { NoteTurn } from '../notes.ts';
import { parseFence } from '../parser/parseFence.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, FenceError, NoteSpec } from '../types.ts';
import { diffAfter, diffAfterLines } from './diff.ts';

/**
 * 注釈を掴んで動かす。
 *
 * **注釈には名前が無いので、掴み手は書かれた行**にする (`note:7`)。配線と同じ
 * 考え方で、部品と同じ `data-part` に載せる — そうすると殻は注釈を部品として
 * 扱えて、**選ぶ・動かす・複製する・消す・欄を直すがそのまま通る**。
 *
 * **部品を指している注釈は動かさない。** `- circle R1` の指し先を番地に
 * 書き換えると名前が外れ、あとで部品を動かしても注釈が付いてこなくなる
 * (部品の回す軸を名前のある足に置いたのと同じ理由)。動かすなら部品のほうを動かす。
 */

const HANDLE = 'note:';

export const isNoteHandle = (handle: string): boolean => handle.startsWith(HANDLE);

export function noteLineOf(handle: string): number | null {
  if (!isNoteHandle(handle)) return null;
  const line = Number(handle.slice(HANDLE.length));
  return Number.isInteger(line) && line > 0 ? line : null;
}

type Found = { readonly note: NoteSpec; readonly line: number; readonly text: string; readonly lines: readonly string[] };
type Problem = { readonly problem: string; readonly line: number | null };

type NoteResult =
  | {
    readonly ok: true;
    readonly value: {
      readonly edits: readonly Edit[]; readonly lines?: readonly LineEdit[]; readonly diff: NetDiff;
    };
  }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): NoteResult => ({ ok: false, error: fenceError(message, line) });

function locate(source: string, handle: string): Found | Problem {
  const line = noteLineOf(handle);
  if (line === null) return { problem: `注釈の名札を読めません: ${safeToken(handle)}`, line: null };

  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return { problem: 'フェンスを読めないので直せません (先にエラーを直します)', line };

  const note = doc.notes.find((one) => one.line === line);
  if (note === undefined) return { problem: `${line} 行目に注釈がありません`, line };
  if (note.place !== null) return { problem: `${line} 行目の注釈は図の外に出るので掴めません`, line };

  const lines = normalized.split('\n');
  return { note, line, text: lines[line - 1] ?? '', lines };
}

const isFound = (one: Found | Problem): one is Found => 'note' in one;

/** 書かれた綴りの場所。前から順に探すので、同じ綴りが 2 つでも取り違えない。 */
function tokensOf(text: string, written: readonly string[]): readonly Span[] {
  const spans: Span[] = [];
  let cursor = 0;
  for (const one of written) {
    const column = text.indexOf(one, cursor);
    if (column < 0) return [];
    spans.push({ line: 0, column, length: one.length });
    cursor = column + one.length;
  }
  return spans;
}

/** その注釈が占める穴。番地で書かれた指し先だけ (部品を指しているものは空)。 */
export function noteCells(source: string, handle: string): readonly string[] {
  const found = locate(source, handle);
  if (!isFound(found)) return [];
  return found.note.targets
    .map((one) => parseAddress(one))
    .filter((one): one is Address => one !== null)
    .map(formatAddress);
}

export function noteSpans(source: string, handle: string): readonly Span[] {
  const found = locate(source, handle);
  if (!isFound(found)) return [];
  return [{ line: found.line, column: 0, length: found.text.length }];
}

/**
 * 注釈を動かす。**書かれた番地を全部ずらす** — `box` と `arrow` と `line` は
 * 2 点で形が決まるので、片方だけ動かすと形が変わってしまう。
 */
export function moveNote(source: string, handle: string, to: Address, trial = false): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);

  const named = found.note.targets.find((one) => parseAddress(one) === null);
  if (named !== undefined) {
    return fail(
      `${safeToken(named)} を指している注釈は動かせません (指し先の名前が外れます。${safeToken(named)} のほうを動かします)`,
      found.line,
    );
  }
  const anchor = parseAddress(found.note.targets[0] ?? '');
  if (anchor === null) return fail(`${found.line} 行目の注釈に指し先がありません`, found.line);
  // **レールは行が極性そのもの**で数に落ちない。穴どうしでだけ動かす。
  if (anchor.kind !== 'hole' || to.kind !== 'hole') {
    return fail('注釈はレールへは動かせません (穴どうしなら動かせます)', found.line);
  }

  const board = boardOf(parseFence(normalizeNewlines(source)).doc?.board ?? null);
  const delta = {
    row: HOLE_ROWS.indexOf(to.row) - HOLE_ROWS.indexOf(anchor.row),
    col: to.col - anchor.col,
  };
  const landings = found.note.targets.map((one) => {
    const at = parseAddress(one);
    return at === null ? null : moved(at, delta);
  });
  for (const landing of landings) {
    if (landing === null) return fail(`${found.line} 行目の注釈の番地を読めません`, found.line);
    if (board !== null && !isOnBoard(board, landing)) {
      return fail(`注釈を動かすと ${formatAddress(landing)} が板の外です`, found.line);
    }
  }

  const spans = tokensOf(found.text, found.note.targets);
  if (spans.length !== found.note.targets.length) {
    return fail(`${found.line} 行目の注釈の指し先を行の中に見つけられませんでした`, found.line);
  }
  const edits: Edit[] = spans.map((span, index) => ({
    line: found.line,
    column: span.column,
    length: span.length,
    text: formatAddress(landings[index] as Address),
  }));
  return { ok: true, value: { edits, diff: trial ? { lost: [], gained: [] } : diffAfter(source, edits) } };
}

/** 番地をずらす。**レールは行が極性そのもの**で数に落ちないので、動かさない。 */
const moved = (at: Address, delta: { readonly row: number; readonly col: number }): Address | null => {
  if (at.kind !== 'hole') return null;
  const row = HOLE_ROWS[HOLE_ROWS.indexOf(at.row) + delta.row];
  return row === undefined ? null : { kind: 'hole', row, col: at.col + delta.col };
};

/** 注釈をもう 1 つ。**1 穴ずらす** — 重ねると増えたことが図で分からない。 */
export function duplicateNote(source: string, handle: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);

  const spans = tokensOf(found.text, found.note.targets);
  if (spans.length !== found.note.targets.length) {
    return fail(`${found.line} 行目の注釈の指し先を行の中に見つけられませんでした`, found.line);
  }

  let copy = found.text;
  for (const [index, span] of [...spans.entries()].reverse()) {
    const at = parseAddress(found.note.targets[index] ?? '');
    // 部品を指しているところは名前のまま写す (名前は外さない)。
    const next = at === null ? null : moved(at, { row: 1, col: 0 });
    if (next !== null) copy = copy.slice(0, span.column) + formatAddress(next) + copy.slice(span.column + span.length);
  }

  const lines: LineEdit[] = [{ kind: 'insert', line: found.line, text: copy }];
  return { ok: true, value: { edits: [], lines, diff: diffAfterLines(source, lines) } };
}

/** 注釈を消す。**その 1 行を落とす** (最後の 1 つなら `notes:` の行ごと)。 */
export function deleteNote(source: string, handle: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  if (isKeyLine(found.lines[found.line - 1], 'notes')) return fail(`注釈: ${FLOW_REFUSAL}`, found.line);

  const normalized = normalizeNewlines(source);
  const notes = parseFence(normalized).doc?.notes ?? [];
  const drop = new Set<number>([found.line]);
  if (notes.every((one) => one.line === found.line)) drop.add(keyLineOf(found.lines, 'notes'));

  const lines = dropLines(drop);
  return { ok: true, value: { edits: [], lines, diff: diffAfterLines(normalized, lines) } };
}

/** 注釈の欄。直せるのは `text` の字だけ (種類を変えると指し先の数が変わる)。 */
export function noteFields(source: string, handle: string) {
  const found = locate(source, handle);
  if (!isFound(found)) return null;
  return {
    id: `注釈 (${found.line} 行目)`,
    type: found.note.kind,
    value: found.note.text ?? '',
    label: '',
    // 注釈の色は語で書く (欄からは直せない)。殻の形に合わせて空で返す。
    color: '',
    can: found.note.kind === 'text' ? (['value'] as const) : ([] as const),
  };
}

/** 字を書き換える。**`: ` の後ろが字**なので、そこから行末までを差し替える。 */
export function setNoteField(source: string, handle: string, field: string, text: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  if (field !== 'value') return fail(`注釈に直せる欄は字だけです (${safeToken(field)} は直せません)`, found.line);
  if (found.note.kind !== 'text') return fail(`${found.note.kind} の注釈に字はありません`, found.line);

  const colon = found.text.indexOf(': ');
  if (colon < 0) return fail(`${found.line} 行目の注釈に : がありません`, found.line);

  const from = colon + 2;
  const edits: Edit[] = [{ line: found.line, column: from, length: found.text.length - from, text }];
  return { ok: true, value: { edits, diff: diffAfter(source, edits) } };
}

/** いま書かれている向きの語と、その場所。無ければ `: ` の直前に足す。 */
function turnWords(found: Found): { readonly column: number; readonly length: number } {
  const words = [noteRotationWord(found.note.turn.rotate), found.note.turn.mirror ? NOTE_MIRROR_WORD : '']
    .filter((one) => one !== '');
  if (words.length === 0) {
    const colon = found.text.indexOf(': ');
    return { column: colon < 0 ? found.text.length : colon, length: 0 };
  }
  const spans = tokensOf(found.text, words);
  const first = spans[0];
  const last = spans[spans.length - 1];
  return first === undefined || last === undefined
    ? { column: found.text.length, length: 0 }
    : { column: first.column, length: last.column + last.length - first.column };
}

/** 向きの語を書き換える編集。語が無ければ `: ` の前に足す。 */
function rewriteTurn(found: Found, turn: NoteTurn): NoteResult {
  const at = turnWords(found);
  const words = [noteRotationWord(turn.rotate), turn.mirror ? NOTE_MIRROR_WORD : ''].filter((one) => one !== '');
  // 語を足すときは前に空白を 1 つ。消すときは前の空白ごと落とす。
  const empty = words.length === 0;
  const before = found.text.slice(0, at.column).endsWith(' ') ? 1 : 0;
  const column = empty || at.length > 0 ? at.column - (empty ? before : 0) : at.column;
  const length = at.length + (empty ? before : 0);
  const text = empty ? '' : `${at.length > 0 ? '' : ' '}${words.join(' ')}`;

  const edits: Edit[] = [{ line: found.line, column, length, text }];
  return { ok: true, value: { edits, diff: { lost: [], gained: [] } } };
}

/** 注釈を回す。**回るのは字だけ** — 印や枠には向きが無いので断る。 */
export function turnNote(source: string, handle: string, quarters: number): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  if (found.note.kind !== 'text') {
    return fail(`${found.note.kind} の注釈は回せません (向きがあるのは text だけです)`, found.line);
  }
  const steps = (((found.note.turn.rotate / 90 + quarters) % 4) + 4) % 4;
  const rotate = (steps * 90) as NoteTurn['rotate'];
  if (rotate === found.note.turn.rotate) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  return rewriteTurn(found, { ...found.note.turn, rotate });
}

/**
 * 注釈を反転する。**字は裏返さない** — 鏡文字は読めないので、指し先の
 * 反対側へ移す (上に何かあって重なるときに下へ逃がすためのもの)。
 */
export function flipNote(source: string, handle: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  if (found.note.kind !== 'text') {
    return fail(`${found.note.kind} の注釈は反転できません (向きがあるのは text だけです)`, found.line);
  }
  return rewriteTurn(found, { ...found.note.turn, mirror: !found.note.turn.mirror });
}

/** `board:` に書かれた指定から板を組む。書かれていなければ既定の板。 */
const boardOf = (spec: Parameters<typeof createBoard>[0] | null): ReturnType<typeof createBoard> | null =>
  (spec === null ? null : createBoard(spec));

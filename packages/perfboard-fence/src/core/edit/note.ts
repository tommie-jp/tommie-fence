import { FLOW_REFUSAL, dropLines, isKeyLine, keyLineOf, normalizeNewlines } from 'fence-kit';
import type { Edit, LineEdit, NetDiff, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { isSolderable } from '../model/board.ts';
import { createBoard } from '../model/board.ts';
import { MIRROR_WORD, NO_TURN, rotationWord } from '../parts/orient.ts';
import type { Turn } from '../parts/orient.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { Address, FenceError, NoteSpec } from '../types.ts';
import { diffAfter, diffAfterLines } from './diff.ts';

/**
 * 注釈を掴んで動かす。
 *
 * **注釈には名前が無いので、掴み手は書かれた行**にする (`note:7`)。配線と同じ
 * 考え方で、部品と同じ `data-part` に載せる — そうすると殻は注釈を部品として
 * 扱えて、**選ぶ・動かす・複製する・消す・欄を直すがそのまま通る**
 * (`FenceEditor` に注釈用の口を 6 つ足すより、ここで名札を振り分けるほうが
 * 3 つのフェンスで足す量が少ない)。
 *
 * **向きは無い。** 字にも印にも表と裏が無いので、回す・反転するは理由を言って断る。
 */

const HANDLE = 'note:';

export const isNoteHandle = (handle: string): boolean => handle.startsWith(HANDLE);

/** 名札の行番号。読めなければ null。 */
export function noteLineOf(handle: string): number | null {
  if (!isNoteHandle(handle)) return null;
  const line = Number(handle.slice(HANDLE.length));
  return Number.isInteger(line) && line > 0 ? line : null;
}

type Found = {
  readonly note: NoteSpec;
  readonly line: number;
  readonly text: string;
  readonly lines: readonly string[];
};

type NoteResult =
  | { readonly ok: true; readonly value: { readonly edits: readonly Edit[]; readonly lines?: readonly LineEdit[]; readonly diff: NetDiff } }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, line: number | null): NoteResult =>
  ({ ok: false, error: fenceError(message, line) });

/** 掴み手が指している注釈。板の上に出るものだけ (書き出しと部品表は掴めない)。 */
function locate(source: string, handle: string): Found | { readonly problem: string; readonly line: number | null } {
  const line = noteLineOf(handle);
  if (line === null) return { problem: `注釈の名札を読めません: ${safeToken(handle)}`, line: null };

  const normalized = normalizeNewlines(source);
  const { doc } = parseFence(normalized);
  if (doc === null) return { problem: 'フェンスを読めないので直せません (先にエラーを直します)', line };

  const note = doc.notes.find((one) => one.line === line);
  if (note === undefined) return { problem: `${line} 行目に注釈がありません`, line };
  if (note.from === null) return { problem: `${line} 行目の注釈は板の外に出るので掴めません`, line };

  const lines = normalized.split('\n');
  const text = lines[line - 1] ?? '';
  return { note, line, text, lines };
}

const isFound = (one: ReturnType<typeof locate>): one is Found => 'note' in one;

/** 書かれた番地の綴りの場所。前から順に探すので、同じ綴りが 2 つでも取り違えない。 */
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

/** その注釈が書いている番地 (綴りのまま)。 */
const writtenAddresses = (note: NoteSpec): readonly string[] =>
  [note.from, note.to].filter((one): one is string => one !== null);

/** その注釈が占める穴。殻はこれをゴーストに使う。 */
export function noteCells(source: string, handle: string): readonly string[] {
  const found = locate(source, handle);
  if (!isFound(found)) return [];
  return writtenAddresses(found.note)
    .map((written) => parseAddress(written))
    .filter((one): one is Address => one !== null)
    .map(formatAddress);
}

/** その注釈が書かれている場所。エディタで光らせるのに使う。 */
export function noteSpans(source: string, handle: string): readonly Span[] {
  const found = locate(source, handle);
  if (!isFound(found)) return [];
  return [{ line: found.line, column: 0, length: found.text.length }];
}

/**
 * 注釈を動かす。**書かれた番地を全部ずらす** — `box` と `arrow` は 2 点で
 * 形が決まるので、片方だけ動かすと形が変わってしまう。
 */
export function moveNote(source: string, handle: string, to: Address, trial = false): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);

  const written = writtenAddresses(found.note);
  const anchor = parseAddress(written[0] ?? '');
  if (anchor === null) return fail(`${found.line} 行目の注釈の番地を読めません`, found.line);

  const board = boardOf(source);
  const delta = { row: to.row - anchor.row, col: to.col - anchor.col };
  const landings = written.map((one) => {
    const at = parseAddress(one);
    return at === null ? null : { row: at.row + delta.row, col: at.col + delta.col };
  });
  if (landings.some((one) => one === null)) return fail(`${found.line} 行目の注釈の番地を読めません`, found.line);
  for (const landing of landings) {
    if (landing !== null && board !== null && !isSolderable(board, landing)) {
      return fail(`注釈を動かすと ${formatAddress(landing)} が板の外です`, found.line);
    }
  }

  const spans = tokensOf(found.text, written);
  if (spans.length !== written.length) return fail(`${found.line} 行目の注釈の番地を行の中に見つけられませんでした`, found.line);

  const edits: Edit[] = spans.map((span, index) => ({
    line: found.line,
    column: span.column,
    length: span.length,
    text: formatAddress(landings[index] as Address),
  }));
  return { ok: true, value: { edits, diff: trial ? { lost: [], gained: [] } : diffAfter(source, edits) } };
}

/** 板の大きさ。読めなければ null (そのときは板の外かどうかを見ない)。 */
function boardOf(source: string): ReturnType<typeof createBoard> | null {
  const { doc } = parseFence(normalizeNewlines(source));
  return doc?.board ?? null;
}

/**
 * 注釈をもう 1 つ。**行を写して番地だけ 1 つずらす** — 重ねて置くと、
 * 増えたことが図で分からない (部品の複製と同じ理由)。
 */
export function duplicateNote(source: string, handle: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);

  const written = writtenAddresses(found.note);
  const spans = tokensOf(found.text, written);
  if (spans.length !== written.length) return fail(`${found.line} 行目の注釈の番地を行の中に見つけられませんでした`, found.line);

  let copy = found.text;
  for (const [index, span] of [...spans.entries()].reverse()) {
    const at = parseAddress(written[index] ?? '');
    if (at === null) return fail(`${found.line} 行目の注釈の番地を読めません`, found.line);
    const moved = formatAddress({ row: at.row + 1, col: at.col });
    copy = copy.slice(0, span.column) + moved + copy.slice(span.column + span.length);
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
  const { doc } = parseFence(normalized);
  const drop = new Set<number>([found.line]);
  if ((doc?.notes ?? []).every((one) => one.line === found.line)) drop.add(keyLineOf(found.lines, 'notes'));

  const lines = dropLines(drop);
  return { ok: true, value: { edits: [], lines, diff: diffAfterLines(normalized, lines) } };
}

/**
 * 注釈の欄。**種類は読むだけ** (`text` を `box` に変えると番地の数が変わる)。
 * 直せるのは言葉だけで、`text` 以外は直すものが無い。
 */
export function noteFields(source: string, handle: string) {
  const found = locate(source, handle);
  if (!isFound(found)) return null;
  return {
    id: `注釈 (${found.line} 行目)`,
    type: found.note.kind,
    value: found.note.text ?? '',
    label: '',
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
  const words = [rotationWord(found.note.turn.rotate), found.note.turn.mirror ? MIRROR_WORD : '']
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

/** 向きの語を書き換える編集。語が無ければ `: ` の前に足し、消すときは空白ごと落とす。 */
function rewriteTurn(found: Found, turn: Turn): NoteResult {
  const at = turnWords(found);
  const words = [rotationWord(turn.rotate), turn.mirror ? MIRROR_WORD : ''].filter((one) => one !== '');
  const empty = words.length === 0;
  const before = found.text.slice(0, at.column).endsWith(' ') ? 1 : 0;
  const column = empty || at.length > 0 ? at.column - (empty ? before : 0) : at.column;
  const length = at.length + (empty ? before : 0);
  const text = empty ? '' : `${at.length > 0 ? '' : ' '}${words.join(' ')}`;

  const edits: Edit[] = [{ line: found.line, column, length, text }];
  return { ok: true, value: { edits, diff: { lost: [], gained: [] } } };
}

/**
 * 注釈を回す。**回るのは字だけ** — 印や枠には向きが無いので断る。
 * 回るのは**指す穴のまわり**で、字の真ん中ではない (指す先から離れないように)。
 */
export function turnNote(source: string, handle: string, quarters: number): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  if (found.note.kind !== 'text') {
    return fail(`${found.note.kind} の注釈は回せません (向きがあるのは text だけです)`, found.line);
  }

  const steps = (((found.note.turn.rotate / 90 + quarters) % 4) + 4) % 4;
  const rotate = (steps * 90) as Turn['rotate'];
  if (rotate === found.note.turn.rotate) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
  return rewriteTurn(found, { ...found.note.turn, rotate });
}

/**
 * 注釈を反転する。**字は裏返さない** — 鏡文字は読めないので、指す穴の
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

/** 向きの無い注釈。**書いていないのと同じ**。 */
export const NOTE_NO_TURN = NO_TURN;

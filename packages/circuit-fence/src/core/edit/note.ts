import { FLOW_REFUSAL, dropLines, isKeyLine, keyLineOf } from 'fence-kit';
import type { Edit, LineEdit, NetDiff, Span } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { NOTE_MIRROR_WORD, noteRotationOf, isNoteRotation } from '../notes.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { FenceError, NoteSpec } from '../types.ts';

/**
 * 注釈を掴んで動かす。
 *
 * **注釈には名前が無いので、掴み手は書かれた行**にする (`note:7`)。配線と同じ
 * 考え方で、部品と同じ `data-part` に載せる — そうすると殻は注釈を部品として
 * 扱えて、選ぶ・動かす・複製する・消す・欄を直すがそのまま通る。
 *
 * **部品を指している注釈は動かさない** (`- circle R1`)。指し先を番地に
 * 書き換えると名前が外れ、あとで部品を動かしても注釈が付いてこない。
 */

const HANDLE = 'note:';

export const isNoteHandle = (handle: string): boolean => handle.startsWith(HANDLE);

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
  /** 文書にある部品の名前。**指し先が名前かどうかはこれで決める。** */
  readonly names: ReadonlySet<string>;
};
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
  if (note.kind === 'source') return { problem: `${line} 行目の注釈は図の下に出るので掴めません`, line };

  const lines = normalized.split('\n');
  // **`R1` は番地としても読める** (行 r・列 1)。綴りだけで見分けると、部品を
  // 指した注釈を番地に書き換えてしまう (実際に踏んだ)。文書の部品名で決める。
  const names = new Set(doc.parts.map((part) => part.id));
  return { note, line, text: lines[line - 1] ?? '', lines, names };
}

const isFound = (one: Found | Problem): one is Found => 'note' in one;

/** その注釈が書いている指し先 (綴りのまま)。 */
function writtenTargets(note: NoteSpec): readonly string[] {
  if (note.kind === 'circle') return [note.target];
  if (note.kind === 'text') return [formatAddress(note.at)];
  if (note.kind === 'box') return [formatAddress(note.from), formatAddress(note.to)];
  if (note.kind === 'arrow' || note.kind === 'line') return [note.from, note.to];
  return [];
}

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

export function noteCells(source: string, handle: string): readonly string[] {
  const found = locate(source, handle);
  if (!isFound(found)) return [];
  // 部品を指しているものは穴を返さない (動かせないので光らせる先も無い)。
  return writtenTargets(found.note)
    .filter((one) => !found.names.has(one))
    .map((one) => parseAddress(one))
    .filter((one): one is Address => one !== null)
    .map(formatAddress);
}

export function noteSpans(source: string, handle: string): readonly Span[] {
  const found = locate(source, handle);
  if (!isFound(found)) return [];
  return [{ line: found.line, column: 0, length: found.text.length }];
}

/** 注釈を動かす。**書かれた番地を全部ずらす** (2 点で形が決まる印があるため)。 */
export function moveNote(source: string, handle: string, to: Address): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);

  const targets = writtenTargets(found.note);
  const named = targets.find((one) => found.names.has(one) || parseAddress(one) === null);
  if (named !== undefined) {
    return fail(
      `${safeToken(named)} を指している注釈は動かせません`
      + ` (指し先の名前が外れます。${safeToken(named)} のほうを動かします)`,
      found.line,
    );
  }
  const anchor = parseAddress(targets[0] ?? '');
  if (anchor === null) return fail(`${found.line} 行目の注釈に指し先がありません`, found.line);

  const delta = { row: to.row - anchor.row, col: to.col - anchor.col };
  const landings = targets.map((one) => {
    const at = parseAddress(one);
    return at === null ? null : { row: at.row + delta.row, col: at.col + delta.col };
  });
  if (landings.some((one) => one === null || one.row < 0 || one.col < 0)) {
    return fail('注釈を動かすと図の外に出ます', found.line);
  }

  const spans = tokensOf(found.text, targets);
  if (spans.length !== targets.length) {
    return fail(`${found.line} 行目の注釈の指し先を行の中に見つけられませんでした`, found.line);
  }
  const edits: Edit[] = spans.map((span, index) => ({
    line: found.line,
    column: span.column,
    length: span.length,
    text: formatAddress(landings[index] as Address),
  }));
  return { ok: true, value: { edits, diff: { lost: [], gained: [] } } };
}

/** 注釈をもう 1 つ。**1 行ずらす** — 重ねると増えたことが図で分からない。 */
export function duplicateNote(source: string, handle: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);

  const targets = writtenTargets(found.note);
  const spans = tokensOf(found.text, targets);
  if (spans.length !== targets.length) {
    return fail(`${found.line} 行目の注釈の指し先を行の中に見つけられませんでした`, found.line);
  }

  let copy = found.text;
  for (const [index, span] of [...spans.entries()].reverse()) {
    const written = targets[index] ?? '';
    // 部品を指しているところは名前のまま写す (名前は外さない)。
    if (found.names.has(written)) continue;
    const at = parseAddress(written);
    if (at === null) continue;
    const moved = formatAddress({ row: at.row + 1, col: at.col });
    copy = copy.slice(0, span.column) + moved + copy.slice(span.column + span.length);
  }

  const lines: LineEdit[] = [{ kind: 'insert', line: found.line, text: copy }];
  return { ok: true, value: { edits: [], lines, diff: { lost: [], gained: [] } } };
}

/** 注釈を消す。**その 1 行を落とす** (最後の 1 つなら `notes:` の行ごと)。 */
export function deleteNote(source: string, handle: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  if (isKeyLine(found.lines[found.line - 1], 'notes')) return fail(`注釈: ${FLOW_REFUSAL}`, found.line);

  const notes = parseFence(normalizeNewlines(source)).doc?.notes ?? [];
  const drop = new Set<number>([found.line]);
  if (notes.every((one) => one.line === found.line)) drop.add(keyLineOf(found.lines, 'notes'));

  return { ok: true, value: { edits: [], lines: dropLines(drop), diff: { lost: [], gained: [] } } };
}

/** 注釈の欄。直せるのは `text` の字だけ (種類を変えると指し先の数が変わる)。 */
export function noteFields(source: string, handle: string) {
  const found = locate(source, handle);
  if (!isFound(found)) return null;
  return {
    id: `注釈 (${found.line} 行目)`,
    type: found.note.kind,
    value: found.note.kind === 'text' ? found.note.text : '',
    label: '',
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
  return {
    ok: true,
    value: {
      edits: [{ line: found.line, column: from, length: found.text.length - from, text }],
      diff: { lost: [], gained: [] },
    },
  };
}

/** いま書かれている向きの語と、その場所。無ければ `: ` の直前に足す。 */
function turnWords(found: Found): { readonly column: number; readonly length: number } {
  const words = found.text.slice(0, Math.max(found.text.indexOf(': '), 0))
    .split(/\s+/)
    .filter((one) => isNoteRotation(one));
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

/**
 * 注釈を回す。**回るのは字だけ** — 印や枠には向きが無いので断る。
 * 反転は書けない (字を指し先そのものに置くので、移す側がない)。
 */
export function turnNote(source: string, handle: string, quarters: number): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  if (found.note.kind !== 'text') {
    return fail(`${found.note.kind} の注釈は回せません (向きがあるのは text だけです)`, found.line);
  }

  const now = found.note.rotate;
  const steps = (((now / 90 + quarters) % 4) + 4) % 4;
  const rotate = (steps * 90) as 0 | 90 | 180 | 270;
  if (rotate === now) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };

  const at = turnWords(found);
  const empty = rotate === 0;
  const before = found.text.slice(0, at.column).endsWith(' ') ? 1 : 0;
  const column = empty || at.length > 0 ? at.column - (empty ? before : 0) : at.column;
  const length = at.length + (empty ? before : 0);
  const text = empty ? '' : `${at.length > 0 ? '' : ' '}r${rotate}`;

  return { ok: true, value: { edits: [{ line: found.line, column, length, text }], diff: { lost: [], gained: [] } } };
}

/** 反転。**circuit の字は指し先そのものに置く**ので、移す側がない。 */
export function flipNote(source: string, handle: string): NoteResult {
  const found = locate(source, handle);
  if (!isFound(found)) return fail(found.problem, found.line);
  return fail(
    `注釈は反転できません (${NOTE_MIRROR_WORD} は書けません。字を指し先そのものに置くので、移す側がありません)`,
    found.line,
  );
}

/** 語の綴りを読むのに使う (向きの語だけを拾うため)。 */
export const noteRotation = noteRotationOf;

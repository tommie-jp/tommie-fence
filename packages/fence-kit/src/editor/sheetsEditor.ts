/**
 * `sheets:` の図をマップで 1 枚ずつ掴めるようにする包み (52 の docs/118 の 4.6)。
 *
 * **枚を 1 枚ずつ「仮のフェンス」として見せる。** フェンスの一覧には枚の数だけ
 * 項目を立て (行は枚の `- name:` の行)、選ばれた枚の YAML (`splitSheets` が字下げを
 * 外して切り出したもの) を中のエディタへ渡す。中のエディタは 1 枚の図しか知らない
 * ままでよい。
 *
 * **書き換えは元のフェンスの行と桁へ戻す。** 枚の中の行 k は元の本文の行
 * `firstLine + k - 1`、桁は外した字下げのぶんだけ右。外側から足した既定
 * (`board:` `style:`) の行と、名前から作った題の行は元の本文に無いので書き換えを断る。
 *
 * 殻は今までどおり**フェンス全体**を相手にする (`fenceAt` が返すのはフェンスの本文)。
 * どの枚を見ているかはこの包みが覚える。
 */
import { hasSheets, splitSheets } from '../sheets.ts';
import type { SheetOptions, SheetSource } from '../sheets.ts';
import type { FenceBlock } from '../fences.ts';
import type { Edit, LineEdit, Span } from './edits.ts';
import type { EditChanges, EditResult, FenceEditor, FenceEntry } from './fenceEditor.ts';

/** 元の本文に無い行 (足した既定・作った題) を書き換えようとしたときの文面。 */
export const SHEET_LINE_REFUSAL = 'この行は枚の外 (共通の board: style: など) か、名前から作った題なので、マップでは書き換えません。手で書きます';

const ITEM_MARK = /^\s*-(?:\s+|$)/;

/**
 * 選んだ枚と、その枚の行を元の本文へ戻す手掛かり。
 *
 * **枚の本文の頭に空行を足して、行番号を元のフェンスと揃える** (YAML は空行を読み飛ばす)。
 * こうすると、マップの絵に埋めた行 (`data-line`)・言われることの行・書き換えの行が
 * どれも元のフェンスの行になり、直すのは外した字下げ (桁) だけで済む。
 */
type Picked = {
  readonly sheet: SheetSource;
  /** 中のエディタへ渡す本文 (頭に空行を足したもの)。 */
  readonly text: string;
  /** フェンスの行 (1 始まり) → 外した字下げ。元の本文に無い行・枚の外の行は null。 */
  readonly strip: (line: number) => number | null;
  /** 足す行に付ける字下げ (枚の中身の字下げ)。 */
  readonly pad: string;
};

function pickOf(source: string, sheet: SheetSource): Picked {
  const fence = source.split('\n');
  const own = sheet.text.split('\n').slice(0, sheet.ownLines);
  const strips = own.map((text, index) => {
    const original = fence[sheet.firstLine - 1 + index] ?? '';
    if (text === '') return original.trim() === '' ? 0 : null;
    // 名前から作った題・`(N枚め)` を付けた題は元の行と字が違う。
    return original.endsWith(text) ? original.length - text.length : null;
  });
  const mark = ITEM_MARK.exec(fence[sheet.firstLine - 1] ?? '')?.[0].length ?? 4;
  return {
    sheet,
    text: '\n'.repeat(sheet.firstLine - 1) + sheet.text,
    strip: (line) => strips[line - sheet.firstLine] ?? null,
    pad: ' '.repeat(mark),
  };
}

/** 題の行 (`title: "…"`) から題を読む。 */
const titleOfSheet = (text: string): string | null => {
  const line = text.split('\n').find((one) => one.startsWith('title:'));
  if (line === undefined) return null;
  const raw = line.slice('title:'.length).trim();
  try {
    return raw.startsWith('"') ? String(JSON.parse(raw)) : raw;
  } catch {
    return raw;
  }
};

/** 枚の中の桁を、元の本文の桁へ。戻せない行があれば null。 */
function toFence(picked: Picked, changes: EditChanges): EditChanges | null {
  const { sheet, strip, pad } = picked;
  const edits: Edit[] = [];
  for (const edit of changes.edits ?? []) {
    const by = strip(edit.line);
    if (by === null) return null;
    edits.push({ ...edit, column: edit.column + by });
  }
  const lines: LineEdit[] = [];
  for (const one of changes.lines ?? []) {
    if (one.kind === 'delete') {
      if (strip(one.line) === null) return null;
      lines.push(one);
    } else {
      // 枚の頭 (`- name:` の行) より前には入れない。足した既定より後ろは枚の終わりへ。
      const at = Math.min(Math.max(one.line, sheet.firstLine + 1), sheet.firstLine + sheet.ownLines);
      lines.push({ kind: 'insert', line: at, text: `${pad}${one.text}` });
    }
  }
  return { ...changes, edits, lines };
}

/**
 * 中のエディタを `sheets:` の図に効くように包む。`sheets:` の無い図では
 * 中のエディタをそのまま呼ぶ (1 バイトも変わらない)。
 */
export function withSheets(inner: FenceEditor, options: SheetOptions = {}): FenceEditor {
  /** いま見ている枚の名前 (フェンスの行ごと)。 */
  const chosen = new Map<number, string>();
  let lastFence: number | null = null;

  const sheetsOf = (source: string): readonly SheetSource[] => splitSheets(source, options).sheets;
  /** 本文から、いま見ている枚。**枚の名前で覚える** (行は書き換えで動く)。 */
  const pick = (source: string): Picked | null => {
    if (!hasSheets(source)) return null;
    const sheets = sheetsOf(source);
    const name = lastFence === null ? undefined : chosen.get(lastFence);
    const sheet = sheets.find((one) => one.name === name) ?? sheets[0];
    return sheet === undefined ? null : pickOf(source, sheet);
  };
  /** 枚の中の綴りで答えるもの (書き換えない) は、枚の本文を渡すだけ。 */
  const onSheet = <T>(source: string, call: (text: string) => T): T => call(pick(source)?.text ?? source);
  const editOn = (source: string, call: (text: string) => EditResult): EditResult => {
    const picked = pick(source);
    if (picked === null) return call(source);
    const result = call(picked.text);
    if (!result.ok) return result;
    const value = toFence(picked, result.value);
    return value === null ? { ok: false, error: { message: SHEET_LINE_REFUSAL, line: null } } : { ok: true, value };
  };
  /** 行を含む枚を選んで覚える。フェンスの開き記号の行なら、覚えている枚のまま。 */
  const remember = (block: FenceBlock | null, line: number | null): FenceBlock | null => {
    if (block === null || !hasSheets(block.source)) return block;
    const sheets = sheetsOf(block.source);
    const local = line === null ? 0 : line - block.line;
    const inside = [...sheets].reverse().find((one) => local >= one.firstLine);
    const kept = chosen.get(block.line);
    const name = inside?.name ?? (kept !== undefined && sheets.some((one) => one.name === kept) ? kept : sheets[0]?.name);
    if (name !== undefined) chosen.set(block.line, name);
    lastFence = block.line;
    const sheet = sheets.find((one) => one.name === name);
    // 一覧で選ばれている項目は、いま見ている枚の頭の行。
    return sheet === undefined ? block : { ...block, entry: block.line + sheet.firstLine };
  };

  return {
    ...inner,
    fences: (markdown) => inner.fences(markdown).flatMap((entry): FenceEntry[] => {
      const block = inner.fenceAt(markdown, entry.line);
      if (block === null || !hasSheets(block.source)) return [entry];
      // 枚の数だけ並べる。行は枚の頭の行 (そこを選ぶとその枚を開く)。
      return sheetsOf(block.source).map((sheet) => ({
        line: block.line + sheet.firstLine,
        title: titleOfSheet(sheet.text) ?? entry.title,
      }));
    }),
    fenceAt: (markdown, line) => remember(inner.fenceAt(markdown, line), line),
    firstFence: (markdown) => remember(inner.firstFence(markdown), null),
    view: (source, fenceLine) => {
      const picked = pick(source);
      return inner.view(picked?.text ?? source, fenceLine);
    },
    // Problems は図全体で (どの枚の誤りも、元の行で出る)。
    ...(inner.problems === undefined ? {} : { problems: inner.problems }),
    aimAt: (source, line, column) => {
      const picked = pick(source);
      if (picked === null) return inner.aimAt(source, line, column);
      const by = picked.strip(line);
      return by === null ? null : inner.aimAt(picked.text, line, Math.max(0, column - by));
    },
    spansOf: (source, what, id) => {
      const picked = pick(source);
      if (picked === null) return inner.spansOf(source, what, id);
      return inner.spansOf(picked.text, what, id).flatMap((span): Span[] => {
        const by = picked.strip(span.line);
        return by === null ? [] : [{ ...span, column: span.column + by }];
      });
    },
    fieldsOf: (source, handle) => onSheet(source, (text) => inner.fieldsOf(text, handle)),
    ...(inner.textOf === undefined ? {} : { textOf: (source: string, handle: string) => onSheet(source, (text) => inner.textOf?.(text, handle) ?? null) }),
    nextId: (source, type) => onSheet(source, (text) => inner.nextId(text, type)),
    cellsOf: (source, handle) => onSheet(source, (text) => inner.cellsOf(text, handle)),
    step: (cell, rows, cols, source) => onSheet(source, (text) => inner.step(cell, rows, cols, text)),
    stepsTo: (from, to, source) => onSheet(source, (text) => inner.stepsTo(from, to, text)),
    ...(inner.moveWireEnd === undefined ? {} : {
      moveWireEnd: (source: string, handle: string, end: 'from' | 'to', to: string) =>
        editOn(source, (text) => inner.moveWireEnd?.(text, handle, end, to) ?? { ok: false, error: { message: '', line: null } }),
    }),
    movePart: (source, handle, to, trial) => editOn(source, (text) => inner.movePart(text, handle, to, trial)),
    movePoint: (source, from, to, trial) => editOn(source, (text) => inner.movePoint(text, from, to, trial)),
    addPart: (source, part) => editOn(source, (text) => inner.addPart(text, part)),
    duplicate: (source, handle, id) => editOn(source, (text) => inner.duplicate(text, handle, id)),
    addWire: (source, from, to, operator, color) => editOn(source, (text) => inner.addWire(text, from, to, operator, color)),
    deletePart: (source, handle) => editOn(source, (text) => inner.deletePart(text, handle)),
    deleteWire: (source, line) => editOn(source, (text) => inner.deleteWire(text, line)),
    rename: (source, handle, to) => editOn(source, (text) => inner.rename(text, handle, to)),
    setField: (source, handle, field, text) => editOn(source, (body) => inner.setField(body, handle, field, text)),
    turn: (source, handle, quarters) => editOn(source, (text) => inner.turn(text, handle, quarters)),
    flip: (source, handle) => editOn(source, (text) => inner.flip(text, handle)),
  };
}

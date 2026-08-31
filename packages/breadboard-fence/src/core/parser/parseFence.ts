import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair, ParsedNode } from 'yaml';
import { fenceError, notice, safeToken } from '../errors.ts';
import { LIMITS, clampText, isReferenceable } from '../limits.ts';
import { railOrder } from '../model/board.ts';
import {
  BOARD_SIZES, COLUMN_NUMBERS, DEFAULT_BOARD, DEFAULT_PARTS_LIST, LETTER_CASES, PARTS_LIST_MODES,
} from '../types.ts';
import type {
  BoardSpec, FenceDocument, FenceError, NoteSpec, PartSpec, PartsListMode, Result, StyleSpec, WireSpec,
} from '../types.ts';
import { splitPartType } from '../parts/variants.ts';
import { parseCompactPart, parseHoleToken, parseWireSpec } from './compact.ts';
import { parseNoteLine } from './notes.ts';
import {
  conflictingNames, resolveNoteTargets, resolveParts, resolveWires, validatePointName,
} from './points.ts';
import type { PointDef } from './points.ts';
import { validateExpandedPart } from './schema.ts';
import { EMPTY_STYLE, validateStyle } from './style.ts';

/** 列挙にある値ならその型で返す。列挙は types.ts の as const 配列なので、二重定義にならない。 */
const pick = <T extends string>(allowed: readonly T[], value: string | null): T | null =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
const MAX_YAML_MESSAGE = 120;

/** フェンスの一番外側に書けるキー。読めなかったときの案内はここから作る。 */
export const TOP_LEVEL_KEYS = ['title', 'points', 'board', 'style', 'parts', 'parts-list', 'wires', 'notes'] as const;

export type ParseResult = { readonly doc: FenceDocument | null; readonly errors: readonly FenceError[] };

const scalarText = (node: unknown): string | null =>
  isScalar(node) && typeof node.value === 'string' ? node.value : null;

/**
 * フェンスの中身 (YAML) を検証済みのモデルに変換する。
 * エラーはすべて行番号つきで返し、読めた部分は捨てない。
 */
export function parseFence(source: string): ParseResult {
  const lineCounter = new LineCounter();
  // 重複キーは YAML のエラーにせず、こちらで部品 ID として報告する。
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });

  const lineOf = (node: Node | Pair | null | undefined): number | null => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };

  if (parsed.errors.length > 0) {
    return {
      doc: null,
      // yaml のメッセージはライブラリ側の文言。描画時にエスケープされる前提で載せる。
      errors: parsed.errors.map((error) =>
        fenceError(
          `YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`,
          lineCounter.linePos(error.pos[0]).line,
        ),
      ),
    };
  }

  const errors: FenceError[] = [];
  const parts: PartSpec[] = [];
  const wires: WireSpec[] = [];
  const notes: NoteSpec[] = [];
  let board: BoardSpec = DEFAULT_BOARD;
  let style: StyleSpec = EMPTY_STYLE;
  let partsList: PartsListMode = DEFAULT_PARTS_LIST;
  let title: string | null = null;

  const points = new Map<string, PointDef>();

  /**
   * 点の名前は**全部読み終えてから**番地に置き換える。`points:` はフェンスの
   * どこに書いてもよく、部品より下に書かれていることもあるため。
   */
  const document = (): FenceDocument => {
    errors.push(...conflictingNames(points, parts));
    return {
      title,
      board,
      style,
      partsList,
      points: new Map([...points].map(([name, def]) => [name, def.addr])),
      parts: resolveParts(parts, points),
      wires: resolveWires(wires, points),
      notes: resolveNoteTargets(notes, points),
    };
  };

  const contents = parsed.contents;
  if (contents === null) return { doc: document(), errors };
  if (!isMap(contents)) {
    return {
      doc: null,
      errors: [fenceError(`フェンスの中身は ${TOP_LEVEL_KEYS.join(' / ')} のマップで書きます`, 1)],
    };
  }

  // 点の名前は**部品を読む前に**揃えておく。1 行の記法は「番地に見える語は穴、
  // それ以外は値」で割っており、名前が穴だと分かっていないと値に紛れてしまう。
  // `points:` はフェンスのどこに書いてもよいので、そのための先読み。
  for (const pair of contents.items) {
    if (scalarText(pair.key) !== 'points') continue;
    collectPoints(pair.value as ParsedNode | null, {
      points, errors, lineOf, fallbackLine: lineOf(pair.key),
    });
  }
  const isPoint = (token: string): boolean => points.has(token);

  for (const pair of contents.items) {
    const key = scalarText(pair.key) ?? '';
    const line = lineOf(pair.key);

    if (key === 'title') {
      const written = scalarText(pair.value);
      // 題は 1 行のスカラー。折り返さないので、長い題は切って `…` を残す。
      if (written === null) errors.push(fenceError('title は 1 行の文字列で書きます', line));
      else title = clampText(written.trim(), LIMITS.titleLength);
    } else if (key === 'points') {
      // 先読みで済ませてある。
    } else if (key === 'board') {
      board = collectBoard(pair.value as ParsedNode | null, board, errors, lineOf, line);
    } else if (key === 'style') {
      const node = pair.value as ParsedNode | null;
      const validated = validateStyle(node?.toJSON() as unknown, line);
      style = validated.value;
      // 理由はそれを書いた項目の行に付ける (style: の行だけを指しても直す場所が分からない)。
      const keyLine = styleKeyLines(node, lineOf);
      errors.push(
        ...validated.messages.map((item) => {
          const at = (item.key === null ? null : keyLine.get(item.key)) ?? line;
          return item.notice === true ? notice(item.message, at) : fenceError(item.message, at);
        }),
      );
    } else if (key === 'parts-list') {
      const mode = pick(PARTS_LIST_MODES, scalarText(pair.value));
      // 読めなかったときは直前の値のまま (board と同じ、後勝ちだが不正値では上書きしない)。
      if (mode) partsList = mode;
      else errors.push(fenceError('parts-list は below か none です', lineOf(pair.value as Node) ?? line));
    } else if (key === 'parts') {
      collectParts(pair.value as ParsedNode | null, { parts, errors, lineOf, isPoint });
    } else if (key === 'wires') {
      collectWires(pair.value as ParsedNode | null, { wires, errors, lineOf });
    } else if (key === 'notes') {
      collectNotes(pair.value as ParsedNode | null, { notes, errors, lineOf });
    } else {
      errors.push(
        fenceError(`知らないキーです: ${safeToken(key)} (${TOP_LEVEL_KEYS.join(' / ')} が使えます)`, line, key),
      );
    }
  }

  return { doc: document(), errors };
}

type LineOf = (node: Node | Pair | null | undefined) => number | null;

/** `points:` は「名前: 番地」のマップ。番地が正しいかは、使った側で見る。 */
function collectPoints(
  node: ParsedNode | null,
  context: { points: Map<string, PointDef>; errors: FenceError[]; lineOf: LineOf; fallbackLine: number | null },
): void {
  const { points, errors, lineOf, fallbackLine } = context;
  if (!isMap(node)) {
    errors.push(fenceError('points は「名前: 番地」のマップで書きます', lineOf(node) ?? fallbackLine));
    return;
  }

  for (const pair of node.items) {
    const name = scalarText(pair.key);
    const line = lineOf(pair.key) ?? fallbackLine ?? 1;
    if (points.size >= LIMITS.points) {
      errors.push(fenceError(`点は ${LIMITS.points} 個までです。ここから先は読んでいません`, line));
      return;
    }
    if (name === null) {
      errors.push(fenceError('点の名前は文字列で書きます', line));
      continue;
    }

    const bad = validatePointName(name, line);
    if (bad) {
      errors.push(bad);
      continue;
    }
    if (points.has(name)) {
      errors.push(fenceError(`点 ${safeToken(name)} が二重に定義されています`, line));
      continue;
    }

    const addr = scalarText(pair.value);
    if (addr === null) {
      errors.push(fenceError(`点 ${safeToken(name)} の値は穴番地で書きます`, line));
      continue;
    }
    points.set(name, { addr, line });
  }
}

/**
 * 注釈を読む。**`text` だけが「1 項目のマップ」**で来る。
 * YAML のプレーンスカラーには `: ` を書けないので、
 * `- text a5 "R1: resistor …"` は黙ってマップとして読まれてエラーにもならない。
 * 字を値の側に置けば、引用が要るかどうかを YAML 自身に決めさせられる。
 */
function collectNotes(
  node: ParsedNode | null,
  context: { notes: NoteSpec[]; errors: FenceError[]; lineOf: LineOf },
): void {
  const { notes, errors, lineOf } = context;
  if (!isSeq(node)) {
    errors.push(fenceError('notes は「- circle R1」のように並べたリストで書きます', lineOf(node)));
    return;
  }

  for (const item of node.items) {
    const line = lineOf(item as Node) ?? 1;
    if (notes.length >= LIMITS.notes) {
      errors.push(fenceError(`注釈は ${LIMITS.notes} 個までです。ここから先は描いていません`, line));
      return;
    }

    const scalar = scalarText(item);
    if (scalar !== null) {
      push(parseNoteLine(scalar, null, line));
      continue;
    }

    // `- text a5 blue: ここで分圧する` は 1 項目のマップとして読まれる。
    if (isMap(item) && item.items.length === 1) {
      const pair = item.items[0];
      const head = scalarText(pair?.key);
      const text = scalarText(pair?.value);
      if (head !== null && text !== null) {
        push(parseNoteLine(head, text, lineOf(pair?.key) ?? line));
        continue;
      }
      // 数字だけの字 (`- text a5: 100`) は YAML が数値にするので、字として届かない。
      // 「形で書きます」だけだと、囲めば直ることに気づけない。
      if (head !== null && isScalar(pair?.value)) {
        errors.push(fenceError(
          '注釈の字は文字列で書きます (数字だけのときは "100" のように囲みます)',
          lineOf(pair?.key) ?? line,
        ));
        continue;
      }
    }

    errors.push(fenceError('注釈は「- circle R1」か「- text a5: 字」の形で書きます', line));
  }

  function push(result: Result<NoteSpec>): void {
    if (result.ok) notes.push(result.value);
    else errors.push(result.error);
  }
}

/**
 * `board:` はサイズだけのスカラーでも、サイズと印字のマップでも書ける。
 * 読めなかった項目は直前の値のまま報告する (書けたところは捨てない)。
 * キーが 2 回書かれたときは parts と同じく後勝ちで重ねる。
 */
function collectBoard(
  node: ParsedNode | null,
  current: BoardSpec,
  errors: FenceError[],
  lineOf: LineOf,
  fallbackLine: number | null,
): BoardSpec {
  const scalar = scalarText(node);
  if (scalar !== null) {
    const size = pick(BOARD_SIZES, scalar);
    if (size) return { ...current, size };
    errors.push(fenceError('board は half か full です', lineOf(node) ?? fallbackLine));
    return current;
  }

  if (!isMap(node)) {
    errors.push(
      fenceError('board は half / full か、size / rails / letters / numbers のマップで書きます', lineOf(node) ?? fallbackLine),
    );
    return current;
  }

  let spec = current;
  for (const pair of node.items) {
    const key = scalarText(pair.key) ?? '';
    const keyLine = lineOf(pair.key) ?? fallbackLine;
    const value = scalarText(pair.value);

    if (key === 'size') {
      const size = pick(BOARD_SIZES, value);
      if (size) spec = { ...spec, size };
      else errors.push(fenceError('board の size は half か full です', keyLine));
    } else if (key === 'rails') {
      const order = value === null ? null : railOrder(value);
      if (order) spec = { ...spec, rails: order };
      else {
        errors.push(
          fenceError('board の rails は "+--+" のように 4 文字で書きます (上下それぞれ + と - を 1 つずつ)', keyLine),
        );
      }
    } else if (key === 'letters') {
      const letters = pick(LETTER_CASES, value);
      if (letters) spec = { ...spec, letters };
      else errors.push(fenceError('board の letters は lower か upper です', keyLine));
    } else if (key === 'numbers') {
      const numbers = pick(COLUMN_NUMBERS, value);
      if (numbers) spec = { ...spec, numbers };
      else errors.push(fenceError('board の numbers は every-5 か all です', keyLine));
    } else {
      errors.push(
        fenceError(`board の知らないキーです: ${safeToken(key)} (size / rails / letters / numbers が使えます)`, keyLine),
      );
    }
  }
  return spec;
}

/** style のマップの、項目名 → その項目が書かれた行。 */
function styleKeyLines(node: ParsedNode | null, lineOf: LineOf): Map<string, number> {
  const lines = new Map<string, number>();
  if (!isMap(node)) return lines;

  for (const pair of node.items) {
    const key = scalarText(pair.key);
    const line = lineOf(pair.key);
    if (key !== null && line !== null) lines.set(key, line);
  }
  return lines;
}

function collectParts(
  node: ParsedNode | null,
  context: { parts: PartSpec[]; errors: FenceError[]; lineOf: LineOf; isPoint: (token: string) => boolean },
): void {
  const { parts, errors, lineOf, isPoint } = context;
  if (!isMap(node)) {
    errors.push(fenceError('parts は「ID: 内容」のマップで書きます', lineOf(node)));
    return;
  }

  // parts: が 2 回書かれることがある (uniqueKeys: false) ので、
  // これまでに読めた部品も含めて重複を見る。
  const seen = new Set(parts.map((part) => part.id));
  for (const pair of node.items) {
    const id = scalarText(pair.key);
    const line = lineOf(pair.key) ?? 1;
    if (parts.length >= LIMITS.parts) {
      errors.push(fenceError(`部品は ${LIMITS.parts} 個までです。ここから先は描いていません`, line));
      return;
    }
    if (id === null) {
      errors.push(fenceError('部品の ID は文字列で書きます', line));
      continue;
    }
    if (!isReferenceable(id)) {
      errors.push(
        fenceError(
          `部品 ID ${safeToken(id)} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`,
          line,
        ),
      );
      continue;
    }
    if (seen.has(id)) {
      errors.push(fenceError(`部品 ${safeToken(id)} が二重に定義されています`, line));
      continue;
    }
    seen.add(id);

    const compact = scalarText(pair.value);
    if (compact !== null) {
      const result = parseCompactPart(id, compact, line, isPoint);
      if (!result.ok) {
        errors.push(result.error);
        continue;
      }
      parts.push(result.value);
      const eaten = result.value.eatenValue;
      if (eaten != null) {
        errors.push(notice(
          `部品 ${safeToken(id)}: ${safeToken(eaten)} は points: の名前なので、値ではなく穴として読みました`,
          line,
          eaten,
        ));
      }
      continue;
    }

    if (isMap(pair.value)) {
      const expanded = expandPart(id, pair.value.toJSON() as unknown, line);
      if (expanded.ok) {
        parts.push(expanded.value);
        // 描けた部品は残したまま、使われなかった指定だけを同じ行で言う。
        errors.push(...expanded.notes);
      } else errors.push(expanded.error);
      continue;
    }

    errors.push(fenceError(`部品 ${safeToken(id)} の内容は 1 行の文字列かマップで書きます`, line));
  }
}

function expandPart(id: string, raw: unknown, line: number) {
  const validated = validateExpandedPart(raw);
  if (!validated.ok) {
    return { ok: false as const, error: fenceError(`部品 ${safeToken(id)}: ${validated.message}`, line) };
  }

  const { at, label, value, pins, holes } = validated.value;
  const { type, variant, problem } = splitPartType(validated.value.type);
  if (problem) return { ok: false as const, error: fenceError(`部品 ${safeToken(id)}: ${problem}`, line) };
  return {
    ok: true as const,
    value: {
      id, type, variant, holes: holes.map(parseHoleToken), value, label, at, pins, line,
    } satisfies PartSpec,
    // 「描けたが使われなかった指定」はお知らせ。部品そのものは今までどおり描く。
    notes: validated.notes.map((item) => notice(`部品 ${safeToken(id)}: ${item}`, line)),
  };
}

function collectWires(
  node: ParsedNode | null,
  context: { wires: WireSpec[]; errors: FenceError[]; lineOf: LineOf },
): void {
  const { wires, errors, lineOf } = context;
  if (!isSeq(node)) {
    errors.push(fenceError('wires は「- 端点 -- 端点」を並べたリストで書きます', lineOf(node)));
    return;
  }

  for (const item of node.items) {
    const text = scalarText(item);
    const line = lineOf(item as Node) ?? 1;
    if (wires.length >= LIMITS.wires) {
      errors.push(fenceError(`配線は ${LIMITS.wires} 本までです。ここから先は描いていません`, line));
      return;
    }
    if (text === null) {
      errors.push(fenceError('配線は 1 行の文字列で書きます', line));
      continue;
    }
    const result = parseWireSpec(text, line);
    // つないで書いた 1 行は区間ごとに開かれる。上限は区間の数で数えるので、
    // 「配線 500 本」の意味は書き方によらず変わらない。
    if (result.ok) wires.push(...result.value);
    else errors.push(result.error);
  }
}

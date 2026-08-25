import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair, ParsedNode } from 'yaml';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { railOrder } from '../model/board.ts';
import {
  BOARD_SIZES, COLUMN_NUMBERS, DEFAULT_BOARD, DEFAULT_PARTS_LIST, LETTER_CASES, PARTS_LIST_MODES,
} from '../types.ts';
import type {
  BoardSpec, FenceDocument, FenceError, PartSpec, PartsListMode, StyleSpec, WireSpec,
} from '../types.ts';
import { splitPartType } from '../parts/variants.ts';
import { parseCompactPart, parseHoleToken, parseWireSpec } from './compact.ts';
import { validateExpandedPart } from './schema.ts';
import { EMPTY_STYLE, validateStyle } from './style.ts';

/** 列挙にある値ならその型で返す。列挙は types.ts の as const 配列なので、二重定義にならない。 */
const pick = <T extends string>(allowed: readonly T[], value: string | null): T | null =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
const MAX_YAML_MESSAGE = 120;

/** フェンスの一番外側に書けるキー。読めなかったときの案内はここから作る。 */
const TOP_LEVEL_KEYS = ['board', 'style', 'parts', 'parts-list', 'wires'] as const;

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
  let board: BoardSpec = DEFAULT_BOARD;
  let style: StyleSpec = EMPTY_STYLE;
  let partsList: PartsListMode = DEFAULT_PARTS_LIST;

  const contents = parsed.contents;
  if (contents === null) return { doc: { board, style, partsList, parts, wires }, errors };
  if (!isMap(contents)) {
    return {
      doc: null,
      errors: [fenceError(`フェンスの中身は ${TOP_LEVEL_KEYS.join(' / ')} のマップで書きます`, 1)],
    };
  }

  for (const pair of contents.items) {
    const key = scalarText(pair.key) ?? '';
    const line = lineOf(pair.key);

    if (key === 'board') {
      board = collectBoard(pair.value as ParsedNode | null, board, errors, lineOf, line);
    } else if (key === 'style') {
      const node = pair.value as ParsedNode | null;
      const validated = validateStyle(node?.toJSON() as unknown, line);
      style = validated.value;
      // 理由はそれを書いた項目の行に付ける (style: の行だけを指しても直す場所が分からない)。
      const keyLine = styleKeyLines(node, lineOf);
      errors.push(
        ...validated.messages.map((item) =>
          fenceError(item.message, (item.key === null ? null : keyLine.get(item.key)) ?? line),
        ),
      );
    } else if (key === 'parts-list') {
      const mode = pick(PARTS_LIST_MODES, scalarText(pair.value));
      // 読めなかったときは直前の値のまま (board と同じ、後勝ちだが不正値では上書きしない)。
      if (mode) partsList = mode;
      else errors.push(fenceError('parts-list は below か none です', lineOf(pair.value as Node) ?? line));
    } else if (key === 'parts') {
      collectParts(pair.value as ParsedNode | null, { parts, errors, lineOf });
    } else if (key === 'wires') {
      collectWires(pair.value as ParsedNode | null, { wires, errors, lineOf });
    } else {
      errors.push(
        fenceError(`知らないキーです: ${safeToken(key)} (${TOP_LEVEL_KEYS.join(' / ')} が使えます)`, line),
      );
    }
  }

  return { doc: { board, style, partsList, parts, wires }, errors };
}

type LineOf = (node: Node | Pair | null | undefined) => number | null;

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
  context: { parts: PartSpec[]; errors: FenceError[]; lineOf: LineOf },
): void {
  const { parts, errors, lineOf } = context;
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
      const result = parseCompactPart(id, compact, line);
      if (result.ok) parts.push(result.value);
      else errors.push(result.error);
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
  const { type, variant } = splitPartType(validated.value.type);
  return {
    ok: true as const,
    value: {
      id, type, variant, holes: holes.map(parseHoleToken), value, label, at, pins, line,
    } satisfies PartSpec,
    notes: validated.notes.map((note) => fenceError(`部品 ${safeToken(id)}: ${note}`, line)),
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
    if (result.ok) wires.push(result.value);
    else errors.push(result.error);
  }
}

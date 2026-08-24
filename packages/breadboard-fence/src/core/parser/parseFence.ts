import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair, ParsedNode } from 'yaml';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import type { BoardSize, FenceDocument, FenceError, PartSpec, WireSpec } from '../types.ts';
import { parseCompactPart, parseHoleToken, parseWireSpec } from './compact.ts';
import { validateExpandedPart } from './schema.ts';

const BOARD_SIZES: readonly string[] = ['half', 'full'];
const MAX_YAML_MESSAGE = 120;

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
  let board: BoardSize = 'half';

  const contents = parsed.contents;
  if (contents === null) return { doc: { board, parts, wires }, errors };
  if (!isMap(contents)) {
    return { doc: null, errors: [fenceError('フェンスの中身は board / parts / wires のマップで書きます', 1)] };
  }

  for (const pair of contents.items) {
    const key = scalarText(pair.key) ?? '';
    const line = lineOf(pair.key);

    if (key === 'board') {
      const size = scalarText(pair.value);
      if (size !== null && BOARD_SIZES.includes(size)) board = size as BoardSize;
      else errors.push(fenceError('board は half か full です', lineOf(pair.value as Node) ?? line));
    } else if (key === 'parts') {
      collectParts(pair.value as ParsedNode | null, { parts, errors, lineOf });
    } else if (key === 'wires') {
      collectWires(pair.value as ParsedNode | null, { wires, errors, lineOf });
    } else {
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (board / parts / wires が使えます)`, line));
    }
  }

  return { doc: { board, parts, wires }, errors };
}

type LineOf = (node: Node | Pair | null | undefined) => number | null;

function collectParts(
  node: ParsedNode | null,
  context: { parts: PartSpec[]; errors: FenceError[]; lineOf: LineOf },
): void {
  const { parts, errors, lineOf } = context;
  if (!isMap(node)) {
    errors.push(fenceError('parts は「ID: 内容」のマップで書きます', lineOf(node)));
    return;
  }

  const seen = new Set<string>();
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
      if (expanded.ok) parts.push(expanded.value);
      else errors.push(expanded.error);
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

  const { type, at, label, value, pins, holes } = validated.value;
  return {
    ok: true as const,
    value: { id, type, holes: holes.map(parseHoleToken), value, label, at, pins, line } satisfies PartSpec,
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

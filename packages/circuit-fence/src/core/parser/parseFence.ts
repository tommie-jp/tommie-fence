import { LineCounter, isAlias, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Document, Node, Pair, ParsedNode } from 'yaml';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import type { FenceError, PartSpec, StyleSpec, WireSpec } from '../types.ts';
import { parseCompactPart, parseWireSpec } from './compact.ts';
import { EMPTY_STYLE, validateStyle } from './style.ts';

const MAX_YAML_MESSAGE = 120;

/** フェンスの一番外側に書けるキー。読めなかったときの案内はここから作る。 */
const TOP_LEVEL_KEYS = ['parts', 'wires', 'style'] as const;

export type FenceDocument = {
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  readonly style: StyleSpec;
};

export type ParseResult = { readonly doc: FenceDocument | null; readonly errors: readonly FenceError[] };

type LineOf = (node: Node | Pair | null | undefined) => number | null;

const scalarText = (node: unknown): string | null =>
  isScalar(node) && typeof node.value === 'string' ? node.value : null;

/**
 * フェンスの中身 (YAML) を、行番号を持った 1 行ずつの並びにする。
 * ここで見るのは器の形 (parts はマップ・wires はリスト) と ID だけで、
 * 1 行の中身の解釈は compact.ts に任せる。
 * エラーはすべて行番号つきで返し、読めた部分は捨てない。
 */
export function parseFence(source: string): ParseResult {
  const lineCounter = new LineCounter();
  // 重複キーは YAML のエラーにせず、こちらで部品 ID として報告する。
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });

  const lineOf: LineOf = (node) => {
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
  let style: StyleSpec = EMPTY_STYLE;

  const contents = parsed.contents;
  if (contents === null) return { doc: { parts, wires, style }, errors };
  if (!isMap(contents)) {
    return {
      doc: null,
      errors: [fenceError(`フェンスの中身は ${TOP_LEVEL_KEYS.join(' / ')} のマップで書きます`, 1)],
    };
  }

  for (const pair of contents.items) {
    const key = scalarText(pair.key) ?? '';
    const line = lineOf(pair.key);

    if (key === 'parts') {
      collectParts(pair.value as ParsedNode | null, { parts, errors, lineOf });
    } else if (key === 'wires') {
      collectWires(pair.value as ParsedNode | null, { wires, errors, lineOf });
    } else if (key === 'style') {
      // `style: *base` のように書けるので、別名は指し先まで開いてから読む。
      const written = pair.value as ParsedNode | null;
      const node = (isAlias(written) ? written.resolve(parsed as Document) : written) as ParsedNode | null;
      // style: が 2 回書かれたら、前に読めたものの上に重ねる (捨てない)。
      const validated = validateStyle(node?.toJSON() as unknown, style);
      style = validated.value;
      // 理由はそれを書いた項目の行に付ける (style: の行だけを指しても直す場所が分からない)。
      const keyLine = styleKeyLines(node, lineOf);
      errors.push(...duplicateStyleKeys(node, lineOf));
      errors.push(
        ...validated.messages.map((item) =>
          fenceError(item.message, (item.key === null ? null : keyLine.get(item.key)) ?? line),
        ),
      );
    } else {
      errors.push(
        fenceError(`知らないキーです: ${safeToken(key)} (${TOP_LEVEL_KEYS.join(' / ')} が使えます)`, line),
      );
    }
  }

  return { doc: { parts, wires, style }, errors };
}

/**
 * style のマップに同じ項目が 2 回書かれていないか。
 * YAML の重複キーはこちらで見ると決めた (uniqueKeys: false) ので、
 * 見ないと後に書いたほうが黙って勝つ。
 */
function duplicateStyleKeys(node: ParsedNode | null, lineOf: LineOf): FenceError[] {
  if (!isMap(node)) return [];

  const seen = new Set<string>();
  const errors: FenceError[] = [];
  for (const pair of node.items) {
    const key = scalarText(pair.key);
    if (key === null) continue;
    if (seen.has(key)) errors.push(fenceError(`style の ${safeToken(key)} が二重に書かれています`, lineOf(pair.key)));
    seen.add(key);
  }
  return errors;
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
        fenceError(`部品 ID ${safeToken(id)} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`, line),
      );
      continue;
    }
    if (seen.has(id)) {
      errors.push(fenceError(`部品 ${safeToken(id)} が二重に定義されています`, line));
      continue;
    }

    const text = scalarText(pair.value);
    if (text === null) {
      errors.push(fenceError(`部品 ${safeToken(id)} の内容は「種類 番地 番地 値」の 1 行で書きます`, line));
      continue;
    }

    // ID は読めたので、中身が読めなくても二重定義は二重定義として報告する。
    seen.add(id);

    const part = parseCompactPart(id, text, line);
    if (part.ok) parts.push(part.value);
    else errors.push(part.error);
  }
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

    const wire = parseWireSpec(text, line);
    if (wire.ok) wires.push(wire.value);
    else errors.push(wire.error);
  }
}

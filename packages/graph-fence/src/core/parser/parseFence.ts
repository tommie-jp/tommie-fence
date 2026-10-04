import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { rememberRecent } from 'fence-kit';
import { dropInvisible, fenceError, notice, safeToken } from '../errors.ts';
import { DATA_NAME, LIMITS, MEASURED_LABEL } from '../limits.ts';
import type { LineSpec, Point } from '../model/lines.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { AxisSpec, FenceDocument, FenceError, NoteSpec, StyleSpec } from '../types.ts';
import { parseAxis } from './axes.ts';
import { parseLineExpr, parseLineKey, parsePoint } from './lines.ts';
import { parseNoteLine } from './notes.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/** 読んだ結果。**`doc` は必ずある** (52 の docs/54「エディターを YAML の都合で止めない」)。 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

/** `x:` を書かなかったときの横軸 (お知らせで言う)。 */
export const DEFAULT_X: AxisSpec = { name: null, unit: 'x', log: false, range: [0, 1], line: null };

const emptyDocument = (): FenceDocument => ({
  title: null, x: null, y: [], lines: [], data: null, notes: [], style: EMPTY_STYLE, keys: [],
});

export const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

/**
 * **書かれたとおりの綴り**を元の字面から切り出す。YAML は `1.50` を `1.5` に
 * 読むので、解決後の値を名指すと行のどこにも無い綴りになる。
 */
export const writtenText = (node: unknown, source: string): string | null => {
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};

type LineOf = (node: Node | Pair | null | undefined) => number | null;

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError('graph フェンスが空です (x: と lines: から書き始めます)', null)] };
  }

  const lineCounter = new LineCounter();
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });
  const lineOf: LineOf = (node) => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };
  const root = parsed.contents;
  const contentLine = lineOf(root as Node | null);

  // **同じ行は 1 件だけ** (yaml は 1 つの壊れ方を 2 度言うことがある)。
  const seen = new Set<number | null>();
  const errors: FenceError[] = parsed.errors.flatMap((error) => {
    const { line } = lineCounter.linePos(error.pos[0]);
    if (seen.has(line)) return [];
    seen.add(line);
    return [fenceError(`YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`, line)];
  });

  if (!isMap(root)) {
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`x: 周波数 Hz log 2k..32k` から)', contentLine));
    return { doc: emptyDocument(), errors };
  }

  const pairs = new Map<string, Pair>();
  for (const pair of root.items) {
    const key = scalarText(pair.key);
    const keyLine = lineOf(pair.key as Node);
    if (key === null) {
      errors.push(fenceError('キーは文字で書きます', keyLine));
      continue;
    }
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (書けるのは ${TOP_LEVEL_KEYS.join(' / ')})`, keyLine, key));
      continue;
    }
    // **同じキーが 2 つあれば言う。** 後勝ちで黙ると、書いたはずのものと違う図が出る。
    if (pairs.has(key)) {
      errors.push(fenceError(`${key}: が 2 つあります (1 つにまとめます)`, keyLine, key));
      continue;
    }
    pairs.set(key, pair);
  }
  const at = (key: string): number | null => {
    const pair = pairs.get(key);
    return pair === undefined ? null : lineOf((pair.value ?? pair.key) as Node);
  };
  const valueOf = (key: string): unknown => pairs.get(key)?.value;

  const title = readTitle(valueOf('title'), at('title'), pairs.has('title'), errors);
  const x = pairs.has('x') ? readAxis(valueOf('x'), 'x', at('x'), source, errors) : null;
  const xUnit = (x ?? DEFAULT_X).unit;
  const y = pairs.has('y') ? readYAxes(valueOf('y'), at('y'), source, lineOf, errors) : [];
  const lines = pairs.has('lines') ? readLines(pairs.get('lines') as Pair, xUnit, source, lineOf, errors) : [];
  const data = pairs.has('data') ? readData(valueOf('data'), at('data'), errors) : null;
  const notes = pairs.has('notes') ? readNotes(valueOf('notes'), lineOf(pairs.get('notes')?.key as Node), xUnit, lineOf, errors) : [];
  const style = pairs.has('style') ? readStyle(valueOf('style'), at('style'), lineOf, errors) : EMPTY_STYLE;

  return { doc: { title, x, y, lines, data, notes, style, keys: [...pairs.keys()] }, errors };
}

function readTitle(value: unknown, at: number | null, written: boolean, errors: FenceError[]): string | null {
  if (!written) return null;
  const text = scalarText(value);
  if (text === null) {
    errors.push(fenceError('title: には図の題を 1 行で書きます', at));
    return null;
  }
  // 見えない字 (bidi・幅 0) は図に刷る前に落とす (並びを偽れる)。
  const shown = dropInvisible(text);
  return shown.trim() === '' ? null : shown;
}

function readAxis(value: unknown, which: 'x' | 'y', at: number | null, source: string, errors: FenceError[]): AxisSpec | null {
  const text = writtenText(value, source) ?? scalarText(value) ?? '';
  const read = parseAxis(text, which);
  if (!read.ok) {
    errors.push({ ...read.error, line: at });
    return null;
  }
  return { ...read.value, line: at };
}

/** `y:` は 1 行か、単位ごとの並び (`- 利得 dB -40..0` / `- 位相 deg -90..0`)。 */
function readYAxes(value: unknown, at: number | null, source: string, lineOf: LineOf, errors: FenceError[]): readonly AxisSpec[] {
  const items = isSeq(value) ? value.items.map((item) => ({ node: item, line: lineOf(item as Node) })) : [{ node: value, line: at }];
  const axes: AxisSpec[] = [];
  for (const { node, line } of items) {
    const axis = readAxis(node, 'y', line, source, errors);
    if (axis === null) continue;
    if (axes.some((one) => one.unit === axis.unit)) {
      errors.push(fenceError(`y: に ${axis.unit} が 2 つあります (単位ごとに 1 つ)`, line, axis.unit));
      continue;
    }
    axes.push(axis);
  }
  return axes;
}

/** `lines:` の並び。キーの順が線の順 (色の順)。 */
function readLines(pair: Pair, xUnit: string, source: string, lineOf: LineOf, errors: FenceError[]): readonly LineSpec[] {
  const value = pair.value;
  if (!isMap(value)) {
    errors.push(fenceError('lines: は「名前 単位: 式」か「名前 単位:」の下に点の並びで書きます', lineOf((value ?? pair.key) as Node)));
    return [];
  }
  const lines: LineSpec[] = [];
  const names = new Set<string>();
  for (const item of value.items) {
    const keyText = scalarText(item.key) ?? '';
    const keyLine = lineOf(item.key as Node);
    if (lines.length >= LIMITS.lines) {
      errors.push(fenceError(`線は ${LIMITS.lines} 本までです`, keyLine));
      break;
    }
    const key = parseLineKey(keyText);
    if (!key.ok) {
      errors.push({ ...key.error, line: keyLine });
      continue;
    }
    const { name, unit } = key.value;
    if (names.has(`${name} ${unit}`)) {
      errors.push(fenceError(`線 ${name} ${unit} が 2 つあります`, keyLine, name));
      continue;
    }
    names.add(`${name} ${unit}`);
    const read = readLineValue(item.value, keyLine, xUnit, unit, source, lineOf, errors);
    if (read !== null) lines.push({ name, unit, source: read, index: lines.length, line: keyLine });
  }
  return lines;
}

function readLineValue(
  value: unknown, keyLine: number | null, xUnit: string, yUnit: string, source: string, lineOf: LineOf, errors: FenceError[],
): LineSpec['source'] | null {
  if (isSeq(value)) {
    if (value.items.length === 0) {
      errors.push(fenceError('点の並びが空です (- 2k 0.38 のように 1 行 1 点)', keyLine));
      return null;
    }
    const points: Point[] = [];
    let broken = false;
    for (const item of value.items) {
      const line = lineOf(item as Node);
      if (points.length >= LIMITS.pointsPerLine) {
        errors.push(fenceError(`点は 1 本に ${LIMITS.pointsPerLine} 個までです`, line));
        broken = true;
        break;
      }
      const text = writtenText(item, source) ?? scalarText(item) ?? '';
      const read = parsePoint(text, xUnit, yUnit);
      if (!read.ok) {
        errors.push({ ...read.error, line });
        broken = true;
        continue;
      }
      points.push(read.value);
    }
    if (broken) return null;
    const sorted = [...points].sort((a, b) => a.x - b.x);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index]?.x === sorted[index - 1]?.x) {
        errors.push(fenceError(`x = ${sorted[index]?.x} の点が 2 つあります (1 つにします)`, keyLine));
        return null;
      }
    }
    return { kind: 'points', points: sorted };
  }
  const text = writtenText(value, source) ?? scalarText(value);
  if (text === null || text.trim() === '') {
    errors.push(fenceError('線の値には式を 1 行で書くか、下に点を「- 2k 0.38」の並びで書きます', keyLine));
    return null;
  }
  const read = parseLineExpr(text);
  if (!read.ok) {
    errors.push({ ...read.error, line: lineOf(value as Node) ?? keyLine });
    return null;
  }
  return { kind: 'expr', expr: read.value, text };
}

function readData(value: unknown, at: number | null, errors: FenceError[]): FenceDocument['data'] {
  // ファイル名の後は凡例の名前 (`data: 9-1.csv 計算`)。書かなければ実測。
  const [file = '', ...words] = (scalarText(value) ?? '').trim().split(/\s+/);
  if (!DATA_NAME.test(file)) {
    errors.push(fenceError(
      'data: には .md と同じ場所の CSV のファイル名を書きます (例: data: 9-1.csv。/ や .. は書けません)',
      at, file || undefined,
    ));
    return null;
  }
  const label = words.join(' ');
  if ([...label].length > LIMITS.dataLabel) {
    errors.push(fenceError(
      `data: の凡例の名前は ${LIMITS.dataLabel} 字までです (例: data: ${file} 計算)`,
      at, label,
    ));
    return null;
  }
  return { name: file, label: label === '' ? MEASURED_LABEL : label, line: at };
}

function readNotes(value: unknown, keyLine: number | null, xUnit: string, lineOf: LineOf, errors: FenceError[]): readonly NoteSpec[] {
  if (!isSeq(value)) {
    errors.push(fenceError('notes: は `- mark 1.59k` のような並びにします', keyLine));
    return [];
  }
  const notes: NoteSpec[] = [];
  for (const item of value.items) {
    const line = lineOf(item as Node);
    if (notes.length >= LIMITS.notes) {
      errors.push(fenceError(`注釈が多すぎます (${LIMITS.notes} 個まで)`, line));
      break;
    }
    const text = scalarText(item);
    if (text !== null) {
      const result = parseNoteLine(text, null, xUnit);
      if (!result.ok) errors.push({ ...result.error, line });
      else notes.push({ ...result.value, line } as NoteSpec);
      continue;
    }
    // `- band 14k 18k: 字` は 1 項目のマップ。字は値の側に来る (基板のフェンスと同じ形)。
    if (isMap(item) && item.items.length === 1) {
      const pair = item.items[0];
      const head = scalarText(pair?.key);
      const body = scalarText(pair?.value);
      const at = lineOf(pair?.key as Node) ?? line;
      if (head !== null && body !== null) {
        const result = parseNoteLine(head, body, xUnit);
        if (!result.ok) errors.push({ ...result.error, line: at });
        else notes.push({ ...result.value, line: at } as NoteSpec);
        continue;
      }
    }
    errors.push(fenceError('注釈は「- mark 1.59k」か「- text 16k 27mA: 字」の形で書きます', line));
  }
  if (notes.filter((note) => note.kind === 'mark').length > LIMITS.marks) {
    errors.push(notice(`mark は ${LIMITS.marks} 本までを読み値にします`, keyLine));
  }
  return notes;
}

function readStyle(value: unknown, at: number | null, lineOf: LineOf, errors: FenceError[]): StyleSpec {
  const lines = new Map<string, number | null>();
  if (isMap(value)) {
    for (const item of value.items) {
      const name = scalarText(item.key);
      if (name !== null) lines.set(name, lineOf((item.value ?? item.key) as Node));
    }
  }
  const read = parseStyle((value as { toJSON?: () => unknown } | null)?.toJSON?.() ?? null, at, lines);
  errors.push(...read.errors);
  return read.style;
}

/**
 * 読んだ結果は**直前の 2 本文ぶん覚える** (`rememberRecent`)。帯と Problems が
 * 同じ本文を続けて読むので、そのたびに YAML を通さない。
 */
export const parseFence = rememberRecent(readFence);

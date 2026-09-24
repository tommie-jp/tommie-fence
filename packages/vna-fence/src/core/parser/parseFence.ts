import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { rememberRecent } from 'fence-kit';
import { fenceError, notice, safeToken } from '../errors.ts';
import { DATA_NAME, LIMITS } from '../limits.ts';
import { DEFAULT_DEVICE, DEVICE_NAMES, isDeviceName } from '../model/device.ts';
import type { DeviceName } from '../model/device.ts';
import type { DutElement } from '../model/dut.ts';
import { formatHertzShort, parseHertz } from '../model/frequency.ts';
import { deviceSweep, parseSweep } from '../model/sweep.ts';
import type { Sweep } from '../model/sweep.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { FenceDocument, FenceError, MarkerSpec, NoteSpec, StyleSpec, TraceSpec } from '../types.ts';
import { parseDutLine } from './dut.ts';
import { parseNoteLine } from './notes.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';
import { parseTraceLine } from './traces.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/**
 * `traces:` を書かなかったときの 3 本。**NanoVNA の既定に近い** (CH0 と CH1 の
 * LOGMAG と、CH0 の Smith)。52 の docs/75 の 3-1 と同じ並び。
 */
export const DEFAULT_TRACES: readonly TraceSpec[] = [
  { param: 'S21', format: 'logmag', vf: null, line: null },
  { param: 'S11', format: 'logmag', vf: null, line: null },
  { param: 'S11', format: 'smith', vf: null, line: null },
];

/** 読んだ結果。**`doc` は必ずある** (52 の docs/54「エディターを YAML の都合で止めない」)。 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

const emptyDocument = (): FenceDocument => ({
  device: DEFAULT_DEVICE,
  sweep: deviceSweep(DEFAULT_DEVICE),
  title: null,
  dut: [],
  data: null,
  traces: DEFAULT_TRACES,
  tracesWritten: false,
  markers: [],
  notes: [],
  style: EMPTY_STYLE,
});

const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

/**
 * **書かれたとおりの綴り**を元の字面から切り出す。YAML は `1.50` を `1.5` に
 * 読むので、解決後の値を名指すと行のどこにも無い綴りになる。
 */
const writtenText = (node: unknown, source: string): string | null => {
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError('vna フェンスが空です (sweep: から書き始めます)', null)] };
  }

  const lineCounter = new LineCounter();
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });
  const lineOf = (node: Node | Pair | null | undefined): number | null => {
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
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`sweep: ...` から)', contentLine));
    return { doc: emptyDocument(), errors };
  }

  let device: DeviceName = DEFAULT_DEVICE;
  let sweep: Sweep | null = null;
  let sweepWritten = false;
  let title: string | null = null;
  const dut: DutElement[] = [];
  let data: FenceDocument['data'] = null;
  const traces: TraceSpec[] = [];
  let tracesWritten = false;
  const markers: MarkerSpec[] = [];
  const notes: NoteSpec[] = [];
  let style: StyleSpec = EMPTY_STYLE;
  const written = new Set<string>();

  /** 並び (`- 1 行`) の項目を 1 つずつ読む。**1 行だけのスカラーも 1 項目として受ける**。 */
  const itemsOf = (node: unknown): readonly { readonly node: unknown; readonly line: number | null }[] => {
    if (isSeq(node)) return node.items.map((item) => ({ node: item, line: lineOf(item as Node) }));
    if (isScalar(node)) return [{ node, line: lineOf(node as Node) }];
    return [];
  };

  const readDut = (value: unknown, keyLine: number | null): void => {
    const items = itemsOf(value);
    if (items.length === 0) {
      errors.push(fenceError('dut: は「series R 100」を 1 行か、`- series R 100` の並びで書きます', keyLine));
      return;
    }
    for (const [index, { node, line }] of items.entries()) {
      if (dut.length >= LIMITS.dutElements) {
        errors.push(fenceError(`dut: の素子が多すぎます (${LIMITS.dutElements} 個まで)`, line));
        break;
      }
      const text = scalarText(node);
      if (text === null) {
        errors.push(fenceError('素子は 1 行に 1 つ書きます (例: - shunt C 47p)', line));
        continue;
      }
      const result = parseDutLine(text);
      if (!result.ok) {
        errors.push({ ...result.error, line });
        continue;
      }
      if (result.value.kind === 'end' && index !== items.length - 1) {
        errors.push(fenceError(`${result.value.end} は模型の最後に書きます (その先は CH1 に繋がりません)`, line, result.value.end));
        continue;
      }
      dut.push({ ...result.value, line });
    }
  };

  const readTraces = (value: unknown, keyLine: number | null): void => {
    tracesWritten = true;
    const items = itemsOf(value);
    if (items.length === 0) {
      errors.push(fenceError('traces: は `- S21 logmag` の並びで書きます', keyLine));
      return;
    }
    for (const { node, line } of items) {
      if (traces.length >= LIMITS.traces) {
        errors.push(fenceError(`トレースは ${LIMITS.traces} 本までです (実機と同じ)`, line));
        break;
      }
      const text = scalarText(node);
      const result = text === null ? null : parseTraceLine(text);
      if (result === null) {
        errors.push(fenceError('トレースは 1 行に 1 本書きます (例: - S21 logmag)', line));
        continue;
      }
      if (!result.ok) {
        errors.push({ ...result.error, line });
        continue;
      }
      if (traces.some((trace) => trace.param === result.value.param && trace.format === result.value.format)) {
        errors.push(notice(`${result.value.param} ${result.value.format} が 2 つあります (1 本だけ描きます)`, line));
        continue;
      }
      traces.push({ ...result.value, line });
    }
  };

  const readMarkers = (value: unknown, keyLine: number | null): void => {
    const items = itemsOf(value);
    if (items.length === 0) {
      errors.push(fenceError('markers: は `- 100M` の並びで書きます', keyLine));
      return;
    }
    for (const { node, line } of items) {
      if (markers.length >= LIMITS.markers) {
        errors.push(fenceError(`マーカーは ${LIMITS.markers} つまでです (実機と同じ)`, line));
        break;
      }
      const text = scalarText(node);
      const f = text === null ? null : parseHertz(text);
      if (f === null) {
        errors.push(fenceError(`マーカーの周波数が読めません: ${safeToken(text ?? '')} (100M / 2.4G / 455k)`, line, text ?? undefined));
        continue;
      }
      markers.push({ f, line });
    }
  };

  const readNotes = (value: unknown, keyLine: number | null): void => {
    if (!isSeq(value)) {
      errors.push(fenceError('notes: は `- text 100M -20dB: 字` のような並びにします', keyLine));
      return;
    }
    for (const item of value.items) {
      const line = lineOf(item as Node);
      if (notes.length >= LIMITS.notes) {
        errors.push(fenceError(`注釈が多すぎます (${LIMITS.notes} 個まで)`, line));
        break;
      }
      const text = scalarText(item);
      if (text !== null) {
        const result = parseNoteLine(text, null);
        if (!result.ok) errors.push({ ...result.error, line });
        else notes.push({ ...result.value, line } as NoteSpec);
        continue;
      }
      // `- text 100M -20dB: 字` は 1 項目のマップ。字は値の側に来る (板のフェンスと同じ形)。
      if (isMap(item) && item.items.length === 1) {
        const pair = item.items[0];
        const head = scalarText(pair?.key);
        const body = scalarText(pair?.value);
        const at = lineOf(pair?.key as Node) ?? line;
        if (head !== null && body !== null) {
          const result = parseNoteLine(head, body);
          if (!result.ok) errors.push({ ...result.error, line: at });
          else notes.push({ ...result.value, line: at } as NoteSpec);
          continue;
        }
      }
      errors.push(fenceError('注釈は「- mark 100M -6dB」か「- text 100M -20dB: 字」の形で書きます', line));
    }
  };

  for (const pair of root.items) {
    const key = scalarText(pair.key);
    const keyLine = lineOf(pair.key as Node);
    const at = lineOf((pair.value ?? pair.key) as Node);
    if (key === null) {
      errors.push(fenceError('キーは文字で書きます', keyLine));
      continue;
    }
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (書けるのは ${TOP_LEVEL_KEYS.join(' / ')})`, keyLine, key));
      continue;
    }
    // **同じキーが 2 つあれば言う。** 後勝ちで黙ると、書いたはずのものと違う図が出る。
    if (written.has(key)) {
      errors.push(fenceError(`${key}: が 2 つあります (1 つにまとめます)`, keyLine, key));
      continue;
    }
    written.add(key);

    switch (key) {
      case 'device': {
        const name = (scalarText(pair.value) ?? '').trim().toLowerCase();
        if (!isDeviceName(name)) {
          errors.push(fenceError(`device: は ${DEVICE_NAMES.join(' / ')} のどれかで書きます`, at, scalarText(pair.value) ?? undefined));
          break;
        }
        device = name;
        break;
      }
      case 'sweep': {
        sweepWritten = true;
        const text = scalarText(pair.value);
        const read = text === null ? null : parseSweep(text);
        if (read === null || !read.ok) {
          const spelled = writtenText(pair.value, source) ?? text ?? '';
          errors.push(fenceError(read === null ? 'sweep: は「1M-300M 101」のように 1 行で書きます' : read.reason, at, spelled || undefined));
          break;
        }
        sweep = read.sweep;
        break;
      }
      case 'title': {
        const text = scalarText(pair.value);
        if (text === null) {
          errors.push(fenceError('title: には図の題を 1 行で書きます', at));
          break;
        }
        title = text.trim() === '' ? null : text;
        break;
      }
      case 'dut':
        readDut(pair.value, keyLine);
        break;
      case 'data': {
        const text = (scalarText(pair.value) ?? '').trim();
        if (!DATA_NAME.test(text)) {
          errors.push(fenceError(
            `data: には .md と同じ場所の Touchstone のファイル名を書きます (例: data: 3-1-100ohm.s2p。/ や .. は書けません)`,
            at, text || undefined,
          ));
          break;
        }
        data = { name: text, line: at };
        break;
      }
      case 'traces':
        readTraces(pair.value, keyLine);
        break;
      case 'markers':
        readMarkers(pair.value, keyLine);
        break;
      case 'notes':
        readNotes(pair.value, keyLine);
        break;
      case 'style': {
        const lines = new Map<string, number | null>();
        if (isMap(pair.value)) {
          for (const item of pair.value.items) {
            const name = scalarText(item.key);
            if (name !== null) lines.set(name, lineOf((item.value ?? item.key) as Node));
          }
        }
        const read = parseStyle((pair.value as { toJSON?: () => unknown } | null)?.toJSON?.() ?? null, at, lines);
        style = read.style;
        errors.push(...read.errors);
        break;
      }
    }
  }

  const resolvedSweep = sweep ?? deviceSweep(device);
  if (!sweepWritten) {
    // **書かなくても止めない。** 機種の範囲で描き、何で描いたかは言う (54)。
    errors.push(notice(
      `sweep: が無いので、機種の範囲 (${formatHertzShort(resolvedSweep.start)}〜${formatHertzShort(resolvedSweep.stop)}、${resolvedSweep.points} 点) で描いています`,
      contentLine,
    ));
  }

  return {
    doc: {
      device,
      sweep: resolvedSweep,
      title,
      dut,
      data,
      traces: tracesWritten && traces.length > 0 ? traces : DEFAULT_TRACES,
      tracesWritten,
      markers,
      notes,
      style,
    },
    errors,
  };
}

/**
 * 読んだ結果は**直前の 2 本文ぶん覚える** (`rememberRecent`)。帯と Problems が
 * 同じ本文を続けて読むので、そのたびに YAML を通さない。
 */
export const parseFence = rememberRecent(readFence);

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Pair } from 'yaml';
import { parsePerDiv, rememberRecent } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { parseDecode } from '../model/decode.ts';
import { DEVICE_HINT, isDeviceName } from '../model/device.ts';
import { fail, ok, wordsOf } from '../model/read.ts';
import type { Read } from '../model/read.ts';
import { RADIXES, isRadix } from '../model/radix.ts';
import { parseSignal } from '../model/signalSpec.ts';
import { FREQUENCY_HINT, TIME_HINT, parseFrequency, parseTime } from '../model/time.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { BusEntry, CursorSpec, DecodeEntry, FenceDocument, FenceError, Located, SignalEntry, TimeSpec, TopLevelKey, TriggerSpec } from '../types.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/** 読んだ結果。**`doc` は必ずある** (52 の docs/54「エディターを YAML の都合で止めない」)。 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

const emptyDocument = (): FenceDocument => ({
  device: null, title: null, time: null, start: null, sample: null, signals: [], buses: [], decode: [], cursors: [], trigger: null,
  style: EMPTY_STYLE, keys: [],
});

export const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

/**
 * **書かれたとおりの綴り**を元の字面から切り出す。YAML は `8192.0` を `8192` に
 * 読むので、解決後の値を名指すと行のどこにも無い綴りになる。
 */
const writtenText = (node: unknown, source: string): string | null => {
  // 引用符で囲んだ値 (`"10s"`) は、引用符を外した中身を読む。生の字面は引用符ごとなので読めない。
  if (isScalar(node) && (node.type === 'QUOTE_DOUBLE' || node.type === 'QUOTE_SINGLE') && typeof node.value === 'string') {
    return node.value === '' ? null : node.value;
  }
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};

type Entry = { readonly pair: Pair; readonly keyLine: number | null; readonly at: number | null };

/** YAML を通し、一番外側のキーを集める (知らないキー・2 つあるキーはここで言う)。 */
function collect(source: string): {
  readonly entries: Map<TopLevelKey, Entry>; readonly keys: readonly string[]; readonly errors: FenceError[];
  readonly lineOf: (node: unknown) => number | null; readonly root: boolean;
} {
  const lineCounter = new LineCounter();
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });
  const lineOf = (node: unknown): number | null => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };
  // **同じ行は 1 件だけ** (yaml は 1 つの壊れ方を 2 度言うことがある)。
  const seen = new Set<number | null>();
  const errors: FenceError[] = parsed.errors.flatMap((error) => {
    const { line } = lineCounter.linePos(error.pos[0]);
    if (seen.has(line)) return [];
    seen.add(line);
    return [fenceError(`YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`, line)];
  });
  const entries = new Map<TopLevelKey, Entry>();
  const root = parsed.contents;
  if (!isMap(root)) {
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`device: ad3` から)', lineOf(root)));
    return { entries, keys: [], errors, lineOf, root: false };
  }
  for (const pair of root.items) {
    const key = scalarText(pair.key);
    const keyLine = lineOf(pair.key);
    if (key === null) {
      errors.push(fenceError('キーは文字で書きます', keyLine));
    } else if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (書けるのは ${TOP_LEVEL_KEYS.join(' / ')})`, keyLine, key));
    } else if (entries.has(key as TopLevelKey)) {
      // **同じキーが 2 つあれば言う。** 後勝ちで黙ると、書いたはずのものと違う図が出る。
      errors.push(fenceError(`${key}: が 2 つあります (1 つにまとめます)`, keyLine, key));
    } else {
      entries.set(key as TopLevelKey, { pair, keyLine, at: lineOf(pair.value ?? pair.key) });
    }
  }
  return { entries, keys: [...entries.keys()], errors, lineOf, root: true };
}

type Context = {
  readonly source: string;
  readonly entries: Map<TopLevelKey, Entry>;
  readonly errors: FenceError[];
  readonly lineOf: (node: unknown) => number | null;
};

/** 1 行の値を読み、読めなければエラーに積む。 */
function one<T>(context: Context, key: TopLevelKey, read: (text: string) => Read<T>): Located<T> | null {
  const entry = context.entries.get(key);
  if (entry === undefined) return null;
  const text = writtenText(entry.pair.value, context.source) ?? scalarText(entry.pair.value) ?? '';
  const result = read(text);
  if (!result.ok) {
    context.errors.push(fenceError(result.reason, entry.at, result.token ?? (text.trim() || undefined)));
    return null;
  }
  return { value: result.value, line: entry.at };
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/;

/** `キー: { 名前: 値 }` の並びを 1 行ずつ取り出す (上限を越えたら言って切る)。 */
function namedRows(context: Context, key: TopLevelKey, limit: number, example: string): readonly { name: string; text: string; line: number | null }[] {
  const entry = context.entries.get(key);
  if (entry === undefined) return [];
  const value = entry.pair.value;
  if (!isMap(value)) {
    context.errors.push(fenceError(`${key}: は「名前: 値」の並びで書きます (例: ${example})`, entry.at));
    return [];
  }
  const rows: { name: string; text: string; line: number | null }[] = [];
  for (const pair of value.items) {
    const line = context.lineOf(pair.key);
    const name = scalarText(pair.key);
    if (rows.length >= limit) {
      context.errors.push(fenceError(`${key}: の行は ${limit} までです`, line));
      break;
    }
    if (name === null || !NAME.test(name)) {
      context.errors.push(fenceError(`名前は英字か _ で始め、英数字と _ . - で ${LIMITS.idLength} 字までに書きます`, line, name ?? undefined));
      continue;
    }
    const text = scalarText(pair.value);
    if (text === null || text.trim() === '') {
      context.errors.push(fenceError(`${name}: には値を 1 行で書きます (例: ${example})`, line, name));
      continue;
    }
    rows.push({ name, text: writtenText(pair.value, context.source) ?? text, line });
  }
  return rows;
}

function readSignals(context: Context): readonly SignalEntry[] {
  const entries: SignalEntry[] = [];
  for (const row of namedRows(context, 'signals', LIMITS.signalRows, 'CLK: dio0 clock 1Hz')) {
    const read = parseSignal(row.text);
    if (!read.ok) {
      context.errors.push(fenceError(read.reason, row.line, read.token));
      continue;
    }
    entries.push({ name: row.name, line: row.line, dio: read.value.dio, spec: read.value.spec });
  }
  return entries;
}

const RANGE = /^(.*?)(\d+)\.\.(.*?)(\d+)$/;

/** `A3..A0` を A3 A2 A1 A0 に。**MSB が先** (書いた向きのまま)。 */
function expandBits(word: string): Read<readonly string[]> {
  // `..` の無い語に正規表現を掛けない (長い語で遅くなる)。
  if (!word.includes('..')) return ok([word]);
  const found = RANGE.exec(word);
  if (found === null) return ok([word]);
  const [, head, from, tail, to] = found;
  if (head !== tail) return fail(`範囲は同じ名前の番号で書きます (A3..A0)`, word);
  const a = Number(from);
  const b = Number(to);
  if (Math.abs(a - b) + 1 > LIMITS.busBits) return fail(`バスは ${LIMITS.busBits} ビットまでです`, word);
  const step = a <= b ? 1 : -1;
  return ok(Array.from({ length: Math.abs(a - b) + 1 }, (_, index) => `${head}${a + index * step}`));
}

function parseBus(name: string, text: string, line: number | null): Read<BusEntry> {
  const words = wordsOf(text);
  const radix = words.pop();
  if (radix === undefined || !isRadix(radix)) {
    return fail(`バスの最後に基数を書きます (${RADIXES.join(' / ')}。例: ${name}: A3 A2 A1 A0 hex)`, radix);
  }
  if (words.length === 0) return fail('バスにするレーンを書きます (例: A3 A2 A1 A0 hex か A3..A0 hex)', radix);
  const bits: string[] = [];
  for (const word of words) {
    if (word.length > LIMITS.wordLength) return fail(`バスの語が長すぎます (${LIMITS.wordLength} 字まで)`, word.slice(0, 20));
    const expanded = expandBits(word);
    if (!expanded.ok) return expanded;
    bits.push(...expanded.value);
  }
  if (bits.length > LIMITS.busBits) return fail(`バスは ${LIMITS.busBits} ビットまでです (${bits.length} ビット)`, name);
  return ok({ name, line, bits, radix });
}

function readBuses(context: Context): readonly BusEntry[] {
  const buses: BusEntry[] = [];
  for (const row of namedRows(context, 'buses', LIMITS.buses, 'Address: A3 A2 A1 A0 hex')) {
    const read = parseBus(row.name, row.text, row.line);
    if (read.ok) buses.push(read.value);
    else context.errors.push(fenceError(read.reason, row.line, read.token));
  }
  return buses;
}

function readDecode(context: Context): readonly DecodeEntry[] {
  const entries: DecodeEntry[] = [];
  for (const row of namedRows(context, 'decode', LIMITS.decodes, 'Serial: uart TXD baud 9600 8N1')) {
    const read = parseDecode(row.text);
    if (read.ok) entries.push({ name: row.name, line: row.line, spec: read.value });
    else context.errors.push(fenceError(read.reason, row.line, read.token));
  }
  return entries;
}

/** `time:` (1 目盛) と `window:` (窓の全部)。片方だけ。 */
function readTime(context: Context): Located<TimeSpec> | null {
  const { entries, errors } = context;
  const time = entries.get('time');
  const window = entries.get('window');
  if (time !== undefined && window !== undefined) {
    errors.push(fenceError('time: と window: は片方だけ書きます (time: は 1 目盛、window: は窓の全部。目盛は 10 で固定です)', window.keyLine, 'window'));
    return null;
  }
  if (time === undefined && window === undefined) {
    errors.push(fenceError('時間軸を書きます — time: 1s/div (1 目盛) か window: 10s (窓の全部。目盛は 10 で固定)', null));
    return null;
  }
  if (time !== undefined) {
    const read = one(context, 'time', (text) => {
      const perDiv = parsePerDiv(text, 's');
      return perDiv === null ? fail<number>(`time: は 1 目盛の時間を /div 付きで書きます (例: time: 1s/div、500ms/div)。${TIME_HINT}`) : ok(perDiv);
    });
    return read === null ? null : { value: { perDiv: read.value, written: 'time' }, line: read.line };
  }
  const read = one(context, 'window', (text) => {
    const seconds = parseTime(text);
    return seconds === null || seconds <= 0 ? fail<number>(`window: は窓の全部の時間で書きます (例: window: 10s)。${TIME_HINT}`) : ok(seconds / LIMITS.divisions);
  });
  return read === null ? null : { value: { perDiv: read.value, written: 'window' }, line: read.line };
}

function readCursors(context: Context): readonly CursorSpec[] {
  const entry = context.entries.get('cursors');
  if (entry === undefined) return [];
  const value = entry.pair.value;
  const items = isSeq(value) ? value.items.map((item) => ({ node: item, line: context.lineOf(item) })) : [{ node: value, line: entry.at }];
  const cursors: CursorSpec[] = [];
  for (const { node, line } of items) {
    if (cursors.length >= LIMITS.cursors) {
      context.errors.push(fenceError('カーソルは X1 と X2 の 2 つまでです', line));
      break;
    }
    const text = writtenText(node, context.source) ?? scalarText(node) ?? '';
    if (/\s/.test(text.trim())) {
      context.errors.push(fenceError('cursors: はリストで書きます (例: cursors: [4.5s, 5.5s]。空白で区切ると 1 つの語に読まれます)', line, text.trim()));
      continue;
    }
    const time = parseTime(text);
    if (time === null) context.errors.push(fenceError(`カーソルの時刻が読めません (例: cursors: [4.5s, 5.5s])。${TIME_HINT}`, line, text || undefined));
    else cursors.push({ time, line });
  }
  return cursors;
}

function readTrigger(context: Context): TriggerSpec | null {
  const entry = context.entries.get('trigger');
  if (entry === undefined) return null;
  const words = wordsOf(scalarText(entry.pair.value) ?? '');
  const [lane, edge, at, when] = words;
  const hint = 'trigger: は「レーン rising」か「レーン falling」に at 時刻 を続けます (例: trigger: CLK rising at 0s)';
  if (lane === undefined || (edge !== 'rising' && edge !== 'falling')) {
    context.errors.push(fenceError(hint, entry.at, edge ?? lane));
    return null;
  }
  if (at === undefined) return { lane, edge, at: null, line: entry.at };
  const time = at === 'at' && words.length === 4 ? parseTime(when ?? '') : null;
  if (time === null) {
    context.errors.push(fenceError(`${hint}。${TIME_HINT}`, entry.at, at === 'at' ? when : at));
    return null;
  }
  return { lane, edge, at: time, line: entry.at };
}

function readStyle(context: Context): FenceDocument['style'] {
  const entry = context.entries.get('style');
  if (entry === undefined) return EMPTY_STYLE;
  const lines = new Map<string, number | null>();
  if (isMap(entry.pair.value)) {
    for (const item of entry.pair.value.items) {
      const name = scalarText(item.key);
      if (name !== null) lines.set(name, context.lineOf(item.value ?? item.key));
    }
  }
  const read = parseStyle((entry.pair.value as { toJSON?: () => unknown } | null)?.toJSON?.() ?? null, entry.at, lines);
  context.errors.push(...read.errors);
  return read.style;
}

function readDevice(context: Context): FenceDocument['device'] {
  const entry = context.entries.get('device');
  if (entry === undefined) {
    context.errors.unshift(fenceError(DEVICE_HINT, null));
    return null;
  }
  const text = (scalarText(entry.pair.value) ?? '').trim();
  if (isDeviceName(text)) return text;
  context.errors.push(fenceError(DEVICE_HINT, entry.at, text || undefined));
  return null;
}

function readTitle(context: Context): string | null {
  const entry = context.entries.get('title');
  if (entry === undefined) return null;
  const text = scalarText(entry.pair.value);
  if (text === null) {
    context.errors.push(fenceError('title: には図の題を 1 行で書きます', entry.at));
    return null;
  }
  return text.trim() === '' ? null : text;
}

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError(`logic フェンスが空です — ${DEVICE_HINT}`, null)] };
  }
  const collected = collect(source);
  if (!collected.root) return { doc: emptyDocument(), errors: collected.errors };
  const context: Context = { source, entries: collected.entries, errors: collected.errors, lineOf: collected.lineOf };
  const device = readDevice(context);
  const doc: FenceDocument = {
    device,
    title: readTitle(context),
    time: readTime(context),
    start: one(context, 'start', (text) => {
      const seconds = parseTime(text);
      return seconds === null ? fail<number>(`start: は窓の左端の時刻です (例: start: 0s、-2ms)。${TIME_HINT}`) : ok(seconds);
    }),
    sample: one(context, 'sample', (text) => {
      const hertz = parseFrequency(text);
      return hertz === null ? fail<number>(`sample: は標本化の周波数です (例: sample: 1kHz、100MHz)。${FREQUENCY_HINT}`) : ok(hertz);
    }),
    signals: readSignals(context),
    buses: readBuses(context),
    decode: readDecode(context),
    cursors: readCursors(context),
    trigger: readTrigger(context),
    style: readStyle(context),
    keys: collected.keys,
  };
  return { doc, errors: context.errors };
}

/**
 * 読んだ結果は**直前の 2 本文ぶん覚える** (`rememberRecent`)。帯と Problems が
 * 同じ本文を続けて読むので、そのたびに YAML を通さない。
 */
export const parseFence = rememberRecent(readFence);

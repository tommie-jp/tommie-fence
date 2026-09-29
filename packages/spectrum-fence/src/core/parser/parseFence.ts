import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Pair } from 'yaml';
import { formatHertzReading, rememberRecent } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import { fenceError, notice, safeToken } from '../errors.ts';
import { DATA_NAME, LIMITS } from '../limits.ts';
import { DEVICE_HINT, deviceOf, isDeviceName } from '../model/device.ts';
import type { Device, DeviceKind, DeviceName } from '../model/device.ts';
import { resolutionOf } from '../model/fftTrace.ts';
import type { HoldEntry } from '../model/hold.ts';
import type { MarkerSpec } from '../model/markers.ts';
import { FREQUENCY_HINT, centered, deviceSweep, parseFrequency, parsePoints, parseSweep } from '../model/sweep.ts';
import type { Read } from '../model/sweep.ts';
import { KEY_KINDS, TOP_LEVEL_KEYS } from '../types.ts';
import type { FenceDocument, FenceError, Located, TopLevelKey } from '../types.ts';
import { parseHoldItem } from './hold.ts';
import { parseMarker, parseSignalLine } from './lines.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';
import { parseDb, parseLevel, parseSamples, parseSwitch, parseUnit, parseWindow } from './values.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/** 読んだ結果。**`doc` は必ずある** (52 の docs/54「エディターを YAML の都合で止めない」)。 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

const emptyDocument = (): FenceDocument => ({
  device: null, title: null, sweep: null, points: null, samples: null, window: null, rbw: null, atten: null, lna: null,
  ref: null, scale: null, unit: null, floor: null, signal: [], hold: [], markers: [], data: null, style: EMPTY_STYLE, keys: [],
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
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};

type Entry = { readonly pair: Pair; readonly keyLine: number | null; readonly at: number | null };

/** 片方の型にしか無いキーを、もう片方の機種で断るときの理由。 */
function refusal(key: TopLevelKey, device: DeviceName, resolution: number | null): string {
  const reasons: Partial<Record<TopLevelKey, string>> = {
    rbw: `分解能は samples: と掃引の幅で決まります${resolution === null ? '' : `。いまは ${formatHertzReading(resolution)}`}`,
    points: 'bin の数は samples: と掃引の幅で決まります',
    atten: 'FFT 型にアッテネータはありません',
    lna: 'FFT 型に LNA はありません',
    window: '掃引型に窓はありません',
    samples: '掃引型の点数は points: で書きます',
  };
  return `${device} では ${key}: は書けません (${reasons[key] ?? '型が違います'})`;
}

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
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`device: tinysa-ultra` から)', lineOf(root)));
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
    context.errors.push(fenceError(result.reason, entry.at, result.token));
    return null;
  }
  return { value: result.value, line: entry.at };
}

/** `sweep:` か `center:` + `span:`。両方・片方だけは断る。 */
function readSweep(context: Context, device: Device | null): FenceDocument['sweep'] {
  const { entries, errors } = context;
  const hasCenter = entries.has('center');
  const hasSpan = entries.has('span');
  if (entries.has('sweep') && (hasCenter || hasSpan)) {
    errors.push(fenceError('sweep: と center: + span: は片方だけ書きます', entries.get('center')?.keyLine ?? entries.get('span')?.keyLine ?? null));
    return null;
  }
  if (hasCenter !== hasSpan) {
    errors.push(fenceError('center: と span: は対で書きます (例: center: 30MHz と span: 2MHz)', (entries.get('center') ?? entries.get('span'))?.keyLine ?? null));
    return null;
  }
  if (hasCenter) {
    const frequency = (text: string): Read<number> => {
      const f = parseFrequency(text);
      return f === null ? { ok: false, reason: FREQUENCY_HINT, token: text.trim() || undefined } as Read<number> : { ok: true, value: f };
    };
    const center = one(context, 'center', frequency);
    const span = one(context, 'span', frequency);
    if (center === null || span === null) return null;
    const read = centered(center.value, span.value);
    if (!read.ok) {
      errors.push(fenceError(read.reason, span.line));
      return null;
    }
    return { value: { ...read.value, centered: true }, line: center.line };
  }
  const sweep = one(context, 'sweep', parseSweep);
  if (sweep !== null && sweep.value.points !== null && device?.kind === 'fft') {
    errors.push(fenceError(`${device === null ? '' : device.label} では sweep: に点数は書けません (bin の数は samples: と掃引の幅で決まります)`, sweep.line, String(sweep.value.points)));
    return { value: { ...sweep.value, points: null, centered: false }, line: sweep.line };
  }
  return sweep === null ? null : { value: { ...sweep.value, centered: false }, line: sweep.line };
}

/** `signal:` — 1 行なら 1 つ、並びなら和 (16 まで)。 */
function readSignal(context: Context): readonly Located<WaveSpec>[] {
  const entry = context.entries.get('signal');
  if (entry === undefined) return [];
  const value = entry.pair.value;
  const items = isSeq(value) ? value.items.map((item) => ({ node: item, line: context.lineOf(item) })) : [{ node: value, line: entry.at }];
  const waves: Located<WaveSpec>[] = [];
  for (const { node, line } of items) {
    if (waves.length >= LIMITS.signals) {
      context.errors.push(fenceError(`signal: の波は ${LIMITS.signals} 本までです`, line));
      break;
    }
    const text = scalarText(node);
    if (text === null || text.trim() === '') {
      context.errors.push(fenceError('signal: には波を 1 行で書きます (例: signal: square 100MHz -10dBm)', line));
      continue;
    }
    const read = parseSignalLine(text);
    if (!read.ok) {
      context.errors.push(fenceError(read.reason, line, read.token));
      continue;
    }
    for (const said of read.value.assumed) context.errors.push(notice(said, line));
    waves.push({ value: read.value.wave, line });
  }
  return waves;
}

/** `hold:` の 1 つ (1 行の波・範囲) を読み、お知らせと読めなかった行を積む。 */
function readHoldLine(context: Context, node: unknown, line: number | null, kind: DeviceKind, nested: boolean): HoldEntry | null {
  const text = scalarText(node);
  if (text === null || text.trim() === '') {
    context.errors.push(fenceError('hold: には波を 1 行で書きます (例: hold: sine 74MHz..102MHz -54.4dBm)。1 回の掃引に波が複数なら [波, 波] と並べます', line));
    return null;
  }
  const read = parseHoldItem(text, kind);
  if (!read.ok) {
    context.errors.push(fenceError(read.reason, line, read.token));
    return null;
  }
  for (const said of read.value.assumed) context.errors.push(notice(said, line));
  if (read.value.kind === 'tune') {
    if (nested) {
      context.errors.push(fenceError('[波, 波] の中に範囲は書けません (動かす波は 1 行で `- sine 74M..102M …` と書きます)', line));
      return null;
    }
    return { kind: 'tune', wave: read.value.wave, from: read.value.from, to: read.value.to, step: read.value.step, line };
  }
  return { kind: 'waves', waves: [read.value.wave], line };
}

/** `hold:` — 掃引の並び。1 つの掃引は 1 行の波か、`[波, 波]` (和)。 */
function readHold(context: Context, kind: DeviceKind): readonly HoldEntry[] {
  const entry = context.entries.get('hold');
  if (entry === undefined) return [];
  const value = entry.pair.value;
  const items = isSeq(value) ? value.items.map((item) => ({ node: item, line: context.lineOf(item) })) : [{ node: value, line: entry.at }];
  const entries: HoldEntry[] = [];
  for (const { node, line } of items) {
    if (entries.length >= LIMITS.holdEntries) {
      context.errors.push(fenceError(`hold: の行は ${LIMITS.holdEntries} までです (範囲 \`74M..102M\` なら 1 行で何回でも動かせます)`, line));
      break;
    }
    if (!isSeq(node)) {
      const one = readHoldLine(context, node, line, kind, false);
      if (one !== null) entries.push(one);
      continue;
    }
    const parts = node.items.map((item) => readHoldLine(context, item, context.lineOf(item) ?? line, kind, true));
    const waves = parts.flatMap((part) => (part?.kind === 'waves' ? part.waves : []));
    if (waves.length > 0) entries.push({ kind: 'waves', waves, line });
  }
  return entries;
}

/** `markers:` — 並びか 1 つ。4 つまで。 */
function readMarkers(context: Context): readonly MarkerSpec[] {
  const entry = context.entries.get('markers');
  if (entry === undefined) return [];
  const value = entry.pair.value;
  const items = isSeq(value) ? value.items.map((item) => ({ node: item, line: context.lineOf(item) })) : [{ node: value, line: entry.at }];
  const markers: MarkerSpec[] = [];
  for (const { node, line } of items) {
    if (markers.length >= LIMITS.markers) {
      context.errors.push(fenceError(`マーカーは ${LIMITS.markers} つまでです (M1〜M4)`, line));
      break;
    }
    const read = parseMarker(writtenText(node, context.source) ?? scalarText(node) ?? '', line);
    if (read.ok) markers.push(read.value);
    else context.errors.push(fenceError(read.reason, line, read.token));
  }
  return markers;
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

/** 型に無いキーと、機種に無い物 (LNA・フロア) を断り、読む前に外す。 */
function refuseByKind(context: Context, name: DeviceName, device: Device, resolution: number | null): void {
  for (const [key, entry] of [...context.entries]) {
    if (!KEY_KINDS[key].includes(device.kind)) {
      context.errors.push(fenceError(refusal(key, name, resolution), entry.keyLine, key));
      context.entries.delete(key);
    }
  }
  const floor = context.entries.get('floor');
  if (floor !== undefined && device.danl !== undefined) {
    context.errors.push(fenceError(`${name} では floor: は書けません (フロアは機種の DANL と rbw: atten: lna: で決まります。書けるのは generic と ad2 / ad3)`, floor.keyLine, 'floor'));
    context.entries.delete('floor');
  }
}

function readDevice(context: Context): DeviceName | null {
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

function readData(context: Context): FenceDocument['data'] {
  const entry = context.entries.get('data');
  if (entry === undefined) return null;
  const text = (scalarText(entry.pair.value) ?? '').trim();
  if (!DATA_NAME.test(text)) {
    context.errors.push(fenceError(
      'data: には .md と同じ場所の CSV のファイル名を書きます (例: data: 11-12-fm.csv。/ や .. は書けません)',
      entry.at, text || undefined,
    ));
    return null;
  }
  return { value: text, line: entry.at };
}

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError(`spectrum フェンスが空です — ${DEVICE_HINT}`, null)] };
  }
  const collected = collect(source);
  if (!collected.root) return { doc: emptyDocument(), errors: collected.errors };
  const context: Context = { source, entries: collected.entries, errors: collected.errors, lineOf: collected.lineOf };

  const name = readDevice(context);
  const device = name === null ? null : deviceOf(name);
  const sweep = readSweep(context, device);
  const samples = device?.kind === 'fft' ? one(context, 'samples', parseSamples) : null;
  if (name !== null && device !== null) {
    const stop = (sweep?.value ?? deviceSweep(device)).stop;
    const resolution = device.kind === 'fft' && stop > 0 ? resolutionOf(stop, samples?.value ?? device.samples?.default ?? 8192) : null;
    refuseByKind(context, name, device, resolution);
  }
  const has = (key: TopLevelKey): boolean => context.entries.has(key);
  if (has('notes')) context.errors.push(fenceError('notes: はまだ書けません (この版で描けるのは信号・マーカー・受信機の設定)', context.entries.get('notes')?.keyLine ?? null, 'notes'));
  if (has('points') && sweep?.value.points !== null && sweep !== null) {
    context.errors.push(fenceError('点数は sweep: か points: の片方に書きます', context.entries.get('points')?.keyLine ?? null, 'points'));
    context.entries.delete('points');
  }
  const lna = context.entries.get('lna');
  const lnaRead = lna === undefined ? null : parseSwitch(isScalar(lna.pair.value) ? lna.pair.value.value : null, 'lna');
  if (lnaRead !== null && !lnaRead.ok) context.errors.push(fenceError(lnaRead.reason, lna?.at ?? null));
  if (lnaRead?.ok === true && lnaRead.value && device !== null && device.lnaGain === undefined) {
    context.errors.push(fenceError(`${name ?? ''} には LNA がありません (lna: on を書けるのは tinysa-ultra)`, lna?.at ?? null));
  }

  const data = readData(context);
  const holdRead = device === null ? [] : readHold(context, device.kind);
  const hold = data !== null && holdRead.length > 0 ? [] : holdRead;
  if (hold !== holdRead) context.errors.push(fenceError('data: と hold: は一緒に書けません (測った CSV は保持済みのトレースなので、hold: は外して描きます)', context.entries.get('hold')?.keyLine ?? null, 'hold'));

  const doc: FenceDocument = {
    device: name,
    title: readTitle(context),
    sweep,
    points: one(context, 'points', parsePoints),
    samples,
    window: one(context, 'window', parseWindow),
    rbw: one(context, 'rbw', (text) => {
      const f = parseFrequency(text);
      return f === null || f === 0 ? { ok: false, reason: `rbw: は 300kHz / 3kHz のように単位を付けます`, token: text.trim() || undefined } as Read<number> : { ok: true, value: f };
    }),
    atten: one(context, 'atten', (text) => parseDb(text, 'atten', { min: 0, max: device?.attenMax ?? 70 })),
    lna: lnaRead?.ok === true && (!lnaRead.value || device?.lnaGain !== undefined) ? { value: lnaRead.value, line: lna?.at ?? null } : null,
    ref: one(context, 'ref', (text) => parseLevel(text, 'ref')),
    scale: one(context, 'scale', (text) => parseDb(text, 'scale', LIMITS.scale)),
    unit: one(context, 'unit', parseUnit),
    floor: one(context, 'floor', (text) => parseLevel(text, 'floor')),
    signal: readSignal(context),
    hold,
    markers: readMarkers(context),
    data,
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

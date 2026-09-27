import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { formatPerDiv, parsePerDiv, rememberRecent } from 'fence-kit';
import { fenceError, notice, safeToken } from '../errors.ts';
import { DATA_NAME, LIMITS } from '../limits.ts';
import { CHANNEL_NAMES } from '../model/channel.ts';
import type { ChannelName, ChannelSpec } from '../model/channel.ts';
import type { MeasureName } from '../model/measure.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { CursorSpec, FenceDocument, FenceError, StyleSpec, TimeSpec, TriggerSpec } from '../types.ts';
import { parseChannelLine, parseCursor, parseMeasureNames, parsePosition, parseTriggerLine } from './lines.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/** 読んだ結果。**`doc` は必ずある** (52 の docs/54「エディターを YAML の都合で止めない」)。 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

const emptyDocument = (): FenceDocument => ({
  view: 'time',
  title: null,
  time: null,
  trigger: null,
  channels: [],
  data: null,
  cursors: [],
  measures: null,
  style: EMPTY_STYLE,
  keys: [],
});

/** ch を並びの形で書くときの項目。 */
export const CHANNEL_KEYS = ['wave', 'range', 'position'] as const;

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

const TIME_HINT = 'time: は 1ms/div / 200us/div のように /div を付けます';

function readTime(text: string | null, at: number | null): TimeSpec | FenceError {
  const perDiv = text === null ? null : parsePerDiv(text, 's');
  if (perDiv === null) return fenceError(TIME_HINT, at, text ?? undefined);
  const { min, max } = LIMITS.perDiv;
  if (perDiv < min || perDiv > max) {
    return fenceError(`time: は ${formatPerDiv(min, 's')}〜${formatPerDiv(max, 's')} です`, at, text ?? undefined);
  }
  return { perDiv, line: at };
}

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError('scope フェンスが空です (ch1: から書き始めます)', null)] };
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
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`ch1: ...` から)', contentLine));
    return { doc: emptyDocument(), errors };
  }

  let title: string | null = null;
  let time: TimeSpec | null = null;
  let trigger: TriggerSpec | null = null;
  let data: FenceDocument['data'] = null;
  const cursors: CursorSpec[] = [];
  let measures: readonly MeasureName[] | null = null;
  let style: StyleSpec = EMPTY_STYLE;
  const written = new Set<string>();
  /** ch の行は全部集めてから ch1 → ch4 の順に読む (参照は前の ch だけ)。 */
  const channelPairs = new Map<ChannelName, Pair>();

  /** 並び (`- 1 行`) の項目。**1 行だけのスカラーも受ける** (`cursors: 1ms`)。 */
  const itemsOf = (node: unknown): readonly { readonly node: unknown; readonly line: number | null }[] => {
    if (isSeq(node)) return node.items.map((item) => ({ node: item, line: lineOf(item as Node) }));
    if (isScalar(node)) return [{ node, line: lineOf(node as Node) }];
    return [];
  };

  const readCursors = (value: unknown, keyLine: number | null): void => {
    const items = itemsOf(value);
    if (items.length === 0) errors.push(fenceError('cursors: は [0, 1ms] か `- 1ms` の並びで書きます', keyLine));
    for (const { node, line } of items) {
      if (cursors.length >= LIMITS.cursors) {
        errors.push(fenceError(`カーソルは ${LIMITS.cursors} 本までです (X1 と X2)`, line));
        break;
      }
      const text = writtenText(node, source) ?? scalarText(node) ?? '';
      const read = parseCursor(text);
      if (!read.ok) errors.push({ ...read.error, line });
      else cursors.push({ t: read.value, line });
    }
  };

  const readMeasures = (value: unknown, at: number | null): void => {
    const names = isSeq(value)
      ? value.items.map((item) => scalarText(item) ?? '')
      : (scalarText(value) ?? '').split(/[\s,]+/).filter((word) => word !== '');
    if (names.length === 0) {
      errors.push(fenceError('measure: は [vpp, freq] のように並べます', at));
      return;
    }
    const read = parseMeasureNames(names);
    if (!read.ok) errors.push({ ...read.error, line: at });
    else measures = read.value;
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
      case 'view': {
        const text = (scalarText(pair.value) ?? '').trim();
        if (text === 'xy') errors.push(fenceError('view: xy はまだ描けません (この版で描けるのは time だけ)', at, text));
        else if (text !== 'time') errors.push(fenceError('view: は time か xy です', at, text || undefined));
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
      case 'time': {
        const read = readTime(writtenText(pair.value, source) ?? scalarText(pair.value), at);
        if ('message' in read) errors.push(read);
        else time = read;
        break;
      }
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
      case 'trigger': {
        const read = parseTriggerLine(scalarText(pair.value) ?? '');
        if (!read.ok) errors.push({ ...read.error, line: at });
        else trigger = { ...read.value, line: at };
        break;
      }
      case 'data': {
        const text = (scalarText(pair.value) ?? '').trim();
        if (!DATA_NAME.test(text)) {
          errors.push(fenceError(
            'data: には .md と同じ場所の WaveForms の CSV のファイル名を書きます (例: data: 5-1-rc.csv。/ や .. は書けません)',
            at, text || undefined,
          ));
          break;
        }
        data = { name: text, line: at };
        break;
      }
      case 'cursors':
        readCursors(pair.value, keyLine);
        break;
      case 'measure':
        readMeasures(pair.value, at);
        break;
      case 'math':
      case 'notes':
        errors.push(fenceError(`${key}: はまだ書けません (この版で描けるのは ch1〜ch4 の波と操作だけ)`, keyLine, key));
        break;
      default:
        channelPairs.set(key as ChannelName, pair);
        break;
    }
  }

  const channels = readChannels(channelPairs, source, lineOf, errors);
  if (trigger !== null && !channels.some((channel) => channel.name === trigger?.source)) {
    const written = channelPairs.has(trigger.source);
    errors.push(fenceError(
      written ? `trigger: の ${trigger.source} が読めないので、トリガを合わせられません` : `trigger: の ${trigger.source} が書かれていません`,
      trigger.line, trigger.source,
    ));
    trigger = null;
  }

  return { doc: { view: 'time', title, time, trigger, channels, data, cursors, measures, style, keys: [...written] }, errors };
}

type LineOf = (node: Node | Pair | null | undefined) => number | null;

/** ch の値 1 つ。1 行 (`sine 1kHz 1V`) か並び (`{wave: …, range: 500mV/div, position: -2div}`)。 */
function channelText(
  pair: Pair, source: string, lineOf: LineOf, errors: FenceError[],
): { readonly text: string; readonly range: number | null; readonly position: number | null } | null {
  const at = lineOf((pair.value ?? pair.key) as Node);
  const name = scalarText(pair.key) ?? 'ch';
  if (!isMap(pair.value)) {
    const text = scalarText(pair.value);
    if (text === null || text.trim() === '') {
      errors.push(fenceError(`${name}: には波を 1 行で書きます (例: ${name}: sine 1kHz 1V)`, at));
      return null;
    }
    return { text, range: null, position: null };
  }
  let text: string | null = null;
  let range: number | null = null;
  let position: number | null = null;
  let broken = false;
  for (const item of pair.value.items) {
    const key = scalarText(item.key) ?? '';
    const line = lineOf((item.value ?? item.key) as Node);
    const value = writtenText(item.value, source) ?? scalarText(item.value) ?? '';
    if (key === 'wave') {
      text = scalarText(item.value);
    } else if (key === 'range') {
      range = parsePerDiv(value, 'V');
      const { min, max } = LIMITS.voltsPerDiv;
      if (range === null || range < min || range > max) {
        errors.push(fenceError('range: は 500mV/div / 2V/div のように /div を付けます', line, value || undefined));
        broken = true;
      }
    } else if (key === 'position') {
      position = parsePosition(value);
      if (position === null || Math.abs(position) > 100) {
        errors.push(fenceError('position: は 0 V の基準の位置を -2div のように書きます (中央が 0、上が正)', line, value || undefined));
        broken = true;
      }
    } else {
      errors.push(fenceError(`知らない項目です: ${safeToken(key)} (書けるのは ${CHANNEL_KEYS.join(' / ')})`, line, key || undefined));
      broken = true;
    }
  }
  if (text === null) {
    errors.push(fenceError(`${name}: を並びで書くときは wave: が要ります (例: {wave: sine 1kHz 1V, range: 500mV/div})`, at));
    return null;
  }
  return broken ? null : { text, range, position };
}

/** ch を ch1 → ch4 の順に読む。**参照できるのは自分より前の、読めた ch だけ**。 */
function readChannels(pairs: ReadonlyMap<ChannelName, Pair>, source: string, lineOf: LineOf, errors: FenceError[]): readonly ChannelSpec[] {
  const channels: ChannelSpec[] = [];
  for (const name of CHANNEL_NAMES) {
    const pair = pairs.get(name);
    if (pair === undefined) continue;
    const at = lineOf((pair.value ?? pair.key) as Node);
    const written = channelText(pair, source, lineOf, errors);
    if (written === null) continue;
    const target = /^\s*(ch\d)\b/.exec(written.text)?.[1];
    if (target !== undefined && pairs.has(target as ChannelName) && CHANNEL_NAMES.indexOf(target as ChannelName) < CHANNEL_NAMES.indexOf(name)
      && !channels.some((channel) => channel.name === target)) {
      errors.push(fenceError(`${target} が読めないので ${name} も描けません`, at, target));
      continue;
    }
    const read = parseChannelLine(name, written.text, channels.map((channel) => channel.name));
    if (!read.ok) {
      errors.push({ ...read.error, line: at });
      continue;
    }
    for (const said of read.value.assumed) errors.push(notice(said, at));
    channels.push({ name, source: read.value.source, ops: read.value.ops, range: written.range, position: written.position, line: at });
  }
  return channels;
}

/**
 * 読んだ結果は**直前の 2 本文ぶん覚える** (`rememberRecent`)。帯と Problems が
 * 同じ本文を続けて読むので、そのたびに YAML を通さない。
 */
export const parseFence = rememberRecent(readFence);

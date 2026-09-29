import { LIMITS } from '../limits.ts';
import type { DioRange } from '../types.ts';
import { FREQUENCY_HINT, TIME_HINT, parseFrequency, parseTime } from './time.ts';
import { fail, ok, wordsOf } from './read.ts';
import type { Read } from './read.ts';

/**
 * `signals:` の 1 行の中身。**波の形を言うだけ** — 高低に直すのは `wave.ts`。
 * 書き方は `[dioN | dioN..dioM] 種類 引数…`。
 */
export type Direction = 'rising' | 'falling';

export type SignalSpec =
  | { readonly kind: 'clock'; readonly frequency: number; readonly duty: number }
  | { readonly kind: 'pulse'; readonly at: number; readonly width: number }
  | { readonly kind: 'pattern'; readonly bits: string; readonly bitTime: number; readonly from: number; readonly repeat: boolean }
  | { readonly kind: 'level'; readonly level: 0 | 1 }
  | { readonly kind: 'edges'; readonly pairs: readonly (readonly [number, 0 | 1])[] }
  | {
    readonly kind: 'counter';
    /** `bits N` で書いた幅。`dioA..dioB` の範囲から決めるなら null。 */
    readonly bits: number | null;
    readonly on: string;
    readonly edge: Direction;
    readonly start: number;
    readonly wrap: number | null;
    readonly sequence: readonly number[] | null;
    readonly repeat: boolean;
  };

export const KINDS = ['clock', 'pulse', 'pattern', 'high', 'low', 'edges', 'counter'] as const;

export const SIGNAL_HINT = `signals: の値は「種類 引数…」で書きます (種類は ${KINDS.join(' / ')}。例: CLK: dio0 clock 1Hz)`;

const DIO = /^dio(\d{1,2})(?:\.\.dio(\d{1,2}))?$/i;

/** 先頭の `dio3` / `dio1..dio4` を読む。 */
function takeDio(words: string[]): Read<DioRange | null> {
  const first = words[0] ?? '';
  if (!/^dio/i.test(first)) return ok(null);
  const found = DIO.exec(first);
  if (found === null) return fail('DIO は dio3 か dio1..dio4 のように書きます', first);
  const from = Number(found[1]);
  const to = found[2] === undefined ? from : Number(found[2]);
  if (to < from) return fail(`${first} は小さい番号から書きます (dio${to}..dio${from})`, first);
  words.shift();
  return ok({ from, to });
}

const PERCENT = /^(\d+(?:\.\d+)?)\s*%$/;

function readClock(words: readonly string[]): Read<SignalSpec> {
  const frequency = parseFrequency(words[0] ?? '');
  if (frequency === null) return fail(`clock の周波数が読めません。${FREQUENCY_HINT} (例: clock 1Hz)`, words[0]);
  let duty = 0.5;
  const rest = words.slice(1);
  if (rest.length > 0) {
    const percent = rest[0] === 'duty' && rest.length === 2 ? PERCENT.exec(rest[1] ?? '') : null;
    if (percent === null) return fail('clock の後ろに書けるのは duty 25% だけです', rest[0]);
    duty = Number(percent[1]) / 100;
    if (!(duty > 0 && duty < 1)) return fail('duty は 0 % より大きく 100 % より小さくします (0 % と 100 % は high / low で書きます)', rest[1]);
  }
  return ok({ kind: 'clock', frequency, duty });
}

function readPulse(words: readonly string[]): Read<SignalSpec> {
  if (words.length !== 2) return fail('pulse は「pulse 開始 幅」で書きます (例: pulse 2s 500ms)');
  const at = parseTime(words[0] ?? '');
  if (at === null) return fail(`pulse の開始が読めません。${TIME_HINT}`, words[0]);
  const width = parseTime(words[1] ?? '');
  if (width === null || width <= 0) return fail(`pulse の幅は 0 より大きい時間で書きます。${TIME_HINT}`, words[1]);
  return ok({ kind: 'pulse', at, width });
}

function readPattern(words: readonly string[]): Read<SignalSpec> {
  const bits = (words[0] ?? '').replace(/_/g, '');
  if (!/^[01]+$/.test(bits)) return fail('pattern の bit は 0 と 1 の並びで書きます (例: pattern 0110 bit 1ms)', words[0]);
  if (bits.length > LIMITS.patternBits) return fail(`pattern は ${LIMITS.patternBits} bit までです`, words[0]);
  if (words[1] !== 'bit') return fail('pattern には 1 bit の長さを書きます (例: pattern 0110 bit 1ms)', words[1]);
  const bitTime = parseTime(words[2] ?? '');
  if (bitTime === null || bitTime <= 0) return fail(`bit の長さは 0 より大きい時間で書きます。${TIME_HINT}`, words[2]);
  let from = 0;
  let repeat = false;
  for (let index = 3; index < words.length; index += 1) {
    const word = words[index] ?? '';
    if (word === 'repeat') {
      repeat = true;
    } else if (word === 'from') {
      const read = parseTime(words[index + 1] ?? '');
      if (read === null) return fail(`pattern の from が読めません。${TIME_HINT}`, words[index + 1] ?? word);
      from = read;
      index += 1;
    } else {
      return fail('pattern の後ろに書けるのは from 時刻 と repeat です', word);
    }
  }
  return ok({ kind: 'pattern', bits, bitTime, from, repeat });
}

const PAIR = /^(.+)=([01])$/;

function readEdges(words: readonly string[]): Read<SignalSpec> {
  if (words.length === 0) return fail('edges は「時刻=値」を並べます (例: edges 0s=0 1.5s=1 3s=0)');
  if (words.length > LIMITS.edgePairs) return fail(`edges は ${LIMITS.edgePairs} 組までです`);
  const pairs: (readonly [number, 0 | 1])[] = [];
  for (const word of words) {
    const found = PAIR.exec(word);
    const time = found === null ? null : parseTime(found[1] ?? '');
    if (found === null || time === null) return fail(`edges の組は 時刻=0 か 時刻=1 で書きます (例: 1.5s=1)。${TIME_HINT}`, word);
    const previous = pairs[pairs.length - 1];
    if (previous !== undefined && time <= previous[0]) return fail('edges の時刻は前より後にします', word);
    pairs.push([time, found[2] === '1' ? 1 : 0]);
  }
  return ok({ kind: 'edges', pairs });
}

const NUMBER = /^(?:0x[0-9a-f]+|0b[01]+|\d+)$/i;

/** counter の数 (10 進・`0x`・`0b`)。 */
export const counterNumber = (word: string): number | null => (NUMBER.test(word) ? Number(word) : null);

function readCounter(words: readonly string[]): Read<SignalSpec> {
  let bits: number | null = null;
  let on: string | null = null;
  let edge: Direction | null = null;
  let start: number | null = null;
  let wrap: number | null = null;
  let sequence: number[] | null = null;
  let repeat = false;
  const value = (word: string | undefined, what: string): Read<number> => {
    const number = counterNumber(word ?? '');
    return number === null || !Number.isSafeInteger(number)
      ? fail(`counter の ${what} は 0 以上の整数で書きます (10 進か 0x1F)`, word)
      : ok(number);
  };
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? '';
    const next = words[index + 1];
    if (word === 'bits') {
      const read = value(next, 'bits');
      if (!read.ok) return read;
      if (read.value < 1 || read.value > LIMITS.busBits) return fail(`counter の bits は 1〜${LIMITS.busBits} です`, next);
      bits = read.value;
      index += 1;
    } else if (word === 'on') {
      const direction = words[index + 2];
      if (next === undefined || (direction !== 'rising' && direction !== 'falling')) {
        return fail('counter は「on レーン名 rising」か「on レーン名 falling」で数える edge を書きます', direction ?? next ?? word);
      }
      on = next;
      edge = direction;
      index += 2;
    } else if (word === 'start' || word === 'wrap') {
      const read = value(next, word);
      if (!read.ok) return read;
      if (word === 'start') start = read.value;
      else wrap = read.value;
      index += 1;
    } else if (word === 'sequence') {
      sequence = [];
      // 数の続く限りが sequence (数でない語は次のキーワードとして読む)。
      for (let at = index + 1; at < words.length && counterNumber(words[at] ?? '') !== null; at += 1) {
        const read = value(words[at], 'sequence');
        if (!read.ok) return read;
        sequence.push(read.value);
        index = at;
      }
      if (sequence.length === 0) return fail('sequence には値を並べます (例: sequence 0 1 2 3 4 5 3)');
      if (sequence.length > LIMITS.sequenceLength) return fail(`sequence は ${LIMITS.sequenceLength} 個までです`);
    } else if (word === 'repeat') {
      repeat = true;
    } else {
      return fail('counter に書けるのは bits N / on レーン edge / start N / wrap N / sequence … / repeat です', word);
    }
  }
  if (on === null || edge === null) return fail('counter は数える edge を書きます (例: counter on CLK rising)');
  if (sequence !== null && (start !== null || wrap !== null)) return fail('sequence と start / wrap は一緒に書けません (sequence の最初の値が start です)');
  if (repeat && sequence === null) return fail('repeat は sequence と一緒に書きます (start / wrap は自動で繰り返します)', 'repeat');
  if (wrap !== null && wrap < 2) return fail('wrap は 2 以上です', String(wrap));
  return ok({ kind: 'counter', bits, on, edge, start: start ?? 0, wrap, sequence, repeat });
}

/** `signals:` の値 1 行を読む。 */
export function parseSignal(text: string): Read<{ readonly dio: DioRange | null; readonly spec: SignalSpec }> {
  const words = wordsOf(text);
  const dio = takeDio(words);
  if (!dio.ok) return dio;
  const kind = words.shift();
  if (kind === undefined) return fail(SIGNAL_HINT);
  let spec: Read<SignalSpec>;
  switch (kind) {
    case 'clock': spec = readClock(words); break;
    case 'pulse': spec = readPulse(words); break;
    case 'pattern': spec = readPattern(words); break;
    case 'edges': spec = readEdges(words); break;
    case 'counter': spec = readCounter(words); break;
    case 'high':
    case 'low':
      spec = words.length === 0 ? ok({ kind: 'level', level: kind === 'high' ? 1 : 0 }) : fail(`${kind} に引数は書きません`, words[0]);
      break;
    default:
      return fail(`知らない種類です: ${kind}。${SIGNAL_HINT}`, kind);
  }
  return spec.ok ? ok({ dio: dio.value, spec: spec.value }) : spec;
}

import { formatHertzShort, isBareNumber, parseSeconds, parseVolts, parseWave } from 'fence-kit';
import { safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { CHANNEL_NAMES } from '../model/channel.ts';
import type { ChannelName, ChannelSource } from '../model/channel.ts';
import { dimText, isVolts, parseExpr } from '../model/expr.ts';
import { MEASURE_NAMES } from '../model/measure.ts';
import type { MeasureName } from '../model/measure.ts';
import { OP_NAMES } from '../model/ops.ts';
import type { Op } from '../model/ops.ts';
import type { TriggerEdge } from '../model/screen.ts';
import { fail, ok, wordsOf } from './result.ts';
import type { LineResult } from './result.ts';

/**
 * 1 行ずつの読み (ch・トリガ・カーソル・Measurements)。**書くのは AI という前提**
 * (直下の CLAUDE.md の文法の方針): 単位の無い数は断り、エラー文に受ける綴りか
 * 正しい例を 1 つ書く。行番号は呼ぶ側 (`parseFence`) が付ける。
 */

const isChannelName = (text: string): text is ChannelName => (CHANNEL_NAMES as readonly string[]).includes(text);


/** 1 つの ch の読んだ結果。`assumed` は補った既定 (呼ぶ側がお知らせで言う)。 */
export type ChannelLine = {
  readonly name: ChannelName;
  readonly source: ChannelSource;
  readonly ops: readonly Op[];
  readonly assumed: readonly string[];
};

const OP_HINT = `操作は ${OP_NAMES.join(' / ')} のどれかです`;
const CLIP_HINT = 'clip は「clip -0.7V 0.7V」(両側) か「clip 0V」(下だけ) の形で書きます';

/** 電圧 1 つ (peak の綴りだけ。`Vpp` `Vrms` `dBm` は振幅にしか書けない)。 */
const plainVolts = (text: string | undefined): number | null => {
  const read = text === undefined ? null : parseVolts(text);
  return read !== null && read.kind === 'peak' ? read.volts : null;
};

/** τ 1 つを取る操作 (`rc 1ms` `hp 1ms` `peak 150ms` `integrate 1ms`)。 */
const TAU_EXAMPLE = { rc: '1ms', hp: '1ms', peak: '150ms', integrate: '1ms' } as const;

function tauOp(kind: keyof typeof TAU_EXAMPLE, words: readonly string[]): LineResult<Op> {
  const [, first] = words;
  const tau = first === undefined ? null : parseSeconds(first);
  if (tau === null || tau <= 0 || words.length > 2) {
    const hint = first !== undefined && isBareNumber(first) && Number(first) !== 0 ? `${kind} の τ は単位を付けます` : `${kind} は τ を 1ms / 200us のように書きます`;
    return fail(`${hint} (例: ${kind} ${TAU_EXAMPLE[kind]})`, words[words.length > 2 ? 2 : 1] ?? kind);
  }
  return ok({ kind, tau });
}

/** `delay 250us`。**0 以上** (先へ進める = 未来の値は計算できない)。 */
function delayOp(words: readonly string[]): LineResult<Op> {
  const [, first] = words;
  const seconds = first === undefined ? null : parseSeconds(first);
  if (seconds === null || words.length > 2) {
    const hint = first !== undefined && isBareNumber(first) && Number(first) !== 0 ? 'delay は 250us / 1ms のように単位を付けます' : 'delay はずらす時間を 250us / 1ms のように書きます';
    return fail(`${hint} (例: delay 250us)`, words[words.length > 2 ? 2 : 1] ?? 'delay');
  }
  if (seconds < 0) return fail('delay は 0 以上です (遅らせるだけ。進めるなら trigger: か phase で)', first);
  if (seconds > LIMITS.delayMax) return fail(`delay は ${LIMITS.delayMax}s までです`, first);
  return ok({ kind: 'delay', seconds });
}

function clipOp(words: readonly string[]): LineResult<Op> {
  const [, first, second] = words;
  const low = plainVolts(first);
  const high = second === undefined ? null : plainVolts(second);
  if (low === null || (second !== undefined && high === null) || words.length > 3) {
    return fail(CLIP_HINT, (low === null ? first : second) ?? 'clip');
  }
  if (high !== null && high <= low) return fail('clip は下の値を先に書きます (例: clip -0.7V 0.7V)', first);
  return ok({ kind: 'clip', low, high });
}

function offsetOp(words: readonly string[]): LineResult<Op> {
  const [, first] = words;
  const volts = plainVolts(first);
  if (volts === null || words.length > 2) {
    return fail(first !== undefined && isBareNumber(first) ? 'offset は 4.3V / -0.7V のように単位を付けます' : 'offset は 4.3V / -0.7V のように書きます', first ?? 'offset');
  }
  return ok({ kind: 'offset', volts });
}

function gainOp(words: readonly string[]): LineResult<Op> {
  const [, first] = words;
  // 倍率は単位の無い量 — 素の数を受ける唯一の所 (dB と紛れないよう dB は断る)。
  if (first === undefined || !isBareNumber(first) || words.length > 2) {
    return fail('gain は 0.5 / 2 / -1 のように倍率 (単位なし) で書きます', first ?? 'gain');
  }
  const factor = Number(first);
  // 桁が大きすぎる綴り (`999…9`) は Number() で Infinity になる。断らずに通すと
  // NaN / Infinity の線になる (描画側で中央に落ちるだけで、書き手には理由が分からない)。
  if (!Number.isFinite(factor) || Math.abs(factor) > LIMITS.gainMax) {
    return fail(`gain の倍率は ±${LIMITS.gainMax} までです`, first);
  }
  return ok({ kind: 'gain', factor });
}

/** 後ろに何も取らない操作 (`abs` `invert`)。 */
const bareOp = (kind: 'abs' | 'invert', words: readonly string[]): LineResult<Op> =>
  (words.length > 1 ? fail(`${kind} の後ろには何も書きません`, words[1]) : ok({ kind }));

function parseOp(text: string): LineResult<Op> {
  const words = wordsOf(text);
  const [name] = words;
  if (name === undefined) return fail('| の後ろに操作を書きます (例: ch1 | rc 1ms)', '|');
  switch (name) {
    case 'rc':
    case 'hp':
    case 'peak':
    case 'integrate':
      return tauOp(name, words);
    case 'delay':
      return delayOp(words);
    case 'clip':
      return clipOp(words);
    case 'offset':
      return offsetOp(words);
    case 'gain':
      return gainOp(words);
    case 'abs':
    case 'invert':
      return bareOp(name, words);
    default:
      return fail(OP_HINT, name);
  }
}

/** 波の値が上限の中か。外ならエラー。 */
function waveLimits(source: ChannelSource, words: readonly string[]): LineResult<null> {
  if (source.kind !== 'wave') return ok(null);
  const { wave } = source;
  if (wave.frequency !== null && wave.frequency > LIMITS.frequencyMax) {
    return fail(`周波数は ${formatHertzShort(LIMITS.frequencyMax)} までです`, words[1]);
  }
  if (Math.abs(wave.amplitude) + Math.abs(wave.offset) > LIMITS.voltsMax) {
    return fail('電圧は ±1 MV までです', wave.shape === 'dc' ? words[1] : words[2]);
  }
  return ok(null);
}

/** ch の行の式 (`= …`)。**結果は電圧** — 単位の無い式を黙って V と読まない。 */
function channelExpr(name: ChannelName, text: string, before: readonly ChannelName[]): LineResult<ChannelSource> {
  const read = parseExpr(text, before);
  if (!read.ok) return read;
  if (!isVolts(read.value.dim)) {
    return fail(`${name} の式は電圧 (V) にします (いまは ${dimText(read.value.dim)}。5V * … のように単位を付けます)`, '=');
  }
  return ok({ kind: 'expr', expr: read.value.expr });
}

/**
 * ch の 1 行: `sine 1kHz 1V offset 1V` / `ch1 | rc 1ms | clip -0.7V 0.7V`。
 * **参照できるのは自分より前の ch だけ** (`before`)。
 */
export function parseChannelLine(name: ChannelName, text: string, before: readonly ChannelName[]): LineResult<ChannelLine> {
  const [head = '', ...rest] = text.split('|');
  const headText = head.trim();
  if (rest.length > LIMITS.opsPerChannel) return fail(`操作は 1 つの ch に ${LIMITS.opsPerChannel} つまでです`);

  let source: ChannelSource;
  let assumed: readonly string[] = [];
  if (headText.startsWith('=')) {
    const read = channelExpr(name, headText.slice(1), before);
    if (!read.ok) return read;
    source = read.value;
  } else if (/^ch\d+$/.test(headText)) {
    if (!isChannelName(headText)) return fail('ch は ch1〜ch4 です', headText);
    if (!before.includes(headText)) {
      return fail(before.length === 0
        ? `${name} は波で書きます (前に参照できる ch がありません。例: ${name}: sine 1kHz 1V)`
        : `${name} が参照できるのは前の ${before.join(' / ')} だけです`, headText);
    }
    source = { kind: 'ref', channel: headText };
  } else {
    const read = parseWave(headText);
    if (!read.ok) return fail(read.reason, read.token);
    source = { kind: 'wave', wave: read.value };
    assumed = read.assumed;
    const limits = waveLimits(source, wordsOf(headText));
    if (!limits.ok) return limits;
  }

  const ops: Op[] = [];
  for (const part of rest) {
    const read = parseOp(part);
    if (!read.ok) return read;
    ops.push(read.value);
  }
  return ok({ name, source, ops, assumed });
}

export type TriggerLine = { readonly source: ChannelName; readonly edge: TriggerEdge; readonly level: number | null };

const TRIGGER_HINT = 'trigger: は「ch1 rising 1V」の形で書きます (向きは rising / falling、水準は省けます)';

/** `ch1 rising 1V` / `ch2 falling` (水準は省ける = 波形の中央)。 */
export function parseTriggerLine(text: string): LineResult<TriggerLine> {
  const words = wordsOf(text);
  const [source = '', edge, level] = words;
  if (!isChannelName(source)) return fail('trigger: は ch1〜ch4 のどれかで合わせます', source || undefined);
  if (edge === undefined) return fail(TRIGGER_HINT, source);
  if (edge !== 'rising' && edge !== 'falling') return fail('trigger: の向きは rising か falling です', edge);
  if (words.length > 3) return fail(TRIGGER_HINT, words[3]);
  if (level === undefined) return ok({ source, edge, level: null });
  const volts = plainVolts(level);
  if (volts === null) {
    return fail(isBareNumber(level) ? 'trigger: の水準は 1V / -500mV のように単位を付けます' : `trigger: の水準が読めません: ${safeToken(level)} (1V / -500mV)`, level);
  }
  return ok({ source, edge, level: volts });
}

/** カーソルの時刻。`0` `1ms` `-500us`。 */
export function parseCursor(text: string): LineResult<number> {
  const seconds = parseSeconds(text);
  return seconds === null ? fail('カーソルは 0 / 1ms / -500us のように単位を付けます', text) : ok(seconds);
}

/** Measurements の名前の並び。知らない名前は一覧を添えて断る。 */
export function parseMeasureNames(names: readonly string[]): LineResult<readonly MeasureName[]> {
  if (names.length > LIMITS.measures) return fail(`measure: は ${LIMITS.measures} つまでです`);
  const read: MeasureName[] = [];
  for (const name of names) {
    if (!(MEASURE_NAMES as readonly string[]).includes(name)) {
      return fail(`知らない測り方です: ${name} (書けるのは ${MEASURE_NAMES.join(' / ')})`, name);
    }
    if (read.includes(name as MeasureName)) return fail(`${name} が 2 つあります`, name);
    read.push(name as MeasureName);
  }
  return ok(read);
}

/** position: の範囲 (目盛。中央から上下に)。 */
export const POSITION_MAX = 100;

/** 0 の基準の位置 (`-2div`)。読めないか ±100 目盛の外なら null。ch も Math も同じ読み。 */
export function parsePosition(text: string): number | null {
  const found = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*div$/.exec(text.trim());
  const position = found === null ? null : Number(found[1]);
  return position === null || Math.abs(position) > POSITION_MAX ? null : position;
}

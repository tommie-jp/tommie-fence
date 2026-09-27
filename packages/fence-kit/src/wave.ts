import { parseDegrees, parsePercent, parseVolts } from './units.ts';
import { parseHertz } from './values.ts';

/**
 * 波形発生器の波 — `sine 1kHz 1V offset 1V phase 90deg duty 25%`。
 * **使い手は scope (時間波形) と spectrum (線スペクトル)** で、書き方は 1 つ
 * (52 の docs/85 §3.7・88)。語彙は発生器の設定の表 (WaveForms の Wavegen) に揃える。
 *
 * - **振幅は peak** (Wavegen の Amplitude)。`2Vpp` と書けば半分、`Vrms` は sine だけ √2 倍、
 *   `dBm` は 50 Ω の正弦の電力として peak に直す (方形波に書いても同じ換算。黙って別の意味にしない)
 * - 周波数と振幅は**位置** (この順)。`offset` `phase` `duty` は**順不同のキーワード**
 * - **単位の無い数は断る** (直下の CLAUDE.md の文法の方針 1)
 */

export const WAVE_SHAPES = ['sine', 'square', 'triangle', 'sawtooth', 'pulse', 'dc'] as const;
export type WaveShape = (typeof WAVE_SHAPES)[number];

export type WaveSpec = {
  readonly shape: WaveShape;
  /** Hz。dc は null。 */
  readonly frequency: number | null;
  /** peak (V)。dc はその値そのもの (負も 0 も書ける)。 */
  readonly amplitude: number;
  readonly offset: number;
  /** 度。負は遅れ。 */
  readonly phase: number;
  /** 高い時間の割合 (0〜1)。square と pulse だけが使う。 */
  readonly duty: number;
};

/**
 * 波の線スペクトルの 1 本 (spectrum が使う)。`amplitude` は **peak (V)**。
 * **0 Hz の線は直流の値そのもの** (負もある。rms は |値|)。位相は持たない
 * (スペクトラムの画面は電力しか見ない)。
 */
export type SpectralLine = { readonly frequency: number; readonly amplitude: number };

export type WaveRead =
  | {
    readonly ok: true;
    readonly value: WaveSpec;
    /** 補った既定のうち、図の中身を決める物 (呼ぶ側がお知らせで言う)。 */
    readonly assumed: readonly string[];
  }
  | { readonly ok: false; readonly reason: string; readonly token: string };

const KEYWORDS = ['offset', 'phase', 'duty'] as const;
type Keyword = (typeof KEYWORDS)[number];

const DEFAULT_DUTY: Readonly<Record<WaveShape, number>> = {
  sine: 0.5, square: 0.5, triangle: 0.5, sawtooth: 0.5, pulse: 0.25, dc: 0.5,
};

const fail = (reason: string, token: string): WaveRead => ({ ok: false, reason, token });

const isBareNumber = (text: string): boolean => /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)[kMG]?$/.test(text);

const isWaveShape = (text: string): text is WaveShape => (WAVE_SHAPES as readonly string[]).includes(text);

const SHAPE_LIST = `波は ${WAVE_SHAPES.join(' / ')} のどれかです`;
const FREQUENCY_UNIT = '周波数は 1kHz / 100Hz のように単位を付けます';
const AMPLITUDE_UNIT = '振幅は 1V / 500mV / 2Vpp のように単位を付けます';

/** 振幅を peak (V) に。読めなければ理由。 */
function readAmplitude(shape: WaveShape, text: string): number | { readonly reason: string } {
  const read = parseVolts(text);
  if (read === null) {
    return { reason: isBareNumber(text) ? AMPLITUDE_UNIT : `振幅が読めません: ${text} (1V / 500mV / 2Vpp / 0.707Vrms / -10dBm)` };
  }
  if (shape === 'dc') {
    return read.kind === 'peak' ? read.volts : { reason: 'dc は 5V / -0.7V のように書きます (Vpp・Vrms・dBm は書けません)' };
  }
  if (read.kind === 'rms' && shape !== 'sine') return { reason: 'Vrms は sine だけに書けます (ほかの波は 1V か 2Vpp で)' };
  const peak = read.kind === 'pp' ? read.volts / 2 : read.kind === 'rms' ? read.volts * Math.SQRT2 : read.volts;
  return peak > 0 ? peak : { reason: '振幅は 0 より大きくします (負の値や 0 は offset で)' };
}

type Extras = { offset: number; phase: number; duty: number | null };

/** キーワード (`offset 1V` `phase -58deg` `duty 25%`) を読む。**同じ語が 2 つあれば断る**。 */
function readKeywords(shape: WaveShape, words: readonly string[]): Extras | WaveRead {
  const extras: Extras = { offset: 0, phase: 0, duty: null };
  const seen = new Set<Keyword>();
  for (let index = 0; index < words.length; index += 2) {
    const word = words[index] ?? '';
    if (!(KEYWORDS as readonly string[]).includes(word)) {
      return fail(`知らない語です: ${word} (書けるのは ${KEYWORDS.join(' / ')})`, word);
    }
    const keyword = word as Keyword;
    if (seen.has(keyword)) return fail(`${keyword} が 2 つあります`, keyword);
    seen.add(keyword);
    const value = words[index + 1];
    if (value === undefined) {
      const example = { offset: 'offset 1V', phase: 'phase 90deg', duty: 'duty 25%' }[keyword];
      return fail(`${keyword} の後ろに値を書きます (例: ${example})`, keyword);
    }
    if (keyword === 'offset') {
      const read = parseVolts(value);
      if (read === null) {
        return fail(isBareNumber(value) ? 'offset は 1V / -500mV のように単位を付けます' : `offset が読めません: ${value} (1V / -500mV)`, value);
      }
      if (read.kind !== 'peak') return fail('offset は 1V / -500mV のように書きます (Vpp・Vrms・dBm は振幅だけ)', value);
      extras.offset = read.volts;
    } else if (keyword === 'phase') {
      const degrees = parseDegrees(value);
      if (degrees === null) return fail('phase は 90deg / -58deg のように単位を付けます', value);
      extras.phase = degrees;
    } else {
      if (shape !== 'square' && shape !== 'pulse') return fail('duty は square と pulse だけに書けます', 'duty');
      const duty = parsePercent(value);
      if (duty === null) return fail('duty は 25% のように % で書きます (0% と 100% は書けません)', value);
      extras.duty = duty;
    }
  }
  return extras;
}

/** 周波数が読めないときの理由。**順を取り違えた** (`sine 1V 1kHz`) なら、そう言う。 */
function frequencyReason(first: string, second: string | undefined): string {
  if (parseVolts(first) !== null && second !== undefined && parseHertz(second, { unit: 'required' }) !== null) {
    return '周波数を先に書きます (例: sine 1kHz 1V)';
  }
  if (isBareNumber(first) || parseHertz(first) !== null) return FREQUENCY_UNIT;
  return `周波数が読めません: ${first} (1kHz / 100Hz / 2.5MHz)`;
}

function readDc(words: readonly string[]): WaveRead {
  const shapeHint = 'dc は「dc 5V」の形で書きます (周波数も offset も phase も書きません)';
  const value = words[1];
  if (value === undefined) return fail(shapeHint, 'dc');
  if (parseHertz(value) !== null && parseVolts(value) === null && !isBareNumber(value)) return fail(shapeHint, value);
  if (words.length > 2) return fail(shapeHint, words[2] ?? 'dc');
  const amplitude = readAmplitude('dc', value);
  if (typeof amplitude !== 'number') return fail(amplitude.reason, value);
  return {
    ok: true,
    value: { shape: 'dc', frequency: null, amplitude, offset: 0, phase: 0, duty: DEFAULT_DUTY.dc },
    assumed: [],
  };
}

/** 1 行の波を読む。**読めなければ理由と、指す綴り**を返す (行番号は呼ぶ側が付ける)。 */
export function parseWave(text: string): WaveRead {
  const words = text.trim().split(/\s+/).filter((word) => word !== '');
  const shape = words[0] ?? '';
  if (!isWaveShape(shape)) return fail(SHAPE_LIST, shape);
  if (shape === 'dc') return readDc(words);

  const [, first, second] = words;
  if (first === undefined || second === undefined) return fail(`${shape} は周波数と振幅を書きます (例: ${shape} 1kHz 1V)`, shape);
  const frequency = parseHertz(first, { unit: 'required' });
  if (frequency === null) return fail(frequencyReason(first, second), first);
  const amplitude = readAmplitude(shape, second);
  if (typeof amplitude !== 'number') return fail(amplitude.reason, second);

  const extras = readKeywords(shape, words.slice(3));
  if ('ok' in extras) return extras;
  const assumed = shape === 'pulse' && extras.duty === null
    ? [`pulse の duty は既定の ${DEFAULT_DUTY.pulse * 100}% で描いています`]
    : [];
  return {
    ok: true,
    value: { shape, frequency, amplitude, offset: extras.offset, phase: extras.phase, duty: extras.duty ?? DEFAULT_DUTY[shape] },
    assumed,
  };
}

/** 1 周期 (s)。dc は null。 */
export const periodOf = (spec: WaveSpec): number | null => (spec.frequency === null ? null : 1 / spec.frequency);

/** 周期の中の位置 (0〜1)。 */
const fractionAt = (spec: WaveSpec, t: number): number => {
  const cycles = (spec.frequency ?? 0) * t + spec.phase / 360;
  return cycles - Math.floor(cycles);
};

/**
 * 時刻 t (s) の値 (V)。**t = 0 の形は発生器に揃える**: sine は 0 から上る、square と
 * pulse は t = 0 で立ち上がる、triangle と sawtooth は t = 0 で底 (−A)。
 */
export function sampleWave(spec: WaveSpec, t: number): number {
  const { amplitude: a, offset } = spec;
  const x = fractionAt(spec, t);
  switch (spec.shape) {
    case 'sine':
      return a * Math.sin(2 * Math.PI * ((spec.frequency ?? 0) * t + spec.phase / 360)) + offset;
    case 'square':
    case 'pulse':
      return (x < spec.duty ? a : -a) + offset;
    case 'triangle':
      return (x < 0.5 ? -a + 4 * a * x : 3 * a - 4 * a * x) + offset;
    case 'sawtooth':
      return -a + 2 * a * x + offset;
    case 'dc':
      return a;
  }
}

/** 線を打ち切る小ささ (振幅に対する比)。duty 50% の方形波の偶数次 (理論では 0) を落とす。 */
const NEGLIGIBLE = 1e-9;

/** n 次の高調波の振幅 (peak)。**`sampleWave` と同じ形の波の** Fourier 級数。 */
function harmonic(spec: WaveSpec, n: number): number {
  const a = spec.amplitude;
  switch (spec.shape) {
    case 'sine':
      return n === 1 ? a : 0;
    case 'square':
    case 'pulse':
      // ±A で high が duty の割合の波。duty 50% なら奇数次だけ 4A/πn。
      return ((4 * a) / (Math.PI * n)) * Math.abs(Math.sin(Math.PI * n * spec.duty));
    case 'triangle':
      return n % 2 === 1 ? (8 * a) / (Math.PI ** 2 * n ** 2) : 0;
    case 'sawtooth':
      return (2 * a) / (Math.PI * n);
    case 'dc':
      return 0;
  }
}

/** 直流の成分 (V)。方形波と pulse は duty で片寄る。 */
function dcOf(spec: WaveSpec): number {
  if (spec.shape === 'dc') return spec.amplitude;
  if (spec.shape === 'square' || spec.shape === 'pulse') return spec.amplitude * (2 * spec.duty - 1) + spec.offset;
  return spec.offset;
}

export type LinesRead = {
  readonly lines: readonly SpectralLine[];
  /** `maxLines` で打ち切ったか (呼ぶ側が言う)。 */
  readonly truncated: boolean;
};

/**
 * 波の線スペクトル — **周波数が `maxFrequency` 以下の線を、`maxLines` 本まで**。
 * sine は 1 本、square は奇数次 4A/πn (duty が 50% でなければ偶数次も)、triangle は
 * 奇数次 8A/π²n²、sawtooth は 2A/πn、pulse は square と同じ式 (±A の波なので
 * 4A·d·sinc(nd))、dc と offset は 0 Hz の線。**`sampleWave` を FFT した値と一致する**
 * (spectrum が 2 つの道の突き合わせで縛る)。
 */
export function linesOf(spec: WaveSpec, limits: { readonly maxFrequency: number; readonly maxLines: number }): LinesRead {
  const lines: SpectralLine[] = [];
  const dc = dcOf(spec);
  if (dc !== 0) lines.push({ frequency: 0, amplitude: dc });
  const f = spec.frequency;
  if (f === null || !(f > 0)) return { lines, truncated: false };
  for (let n = 1; n * f <= limits.maxFrequency; n += 1) {
    const amplitude = harmonic(spec, n);
    if (amplitude <= Math.abs(spec.amplitude) * NEGLIGIBLE) {
      if (spec.shape === 'sine') break;
      continue;
    }
    if (lines.length >= limits.maxLines) return { lines, truncated: true };
    lines.push({ frequency: n * f, amplitude });
  }
  return { lines, truncated: false };
}

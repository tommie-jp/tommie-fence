import { periodOf, sampleWave } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { exprNodes } from './expr.ts';
import type { Expr } from './expr.ts';
import { evaluateExpr } from './exprEval.ts';
import { applyOps, delayOf, needsPeriod, tauOf } from './ops.ts';
import type { Op } from './ops.ts';
import type { Screen } from './screen.ts';

/**
 * ch は「**元 + 操作の列**」。元は波 (`sine 1kHz 1V`) か、**自分より前の ch** の参照 (`ch1`)。
 * 参照を前だけにしたので循環が無く、上から 1 回の走査で計算できる (52 の docs/85)。
 */
export const CHANNEL_NAMES = ['ch1', 'ch2', 'ch3', 'ch4'] as const;
export type ChannelName = (typeof CHANNEL_NAMES)[number];
/** 描く線の名前 — ch と Math (5 本目)。 */
export const TRACE_NAMES = [...CHANNEL_NAMES, 'math'] as const;
export type TraceName = (typeof TRACE_NAMES)[number];

export type ChannelSource =
  | { readonly kind: 'wave'; readonly wave: WaveSpec }
  | { readonly kind: 'ref'; readonly channel: ChannelName }
  /** 式 (`ch2: = 2V * (1 - exp(-t/1ms))`)。`refs` は式が参照する前の ch。 */
  | { readonly kind: 'expr'; readonly expr: Expr };

export type ChannelSpec = {
  readonly name: ChannelName;
  readonly source: ChannelSource;
  readonly ops: readonly Op[];
  /** V/div。null なら Auto。 */
  readonly range: number | null;
  /** 0 V の基準の位置 (目盛。中央が 0、上が正)。null なら Auto。 */
  readonly position: number | null;
  readonly line: number | null;
};

/**
 * ch ごとの元の周期 (s)。波はその周期、参照は参照先の周期、式は 0 (周期を決めない)。
 * **integrate の定数はこの周期で決める** — ほかの ch の周期で平均すると、周期が整数倍で
 * ないとき半端な周期の平均になり、積分が直流分だけずれる。
 */
export function channelPeriods(channels: readonly ChannelSpec[]): ReadonlyMap<ChannelName, number> {
  const periods = new Map<ChannelName, number>();
  for (const channel of channels) {
    const { source } = channel;
    const period = source.kind === 'wave' ? periodOf(source.wave) ?? 0 : source.kind === 'ref' ? periods.get(source.channel) ?? 0 : 0;
    periods.set(channel.name, period);
  }
  return periods;
}

/** 一番長い波の周期 (s)。周期のある波が無ければ 0。 */
export function longestPeriodOf(channels: readonly ChannelSpec[]): number {
  const periods = channels.flatMap((channel) =>
    (channel.source.kind === 'wave' ? [periodOf(channel.source.wave) ?? 0] : []));
  return Math.max(0, ...periods);
}

/**
 * 助走の長さ (s)。**10 τ (全部の rc・hp・peak の τ と lc の減衰の時定数の和) + 一番長い周期 + delay の和** — 定常に
 * 入ってから画面に入る (5-1 の「毎回ほぼ 0 V まで戻る」がそのまま出る)。5 τ では始めの状態の
 * 違いが e^−5 ≈ 0.7 % 残り、読み値の 3 桁目が動く (正弦 + rc で実測)。integrate は τ が
 * 無くても 1 周期を助走に取る (その 1 周期の平均で積分の定数を決める)。delay だけなら、ずらす分だけ。
 */
export function warmupOf(channels: readonly ChannelSpec[]): number {
  const tau = channels.reduce((sum, channel) => sum + tauOf(channel.ops), 0);
  const delay = channels.reduce((sum, channel) => sum + delayOf(channel.ops), 0);
  if (!channels.some((channel) => needsPeriod(channel.ops))) return delay;
  return 10 * tau + longestPeriodOf(channels) + delay;
}

/** 助走を上限で切った、実際に標本化する点の数 (`samplesOf` と同じ数え方)。 */
export function lengthOf(channels: readonly ChannelSpec[], screen: Screen): number {
  const wanted = Math.ceil(warmupOf(channels) / screen.dt);
  return Math.min(wanted, LIMITS.warmupSamples) + screen.samples;
}

/**
 * 式の計算量の見積もり (点の数 × 式の節の数の合計)。**式を持つ ch と Math だけ数える** —
 * 波と操作だけの ch は `warmupSamples` の上限がそのまま守る。長い τ (助走) と長い式
 * (`min(ch1,ch1,…)` のような多い引数) が重なると点ごとの計算が積もって遅くなるので、
 * 実際に標本化する前にここで見積もって断る (52 の docs/99 段 3a の見直し)。
 */
export function exprWorkOf(channels: readonly ChannelSpec[], math: Expr | null, screen: Screen): number {
  const nodes = channels.reduce((sum, channel) => sum + (channel.source.kind === 'expr' ? exprNodes(channel.source.expr) : 0), 0)
    + (math === null ? 0 : exprNodes(math));
  return nodes === 0 ? 0 : nodes * lengthOf(channels, screen);
}

/** ∫ (frac(u) < duty ? 1 : 0) du の原始関数。 */
const highUpTo = (u: number, duty: number): number => Math.floor(u) * duty + Math.min(u - Math.floor(u), duty);
/** ∫ frac(u) du の原始関数。 */
const rampUpTo = (u: number): number => {
  const whole = Math.floor(u);
  const part = u - whole;
  return whole / 2 + (part * part) / 2;
};

/**
 * 1 点の値。**跳びのある波 (square・pulse・sawtooth) は点の前後 dt/2 の平均**を取る。
 * 点の値そのものを使うと、跳びが点の格子の上のどこに落ちるかで ±dt/2 ずれ、
 * rc を通した波の周期と位相が 4 桁目で揺れる (トリガの補間も跳びの位置を正しく拾えない)。
 */
export function valueAt(wave: WaveSpec, t: number, dt: number): number {
  const f = wave.frequency ?? 0;
  const half = (f * dt) / 2;
  if (half === 0 || half >= 0.5 || (wave.shape !== 'square' && wave.shape !== 'pulse' && wave.shape !== 'sawtooth')) {
    return sampleWave(wave, t);
  }
  const center = f * t + wave.phase / 360;
  const [a, b] = [center - half, center + half];
  if (wave.shape === 'sawtooth') {
    return -wave.amplitude + 2 * wave.amplitude * ((rampUpTo(b) - rampUpTo(a)) / (b - a)) + wave.offset;
  }
  const high = (highUpTo(b, wave.duty) - highUpTo(a, wave.duty)) / (b - a);
  return wave.amplitude * (2 * high - 1) + wave.offset;
}

export type Sampled = {
  /** 画面 1 枚ぶんの点 (ch ごと。Math を渡せば `math` も)。 */
  readonly samples: ReadonlyMap<TraceName, Float64Array>;
  /** 助走を上限で切ったら false (定常に届いていないかもしれない)。 */
  readonly settled: boolean;
  /** 式が計算できずに 0 にした画面の点の数 (0 の線は載せない)。 */
  readonly invalid: ReadonlyMap<TraceName, number>;
  /** 式が ±1 MV を越えて切った画面の点の数 (0 の線は載せない)。 */
  readonly clipped: ReadonlyMap<TraceName, number>;
};

/** 標本化の時刻の格子 (助走込み)。 */
export type Grid = {
  readonly start: number;
  readonly dt: number;
  readonly length: number;
  /** 助走の点の数 (式の計算できない点はこれより後ろだけ数える)。 */
  readonly countFrom: number;
};

type Input = { readonly values: Float64Array; readonly invalid: number; readonly clipped: number };

/** 元の点の列 1 本。式は前の ch の列を参照する。 */
function inputOf(source: ChannelSource, grid: Grid, extended: ReadonlyMap<TraceName, Float64Array>): Input {
  switch (source.kind) {
    case 'wave':
      return { values: Float64Array.from({ length: grid.length }, (_, index) => valueAt(source.wave, grid.start + index * grid.dt, grid.dt)), invalid: 0, clipped: 0 };
    case 'ref':
      return { values: extended.get(source.channel) ?? new Float64Array(grid.length), invalid: 0, clipped: 0 };
    case 'expr':
      return evaluateExpr(source.expr, { ...grid, channels: extended });
  }
}

/**
 * 助走ぶん左から標本化して操作を掛け、**画面の中だけ**返す。`shift` はトリガで
 * 決めた時刻のずれ (画面の t は波の t + shift)。`math` は **ch を全部出した後に 1 回**、
 * 同じ時刻の格子で計算する (ch と同じ道。52 の docs/99 決め 2)。
 */
export function samplesOf(channels: readonly ChannelSpec[], screen: Screen, shift: number, math: Expr | null = null): Sampled {
  const wanted = Math.ceil(warmupOf(channels) / screen.dt);
  const warmup = Math.min(wanted, LIMITS.warmupSamples);
  const total = warmup + screen.samples;
  const start = screen.left + shift - warmup * screen.dt;
  const grid: Grid = { start, dt: screen.dt, length: total, countFrom: warmup };
  const extended = new Map<TraceName, Float64Array>();
  const invalid = new Map<TraceName, number>();
  const clipped = new Map<TraceName, number>();
  const periods = channelPeriods(channels);
  const put = (name: TraceName, input: Input, ops: readonly Op[]): void => {
    if (input.invalid > 0) invalid.set(name, input.invalid);
    if (input.clipped > 0) clipped.set(name, input.clipped);
    const period = name === 'math' ? 0 : periods.get(name) ?? 0;
    extended.set(name, applyOps(input.values, screen.dt, ops, { warmup, period }));
  };
  for (const channel of channels) put(channel.name, inputOf(channel.source, grid, extended), channel.ops);
  if (math !== null) put('math', inputOf({ kind: 'expr', expr: math }, grid, extended), []);
  const samples = new Map<TraceName, Float64Array>();
  for (const [name, values] of extended) samples.set(name, values.subarray(warmup));
  return { samples, settled: warmup === wanted, invalid, clipped };
}

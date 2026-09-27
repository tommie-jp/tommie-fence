import { periodOf, sampleWave } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import { applyOps, tauOf } from './ops.ts';
import type { Op } from './ops.ts';
import type { Screen } from './screen.ts';

/**
 * ch は「**元 + 操作の列**」。元は波 (`sine 1kHz 1V`) か、**自分より前の ch** の参照 (`ch1`)。
 * 参照を前だけにしたので循環が無く、上から 1 回の走査で計算できる (52 の docs/85)。
 */
export const CHANNEL_NAMES = ['ch1', 'ch2', 'ch3', 'ch4'] as const;
export type ChannelName = (typeof CHANNEL_NAMES)[number];

export type ChannelSource =
  | { readonly kind: 'wave'; readonly wave: WaveSpec }
  | { readonly kind: 'ref'; readonly channel: ChannelName };

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
 * 助走の長さ (s)。**10 τ (全部の rc の τ の和) + 一番長い周期** — 定常に入ってから
 * 画面に入る (5-1 の「毎回ほぼ 0 V まで戻る」がそのまま出る)。5 τ では始めの状態の
 * 違いが e^−5 ≈ 0.7 % 残り、読み値の 3 桁目が動く (正弦 + rc で実測)。
 */
export function warmupOf(channels: readonly ChannelSpec[]): number {
  const tau = channels.reduce((sum, channel) => sum + tauOf(channel.ops), 0);
  if (tau === 0) return 0;
  const periods = channels.flatMap((channel) =>
    (channel.source.kind === 'wave' ? [periodOf(channel.source.wave) ?? 0] : []));
  return 10 * tau + Math.max(0, ...periods);
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
  /** 画面 1 枚ぶんの点 (ch ごと)。 */
  readonly samples: ReadonlyMap<ChannelName, Float64Array>;
  /** 助走を上限で切ったら false (定常に届いていないかもしれない)。 */
  readonly settled: boolean;
};

/**
 * 助走ぶん左から標本化して操作を掛け、**画面の中だけ**返す。`shift` はトリガで
 * 決めた時刻のずれ (画面の t は波の t + shift)。
 */
export function samplesOf(channels: readonly ChannelSpec[], screen: Screen, shift: number): Sampled {
  const wanted = Math.ceil(warmupOf(channels) / screen.dt);
  const warmup = Math.min(wanted, LIMITS.warmupSamples);
  const total = warmup + screen.samples;
  const start = screen.left + shift - warmup * screen.dt;
  const extended = new Map<ChannelName, Float64Array>();
  for (const channel of channels) {
    const { source } = channel;
    const input = source.kind === 'wave'
      ? Float64Array.from({ length: total }, (_, index) => valueAt(source.wave, start + index * screen.dt, screen.dt))
      : extended.get(source.channel) ?? new Float64Array(total);
    extended.set(channel.name, applyOps(input, screen.dt, channel.ops));
  }
  const samples = new Map<ChannelName, Float64Array>();
  for (const [name, values] of extended) samples.set(name, values.subarray(warmup));
  return { samples, settled: warmup === wanted };
}

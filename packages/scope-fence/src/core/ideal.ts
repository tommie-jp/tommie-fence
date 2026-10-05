import { formatHertzShort, formatSeconds, formatVolts } from 'fence-kit';
import { fenceError, notice } from './errors.ts';
import { LIMITS } from './limits.ts';
import { channelPeriods, exprWorkOf, samplesOf } from './model/channel.ts';
import type { ChannelSpec, Sampled } from './model/channel.ts';
import type { Expr } from './model/expr.ts';
import { isTauOp } from './model/ops.ts';
import type { Op } from './model/ops.ts';
import type { Trace } from './model/readings.ts';
import { centredOf, findTrigger } from './model/screen.ts';
import type { Screen } from './model/screen.ts';
import type { FenceDocument, FenceError, TriggerSpec } from './types.ts';

/**
 * 理想の波 (計算) — ch と Math を点の列にし、トリガで t = 0 を合わせる。
 * 時間の画面 (`index.ts`) と XY (`xyView.ts`) が同じ標本化の道を通る。
 */

export type Ideal = {
  readonly traces: readonly Trace[];
  /** トリガの水準 (V。null なら印を描かない)。 */
  readonly triggerLevel: number | null;
  readonly said: readonly FenceError[];
};

/** 記録を画面より長くするときの周期の数と、画面に対する長さの上限。 */
const RECORD_PERIODS = 2.2;
const RECORD_MAX = 3;

/**
 * 理想の記録 (測る範囲)。**画面に 2 周期入らないときは、前後を足して 2.2 周期にする**
 * (画面の 3 倍まで)。実機のバッファが画面より長いのと同じで、5-1 の `1ms/div` (画面に
 * ちょうど 1 周期) でも Freq が出る。描くのは画面の中だけ。点の間隔は画面と同じ。
 * 足すのは画面の中央から前後に同じだけ (トリガの位置 `at` で画面が動いても同じ)。
 */
export function recordOf(screen: Screen, channels: readonly ChannelSpec[]): Screen {
  const periods = channels.flatMap((channel) =>
    (channel.source.kind === 'wave' && channel.source.wave.frequency !== null ? [1 / channel.source.wave.frequency] : []));
  const longest = Math.max(0, ...periods);
  const wanted = RECORD_PERIODS * longest;
  if (wanted <= screen.span || wanted > RECORD_MAX * screen.span) return screen;
  const samples = Math.ceil(wanted / screen.dt / 2) * 2 + 1;
  const span = (samples - 1) * screen.dt;
  const centre = screen.left + screen.span / 2;
  return { perDiv: screen.perDiv, span, samples, left: centre - span / 2, dt: screen.dt };
}

/**
 * 式の計算量が上限を越えていないか。**実際に標本化する前に見積もって断る** — 長い τ
 * (助走を伸ばす) と長い式 (`min(ch1,ch1,…)` のように節を増やす) が重なると、上限の中でも
 * 1 枚の図の計算だけで止まって見えるほど遅くなる (52 の docs/99 段 3a の見直しで実測)。
 * 越えていれば描かず、理由を返す (格子は呼ぶ側がそれでも描く)。
 */
export function tooHeavy(channels: readonly ChannelSpec[], math: Expr | null, screen: Screen): FenceError | null {
  return exprWorkOf(channels, math, screen) > LIMITS.exprWork
    ? fenceError('式の計算量が多すぎるので描けません (τ を短くするか、式や ch の数を減らします)', null)
    : null;
}

/** lc の刻みの目安 — 点の間隔が 1/(20 f0) より粗いと、共振の山が数点でしか描けない。 */
const LC_STEPS_PER_CYCLE = 20;

/** 操作 1 つについて、画面の点の間隔が粗すぎるときに言うこと。 */
function stepNotice(op: Op, screen: Screen): string | null {
  if (isTauOp(op) && op.tau < screen.dt) {
    return `${op.kind} の τ (${formatSeconds(op.tau)}) が画面の点の間隔 (${formatSeconds(screen.dt)}) より短いので、${op.kind === 'hp' ? 'ほぼ 0 (跳びの点だけ) に' : 'ほぼ素通しに'}描いています`;
  }
  if (op.kind !== 'lc') return null;
  const finest = 1 / (LC_STEPS_PER_CYCLE * op.f0);
  if (screen.dt <= finest) return null;
  return `lc の f0 (${formatHertzShort(op.f0)}) に比べて画面の点の間隔 (${formatSeconds(screen.dt)}) が 1/(${LC_STEPS_PER_CYCLE} f0) = ${formatSeconds(finest)} より粗いので、共振のあたりは正しく描けていません (time: を速くします)`;
}

/** 標本化について言うこと — 助走が足りない、τ が点の間隔より短い、式が計算できない点。 */
export function samplingNotices(doc: FenceDocument, sampled: Sampled, screen: Screen): readonly FenceError[] {
  const said: FenceError[] = [];
  if (!sampled.settled) {
    said.push(notice(doc.view === 'xy'
      ? '助走 (rc / hp / peak の τ・lc の減衰・delay・integrate の 1 周期) が XY の窓 (周波数から決まる) に比べて長いので、定常まで回しきれていません (τ を短くします)'
      : '助走 (rc / hp / peak の τ・lc の減衰・delay・integrate の 1 周期) が画面の幅に比べて長いので、定常まで回しきれていません (time: を遅くします)', null));
  }
  const periods = channelPeriods(doc.channels);
  for (const channel of doc.channels) {
    if (channel.ops.some((op) => op.kind === 'integrate') && (periods.get(channel.name) ?? 0) === 0) {
      said.push(notice(`${channel.name} の元に周期のある波が無いので、integrate は助走の頭を 0 として積分しています (直流分を除いていません)`, channel.line));
    }
    for (const op of channel.ops) {
      const message = stepNotice(op, screen);
      if (message !== null) said.push(notice(message, channel.line));
    }
  }
  const lineOf = (name: string): number | null =>
    (name === 'math' ? doc.math?.line ?? null : doc.channels.find((channel) => channel.name === name)?.line ?? null);
  const label = (name: string): string => (name === 'math' ? 'math:' : name);
  for (const [name, count] of sampled.invalid) {
    said.push(notice(`${label(name)} の式が ${count} 点で計算できないので (0 で割る・負の平方根・桁あふれ)、その点は 0 で描いています`, lineOf(name)));
  }
  for (const [name, count] of sampled.clipped) {
    said.push(notice(`${label(name)} の式が ${count} 点で ±1 MV を越えるので、±1 MV で切っています`, lineOf(name)));
  }
  return said;
}

/** 標本化した列を線に。Math は書き手の単位で。 */
export function tracesOf(doc: FenceDocument, sampled: Sampled, screen: Screen): readonly Trace[] {
  const traces = doc.channels.map((channel): Trace => ({
    name: channel.name,
    samples: sampled.samples.get(channel.name) ?? new Float64Array(screen.samples),
    dt: screen.dt,
    t0: screen.left,
    basis: 'model',
  }));
  const math = sampled.samples.get('math');
  if (doc.math === null || math === undefined) return traces;
  return [...traces, { name: 'math', unit: doc.math.unit, samples: math, dt: screen.dt, t0: screen.left, basis: 'model' }];
}

/** トリガの横切りを探す。見つからなければ言って、ずらさない。 */
function triggerOf(sampled: Sampled, screen: Screen, trigger: TriggerSpec): { readonly shift: number; readonly level: number | null; readonly said: readonly FenceError[] } {
  const source = sampled.samples.get(trigger.source);
  if (source === undefined) return { shift: 0, level: null, said: [] };
  const found = findTrigger(source, screen, trigger.edge, trigger.level);
  let min = Infinity;
  let max = -Infinity;
  for (const value of source) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const level = trigger.level ?? (max + min) / 2;
  if (found !== null) return { shift: found, level, said: [] };
  // **平らな波 (直流だけ) には掛けるトリガが無い** — 実機は Auto で掃引が走る。言うまでもないので黙る。
  if (max === min) return { shift: 0, level, said: [] };
  const written = trigger.level === null ? '中央' : formatVolts(trigger.level);
  return { shift: 0, level, said: [notice(`トリガ水準 (${written}) が ${trigger.source} の波形の外なので、t = 0 に合わせていません`, trigger.line)] };
}

/**
 * 理想の波を計算する。トリガの横切りを探して t = 0 を合わせる。**探すのは t = 0 を中央に
 * 置いた窓** — `at -5div` で画面が t ≥ 0 だけになっても、t = 0 の前後の横切りから選ぶ
 * (画面の端の横切りを取り逃がさない)。描く記録はその後で `display` (動かした画面) の位置に取る。
 */
export function idealOf(doc: FenceDocument, display: Screen, trigger: TriggerSpec | null): Ideal {
  const { channels } = doc;
  if (channels.length === 0 && doc.math === null) return { traces: [], triggerLevel: null, said: [] };
  const screen = recordOf(display, channels);
  const search = centredOf(screen);
  const math = doc.math?.expr ?? null;
  const heavy = tooHeavy(channels, math, screen);
  if (heavy !== null) return { traces: [], triggerLevel: null, said: [heavy] };
  // 1 回目はトリガを探すだけ (トリガは ch に掛ける) なので Math は計算しない。
  const first = samplesOf(channels, search, 0, trigger === null ? math : null);
  const found = trigger === null ? { shift: 0, level: null, said: [] } : triggerOf(first, search, trigger);
  // 画面が動かず、シフトが 0 で Math も無ければ、1 回目がそのまま最終と同じ (無駄な 2 回目を省く)。
  const same = search.left === screen.left && (trigger === null || (found.shift === 0 && math === null));
  const final = same ? first : samplesOf(channels, screen, found.shift, math);
  return {
    traces: tracesOf(doc, final, screen),
    triggerLevel: found.level,
    said: [...found.said, ...samplingNotices(doc, final, screen)],
  };
}

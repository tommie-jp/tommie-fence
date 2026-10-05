import { formatHertz, formatHertzShort } from 'fence-kit';
import { notice } from './errors.ts';
import { isRound } from './layout/panels.ts';
import type { PanelKind } from './layout/panels.ts';
import { DIVISIONS, fraction, placedValue } from './layout/scales.ts';
import { traceLabel } from './model/readings.ts';
import type { RectSeries } from './model/series.ts';
import type { Sweep } from './model/sweep.ts';
import { amountText, axisOf, perDivision, writtenScale } from './render/panel.ts';
import type { FenceError } from './types.ts';

/**
 * 読みにくい掃引と枠を**数で**言う (図を見なくても直せるように)。直交の枠だけを見る
 * (Smith・極・TDR は横軸が周波数でない)。
 *
 * 1. **特性が横に潰れている** — 変化が掃引の 10 % 未満の幅に集まっている。
 *    極値を中心に、その幅の 5 倍の `sweep:` を出す
 * 2. **縦の動きが小さい** — 値の幅が枠の 1 目盛に満たない (平らなものは除く)
 */

/** 中央値から、値の幅のこの割合以上離れた点を「変化」とみなす。 */
const DEVIATION = 0.2;
/** 変化の幅が掃引のこの割合未満なら潰れている。 */
const CROWDED = 0.1;
/** 潰れていると言うのは、縦にこの目盛以上動くときだけ (雑音の揺れで言わない)。 */
const MIN_HEIGHT = 0.5;
/** 提案する掃引は変化の幅のこの倍。 */
const WIDEN = 5;
/** 1 目盛のこの割合より小さい幅は平ら (Thru の 0 dB の計算の誤差)。 */
const FLAT = 1e-3;

type Point = { readonly f: number; readonly value: number };

/**
 * 変化の集まり。`from`〜`to` は変化とみなした点の最初と最後、`center` は極値、`height` は値の幅。
 * 集まりの幅は**点の数 × 刻み** (`to − from + 刻み`) で数える — 1 点でも刻み 1 つぶんを占める。
 */
export type Spread = { readonly from: number; readonly to: number; readonly center: number; readonly height: number };

const median = (sorted: readonly number[]): number => {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** 変化の集まりを探す。平らなら null。 */
export function spreadOf(points: readonly Point[]): Spread | null {
  if (points.length === 0) return null;
  const sorted = points.map((point) => point.value).sort((a, b) => a - b);
  const height = (sorted.at(-1) ?? 0) - (sorted[0] ?? 0);
  if (height <= 0) return null;
  const middle = median(sorted);
  const away = points.filter((point) => Math.abs(point.value - middle) >= height * DEVIATION);
  const extreme = away.reduce((best, point) => (Math.abs(point.value - middle) > Math.abs(best.value - middle) ? point : best));
  return { from: away[0]?.f ?? extreme.f, to: away.at(-1)?.f ?? extreme.f, center: extreme.f, height };
}

/** 1・2・5 × 10^k で、`raw` 以上の一番小さいもの。 */
function step125(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].find((multiple) => multiple * power >= raw * (1 - 1e-9)) ?? 10) * power;
}

/** `center` を中心に幅 `width` の掃引。**両端を幅の 1/10 の 1-2-5 の刻みに丸め**、機種の範囲に収める。 */
export function niceSweep(center: number, width: number, device: { readonly min: number; readonly max: number }): { readonly start: number; readonly stop: number } {
  const grid = step125(width / 10);
  const snap = (value: number): number => Math.round(value / grid) * grid;
  // **0 Hz に丸まったら 1 刻み目から** (`0-30M` は書けない。機種の下限の半端な値にもしない)。
  const low = snap(center - width / 2);
  return { start: low >= device.min ? low : Math.max(device.min, grid), stop: Math.min(device.max, snap(center + width / 2)) };
}

/** `sweep:` に書ける周波数 (`12M` `500k` `1.5G`)。 */
const sweepHertz = (hz: number): string => formatHertzShort(hz, '').replace(/Hz$/, '');

/** 掃引に占める幅 (`4 % の幅` `1 % 未満の幅`)。 */
const percentText = (ratio: number): string => (ratio * 100 < 1 ? '1 % 未満の幅' : `${Math.round(ratio * 100)} % の幅`);

const rangeText = (from: number, to: number): string =>
  (from === to ? `${formatHertz(from)} のまわり` : `${formatHertz(from)}〜${formatHertz(to)}`);

export type AdvicePanel = { readonly kind: PanelKind; readonly series: readonly RectSeries[] };

export type AdviceInput = {
  readonly panels: readonly AdvicePanel[];
  readonly sweep: Sweep;
  readonly device: { readonly min: number; readonly max: number };
};

/** トレースごとに 1 本 (**実測があれば実測**、無ければ理想 — マーカーを載せる列と同じ)。 */
const shown = (series: readonly RectSeries[]): readonly RectSeries[] =>
  series.filter((one) => one.basis === 'data'
    || !series.some((other) => other.basis === 'data' && other.trace.index === one.trace.index));

type Crowded = { readonly series: RectSeries; readonly spread: Spread };

const stepOf = (sweep: Sweep): number => (sweep.stop - sweep.start) / (sweep.points - 1);
const widthOf = (spread: { readonly from: number; readonly to: number }, sweep: Sweep): number => spread.to - spread.from + stepOf(sweep);

/** 枠の上の位置 (目盛の数、縁に寄せた後)。**見えている形**で判じる。 */
function crowdedOn(kind: PanelKind, series: readonly RectSeries[], sweep: Sweep): readonly Crowded[] {
  const axis = axisOf(kind, series);
  return shown(series).flatMap((one) => {
    const spread = spreadOf(one.points.map((point) => ({ f: point.f, value: fraction(axis, point.value) * DIVISIONS })));
    if (spread === null || spread.height < MIN_HEIGHT) return [];
    return widthOf(spread, sweep) < (sweep.stop - sweep.start) * CROWDED ? [{ series: one, spread }] : [];
  });
}

/** 1. 潰れた特性。**同じ提案になるトレースは 1 つにまとめる**。 */
function crowdedNotices(input: AdviceInput): readonly FenceError[] {
  const { sweep, device } = input;
  const span = sweep.stop - sweep.start;
  const found = input.panels.flatMap((panel) => crowdedOn(panel.kind, panel.series, sweep));
  const bySweep = new Map<string, Crowded[]>();
  for (const one of found) {
    const { spread } = one;
    const suggested = niceSweep(spread.center, WIDEN * widthOf(spread, sweep), device);
    const key = `${sweepHertz(suggested.start)}-${sweepHertz(suggested.stop)} ${sweep.points}`;
    bySweep.set(key, [...(bySweep.get(key) ?? []), one]);
  }
  return [...bySweep].map(([key, group]) => {
    const from = Math.min(...group.map((one) => one.spread.from));
    const to = Math.max(...group.map((one) => one.spread.to));
    const names = group.map((one) => traceLabel(one.series.trace)).join('・');
    return notice(
      `${names} の変化は掃引の ${percentText(widthOf({ from, to }, sweep) / span)} (${rangeText(from, to)}) に集まっています (sweep: ${key} なら形が見えます)`,
      group[0]?.series.trace.spec.line ?? null,
    );
  });
}

const heightOf = (series: RectSeries): number => {
  const values = series.points.map((point) => point.value).filter(Number.isFinite);
  return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
};

/**
 * 2. 縦の動きが 1 目盛に満たないトレース。**対数の枠は見ない** (値に合わせて桁を選んでいる)。
 * **理想が平らなら言わない** — 平らなはずの実測 (100 Ω の直列) の揺れを「動かない」と言わない。
 */
function stillNotices(input: AdviceInput): readonly FenceError[] {
  return input.panels.flatMap(({ kind, series }) => {
    // **書き手が尺度を決めた枠では言わない** (平らに見えるのも承知の上)。
    if (writtenScale(series) !== null) return [];
    const axis = axisOf(kind, series);
    if (axis.log) return [];
    const division = (axis.max - axis.min) / DIVISIONS;
    const flat = (one: RectSeries): boolean => heightOf(one) < division * FLAT;
    return shown(series).flatMap((one) => {
      const model = series.find((other) => other.basis === 'model' && other.trace.index === one.trace.index);
      const height = heightOf(one);
      if (flat(one) || (model !== undefined && flat(model)) || height >= division) return [];
      const { param, format, line } = one.trace.spec;
      const instead = param === 'S11' && format === 'logmag' ? '。反射の小さな変化は swr か r / x の枠で見えます' : '';
      return [notice(
        `${traceLabel(one.trace)} は掃引の中で ${amountText(kind, Number(height.toPrecision(2)))} しか動きません (${perDivision(kind, axis)})${instead}`,
        line,
      )];
    });
  });
}

/** 負号は − (U+2212)。読み値と同じ字にする。 */
const signed = (kind: PanelKind, value: number): string => amountText(kind, Number(value.toPrecision(3))).replace(/^-/, '−');

/** 位相の 2 つの値の隔たり (度)。±180° の折り返しをまたぐ近いほうで測る。 */
const phaseDistance = (value: number, center: number): number => Math.abs(((((value - center) % 360) + 540) % 360) - 180);

/** 位相の範囲が ±180° をまたぐ枠。折り返して描くので、読み違えないように言う。 */
function wrapNotices(input: AdviceInput): readonly FenceError[] {
  return input.panels.flatMap(({ kind, series }) => {
    const axis = kind === 'deg' && writtenScale(series) !== null ? axisOf(kind, series) : null;
    if (axis === null || axis.wrapsPhase !== true) return [];
    return [notice(
      `PHASE の範囲が ±180° をまたぎます (${signed(kind, axis.min)}〜${signed(kind, axis.max)}。またいだ所は反対側に折り返して描きます)`,
      series[0]?.trace.spec.line ?? null,
    )];
  });
}

/** 尺度を書いた枠で、値が目盛の外に出るトレース。**収まる 1-2-5 の尺度を 1 つ言う**。 */
function outOfScaleNotices(input: AdviceInput): readonly FenceError[] {
  return input.panels.flatMap(({ kind, series }) => {
    if (writtenScale(series) === null) return [];
    const axis = axisOf(kind, series);
    const written = axis.max - axis.min;
    return shown(series).flatMap((one) => {
      const raw = one.points.map((point) => point.value).filter(Number.isFinite);
      if (raw.length === 0) return [];
      // 折り返す位相の軸は、描かれる側 (軸の範囲に入る側) の値で見る。
      const values = raw.map((value) => placedValue(axis, value));
      const low = Math.min(...values);
      const high = Math.max(...values);
      const tolerance = written * 1e-9;
      const outs = [
        ...(low < axis.min - tolerance ? [`最小 ${signed(kind, low)} は下端 ${signed(kind, axis.min)} (${DIVISIONS} 目盛) の外`] : []),
        ...(high > axis.max + tolerance ? [`最大 ${signed(kind, high)} は上端 ${signed(kind, axis.max)} (${DIVISIONS} 目盛) の外`] : []),
      ];
      if (outs.length === 0) return [];
      // 基準 (上端・中央・下端) は動かせないので、基準から値までの距離で必要な 1 目盛を出す。
      const need = kind === 'db' ? -low / DIVISIONS
        : kind === 'deg' ? Math.max(...raw.map((value) => phaseDistance(value, axis.center ?? 0))) / (DIVISIONS / 2)
          : kind === 'swr' ? (high - 1) / DIVISIONS : high / DIVISIONS;
      const fixable = kind === 'db' ? high <= 0 : kind === 'deg' || (low >= (kind === 'swr' ? 1 : 0));
      const advice = fixable && need > 0 ? `。${amountText(kind, step125(need))}/目盛 なら収まります` : '';
      return [notice(
        `${traceLabel(one.trace)} は ${perDivision(kind, axis)} の尺度では範囲の外です (${outs.join('、')}${advice})`,
        one.trace.spec.line,
      )];
    });
  });
}

/** 読みにくい掃引と枠のお知らせ。**終了コードは変えない** (お知らせ)。 */
export function sweepAdvice(input: AdviceInput): readonly FenceError[] {
  const panels = input.panels.filter((panel) => !isRound(panel.kind) && panel.kind !== 'tdr');
  const judged = { ...input, panels };
  return [...crowdedNotices(judged), ...stillNotices(judged), ...outOfScaleNotices(judged), ...wrapNotices(judged)];
}

import { LIMITS } from '../limits.ts';
import type { TraceName } from '../model/channel.ts';
import { formatQuantity, formatQuantityPerDiv } from '../model/quantity.ts';
import type { QuantityUnit } from '../model/quantity.ts';
import type { Trace } from '../model/readings.ts';
import { DIVISIONS } from '../model/screen.ts';
import type { Screen } from '../model/screen.ts';
import type { Scale } from '../render/trace.ts';
import { niceStep125 } from './scales.ts';

/**
 * 手で書いた `range:` `position:` が**読みにくい画面**になっていないかを数で言う
 * (52 の docs/87 の項 3: お知らせは直し方まで言う)。見るのは 2 つ —
 * 振れが 2 目盛に満たない、画面の上か下からはみ出す。Auto の尺度は入るように選ぶので言わない。
 * 直し方は値で言う (`range: 200mV/div と position: -12.5div`)。
 * **同じ尺度で重ねて比べる ch** (同じ range: と position: で、振れの大きい相手がいる) の
 * 小ささは言わない — 小さく見せるのが図の狙いだから (比べる 2 本は同じ尺度で描く)。
 */

/** 振れがこれ未満 (目盛) なら「小さい」。 */
const SMALL = 2;
/** 提案する尺度で波が占める目盛の数の上限 (Auto の 6 より 1 つ多く取る)。 */
const FILL = 7;
/** はみ出しがこれ未満 (目盛) なら言わない (線の太さのうち)。小数 1 桁で 0.1 以上に見える所から。 */
const SLACK = 0.05;
/** position: の刻み (目盛) と、書ける範囲 (parser と同じ)。 */
const POSITION_STEP = 0.5;
const POSITION_MAX = 100;
/** 範囲を広げて試す 1-2-5 の段の数 (10^4 倍まで)。 */
const WIDEN_STEPS = 12;
const HALF = DIVISIONS.y / 2;

export type Extent = { readonly min: number; readonly max: number };

/** 画面 (時間) の中の点の最大と最小。画面の中に点が無ければ null。 */
export function screenExtent(trace: Trace, screen: Screen): Extent | null {
  let min = Infinity;
  let max = -Infinity;
  const tolerance = screen.dt * 1e-6;
  for (let index = 0; index < trace.samples.length; index += 1) {
    const t = trace.t0 + index * trace.dt;
    if (t < screen.left - tolerance || t > screen.left + screen.span + tolerance) continue;
    const value = trace.samples[index] ?? 0;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return min > max ? null : { min, max };
}

const clampRange = (perDiv: number): number =>
  Math.min(LIMITS.voltsPerDiv.max, Math.max(LIMITS.voltsPerDiv.min, perDiv));

/** 1-2-5 の次の段。 */
const nextStep = (perDiv: number): number => niceStep125(perDiv * 1.01);

/**
 * 振れ `vpp` を大きく見せる V/div — **7 目盛以下に入る一番細かい 1-2-5** (占める目盛は
 * 2.8〜7。1 目盛を残すのは、position: を 0.5 目盛に丸めても縁に触れないため)。
 */
export function suggestRange(vpp: number): number {
  return clampRange(niceStep125(vpp / FILL));
}

/** 波の中央の電圧 `middle` を画面の中央に置く position: (0.5 目盛に丸める。中央 0、上が正)。 */
export const centerPosition = (middle: number, perDiv: number): number =>
  Math.round(-middle / perDiv / POSITION_STEP) * POSITION_STEP || 0;

const divText = (divisions: number): string => divisions.toFixed(1);
const positionText = (position: number): string => `position: ${position}div`;
const rangeText = (perDiv: number, unit?: QuantityUnit): string => `range: ${formatQuantityPerDiv(perDiv, unit)}`;

/** 上と下のはみ出し (目盛。はみ出していなければ 0)。 */
function overflowOf(extent: Extent, scale: Scale): { readonly above: number; readonly below: number } {
  return {
    above: Math.max(0, extent.max / scale.perDiv + scale.position - HALF),
    below: Math.max(0, -HALF - (extent.min / scale.perDiv + scale.position)),
  };
}

const fits = (extent: Extent, scale: Scale): boolean => {
  const { above, below } = overflowOf(extent, scale);
  return above < SLACK && below < SLACK;
};

export type FitInput = {
  readonly name: TraceName;
  /** 縦の量の単位 (Math だけ W や無次元。書かなければ V)。 */
  readonly unit?: QuantityUnit;
  /** 画面の中の点の最大と最小 (実測があれば実測、無ければ理想)。 */
  readonly extent: Extent;
  /** 書いた range: / position: (書かなければ null)。 */
  readonly range: number | null;
  readonly position: number | null;
  /** 描いた尺度 (Auto で補った分を含む)。 */
  readonly scale: Scale;
};

/** 描いた尺度で振れる目盛の数。 */
const swingOf = (input: FitInput): number => (input.extent.max - input.extent.min) / input.scale.perDiv;

/**
 * 同じ尺度で重ねて比べる相手がいるか — 書いた range: が同じで、描いた基準 (position:) も同じ
 * 別の ch に、2 目盛以上振れるものがある。相手も小さければ比べる相手にならない。
 */
function comparedOnSameScale(input: FitInput, others: readonly FitInput[]): boolean {
  return others.some((other) =>
    other.name !== input.name
    && other.range !== null
    && other.range === input.range
    && other.scale.position === input.scale.position
    && swingOf(other) >= SMALL);
}

/** 範囲と中央をまとめて直す案。position: が範囲の外に出るなら null。 */
function recenter(extent: Extent): { readonly perDiv: number; readonly position: number } | null {
  const perDiv = suggestRange(extent.max - extent.min);
  const position = centerPosition((extent.max + extent.min) / 2, perDiv);
  return Math.abs(position) > POSITION_MAX ? null : { perDiv, position };
}

const farAway = (extent: Extent, unit?: QuantityUnit): string =>
  `中央の ${formatQuantity((extent.max + extent.min) / 2, unit)} が遠く、range: を細かくすると position: の範囲 (±${POSITION_MAX}div) に入りません`;

/** はみ出しの直し方。振れが小さければ範囲と中央、入る範囲なら中央、入らなければ範囲 (中央はそのまま) を広げる。 */
function overflowFix(input: FitInput, small: boolean): string {
  const { extent, scale } = input;
  const both = (): string => {
    const fix = recenter(extent);
    return fix === null ? farAway(extent, input.unit) : `${rangeText(fix.perDiv, input.unit)} と ${positionText(fix.position)} なら入ります`;
  };
  if (small) return both();
  const centred = centerPosition((extent.max + extent.min) / 2, scale.perDiv);
  if (Math.abs(centred) <= POSITION_MAX && fits(extent, { perDiv: scale.perDiv, position: centred })) {
    return `${positionText(centred)} なら入ります`;
  }
  let perDiv = scale.perDiv;
  for (let step = 0; step < WIDEN_STEPS && perDiv < LIMITS.voltsPerDiv.max; step += 1) {
    perDiv = nextStep(perDiv);
    if (fits(extent, { perDiv, position: scale.position })) return `${rangeText(perDiv, input.unit)} なら入ります`;
  }
  return both();
}

/** 振れが小さいときの直し方。position: を書いていれば中央も言う。 */
function smallFix(input: FitInput): string {
  const { extent } = input;
  const vpp = extent.max - extent.min;
  const fix = recenter(extent);
  if (fix === null) return farAway(extent, input.unit);
  const spans = divText(vpp / fix.perDiv);
  return input.position === null
    ? `${rangeText(fix.perDiv, input.unit)} なら ${spans} 目盛になります`
    : `${rangeText(fix.perDiv, input.unit)} と ${positionText(fix.position)} なら ${spans} 目盛で中央に来ます`;
}

/**
 * 1 つの ch の読みにくさ。**言うことは 1 つまで** — はみ出しが先 (見えていない所がある)、
 * 次に振れの小ささ。range: も position: も書いていなければ (Auto) 何も言わない。
 * `others` は同じ画面の ch (自分を含んでよい)。同じ尺度で振れの大きい相手がいれば小ささは言わない。
 */
export function fitNotice(input: FitInput, others: readonly FitInput[] = []): string | null {
  const { extent, scale, range, position } = input;
  if (range === null && position === null) return null;
  const vpp = extent.max - extent.min;
  if (!(vpp > 0) || !Number.isFinite(vpp)) return null;
  const label = input.name.toUpperCase();
  const small = range !== null && vpp / scale.perDiv < SMALL;
  const { above, below } = overflowOf(extent, scale);
  if (above >= SLACK || below >= SLACK) {
    const where = [
      ...(above >= SLACK ? [`上に ${divText(above)} 目盛`] : []),
      ...(below >= SLACK ? [`下に ${divText(below)} 目盛`] : []),
    ].join('、');
    return `${label} は画面の${where}はみ出しています (${overflowFix(input, small)})`;
  }
  if (!small || comparedOnSameScale(input, others)) return null;
  return `${label} の振れは ${divText(vpp / scale.perDiv)} 目盛です (${smallFix(input)})`;
}

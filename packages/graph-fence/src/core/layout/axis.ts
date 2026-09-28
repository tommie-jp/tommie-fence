import { PREFIXES, threeDigits, withPrefix } from '../model/quantity.ts';

/**
 * 軸の目盛。**紙のグラフの目盛** — 計器の画面 (vna の 10 dB/div、scope の 10 × 8) の
 * 固定の目盛は写さない (52 の docs/96 の判断の記録)。
 *
 * - 直線: 1・2・5 × 10^k の幅で、目盛が **4〜8 本**になる一番細かい幅。deg だけ 15・30・45・90
 * - 範囲を省いたとき: **大きさの量は 0 から** (0 から始めない軸は差を大きく見せる。readable-graph #5)。
 *   dB と deg と、負の値を含む線は値を包む切りのよい範囲
 * - 対数: 10 倍ごとの主目盛と、2・5 の副目盛。字は主目盛と両端に必ず、副目盛は間が空けば
 */

export type Tick = { readonly value: number; readonly major: boolean };

export type Axis = {
  readonly min: number;
  readonly max: number;
  readonly log: boolean;
  readonly ticks: readonly Tick[];
};

const MIN_TICKS = 4;
const MAX_TICKS = 8;
const DEGREE_STEPS = [15, 30, 45, 90, 180];

/** 0 から始めない単位。**負の値を持つ量** (dB・deg)。 */
const SIGNED_UNITS = new Set(['dB', 'deg', 'dBm', 'dBV', '°', '℃']);

/** 範囲を省いた縦軸を 0 から始めるか。**大きさの量だけ** (readable-graph #5)。 */
export const startsAtZero = (unit: string): boolean => !SIGNED_UNITS.has(unit);

const finite = (values: readonly number[]): number[] => values.filter(Number.isFinite);

/** 1・2・5 の幅の列 (小さい順)。 */
function niceSteps(span: number): number[] {
  const base = 10 ** Math.floor(Math.log10(span / MAX_TICKS));
  return [1, 2, 5, 10, 20, 50, 100].map((factor) => factor * base);
}

/** 目盛の数が 4〜8 になる幅。**端は幅の倍数に広げる**ときと、書かれた範囲のまま置くときがある。 */
function pickStep(min: number, max: number, degrees: boolean, widen: boolean): number {
  const span = max - min;
  const steps = degrees && span >= 30 ? DEGREE_STEPS : niceSteps(span);
  const count = (step: number): number =>
    (widen ? Math.ceil(max / step - 1e-9) - Math.floor(min / step + 1e-9) : Math.floor(span / step + 1e-9));
  return steps.find((step) => count(step) <= MAX_TICKS && count(step) >= MIN_TICKS)
    ?? steps.find((step) => count(step) <= MAX_TICKS)
    ?? steps[steps.length - 1] ?? span;
}

/**
 * 直線の軸。`range` が書かれていればそのまま、無ければ値から。`zero` が真なら
 * 値が全部正でも 0 から (縦軸の大きさの量)。横軸は値を包むだけ。
 */
export function linearAxis(values: readonly number[], range: readonly [number, number] | null, unit: string, zero: boolean): Axis {
  const degrees = unit === 'deg' || unit === '°';
  if (range !== null) {
    const step = pickStep(range[0], range[1], degrees, false);
    const first = Math.ceil(range[0] / step - 1e-9) * step;
    const ticks: Tick[] = [];
    for (let value = first; value <= range[1] + step * 1e-9; value += step) ticks.push({ value: clean(value), major: true });
    return { min: range[0], max: range[1], log: false, ticks };
  }
  const seen = finite(values);
  let low = seen.length === 0 ? 0 : Math.min(...seen);
  let high = seen.length === 0 ? 1 : Math.max(...seen);
  if (zero && low >= 0) low = 0;
  if (zero && high <= 0 && low < 0) high = 0;
  if (high === low) {
    const pad = high === 0 ? 1 : Math.abs(high) * 0.5;
    high += pad;
    if (!zero || low < 0) low -= pad;
  }
  const step = pickStep(low, high, degrees, true);
  const min = clean(Math.floor(low / step + 1e-9) * step);
  const max = clean(Math.ceil(high / step - 1e-9) * step);
  const ticks: Tick[] = [];
  for (let value = min; value <= max + step * 1e-9; value += step) ticks.push({ value: clean(value), major: true });
  return { min, max, log: false, ticks };
}

/** 対数の軸。範囲が無ければ値を包む 10 の冪。 */
export function logAxis(values: readonly number[], range: readonly [number, number] | null): Axis {
  const positive = finite(values).filter((value) => value > 0);
  const min = range?.[0] ?? (positive.length === 0 ? 1 : 10 ** Math.floor(Math.log10(Math.min(...positive)) + 1e-9));
  let max = range?.[1] ?? (positive.length === 0 ? 10 : 10 ** Math.ceil(Math.log10(Math.max(...positive)) - 1e-9));
  if (max <= min) max = min * 10;
  const ticks: Tick[] = [];
  for (let decade = Math.floor(Math.log10(min)) - 1; decade <= Math.ceil(Math.log10(max)); decade += 1) {
    for (const factor of [1, 2, 5]) {
      const value = clean(factor * 10 ** decade);
      if (value >= min * (1 - 1e-9) && value <= max * (1 + 1e-9)) ticks.push({ value, major: factor === 1 });
    }
  }
  return { min, max, log: true, ticks };
}

/** 浮動小数の端数を落とす (`0.30000000000000004` → `0.3`)。 */
function clean(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
}

/** 軸の上の位置 (0 = 始め、1 = 終わり)。**外は縁に寄せる** (NaN を書かない)。 */
export function fraction(axis: Axis, value: number): number {
  if (!Number.isFinite(value)) return value > 0 ? 1 : 0;
  const t = axis.log
    ? (Math.log10(Math.max(value, Number.MIN_VALUE)) - Math.log10(axis.min)) / (Math.log10(axis.max) - Math.log10(axis.min))
    : (value - axis.min) / (axis.max - axis.min);
  return Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
};

/** 10 の冪 (`10⁻³`)。 */
const power = (exponent: number): string => `10${[...String(exponent)].map((char) => SUPERSCRIPT[char] ?? char).join('')}`;

/** 接頭辞を付けた、末尾の 0 を落とした字 (`2k` `10k` `1.59k`)。 */
const shortPrefix = (value: number): string => withPrefix(value).replace(/(\.\d*?)0+(?=[^\d]*$)/, '$1').replace(/\.(?=[^\d]*$)/, '');

/**
 * 目盛の字。対数の軸は接頭辞 (`2k` `10k`)、直線は素の数 (`0` `5` `−40`)。
 * **単位が接頭辞で始まる対数の軸 (mA・µA) は 10 の冪** — `100m` と書くと「100m mA」と
 * 接頭辞が重なって読めない。10 の冪でない値 (1 桁の中の軸の両端) は素の数。
 */
export function tickLabel(value: number, axis: Axis, unit = ''): string {
  const stacked = unit.length > 1 && Object.hasOwn(PREFIXES, unit[0] ?? '');
  if (axis.log && stacked) {
    const exponent = Math.log10(value);
    if (Math.abs(exponent - Math.round(exponent)) < 1e-9) return power(Math.round(exponent));
    // 10 の冪でない目盛 (1 桁の中の軸の両端・副目盛) は素の数。間引きは呼ぶ側。
    return plain(value).replace(/^-/, '−');
  }
  // **書き方は軸ごとに 1 つ** (2000 と 10k を混ぜない)。軸の端の大きさで決める。
  const size = Math.max(Math.abs(axis.min), Math.abs(axis.max));
  const prefixed = axis.log || size >= 1e4 || (size !== 0 && size < 1e-3);
  const text = prefixed ? shortPrefix(value) : plain(value);
  return text.replace(/^-/, '−');
}

/** 直線の目盛の字。**目盛の幅の桁まで** (0.5 刻みなら 1 桁)。 */
function plain(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const text = String(Number(value.toPrecision(6)));
  return text.length > 7 ? threeDigits(value) : text;
}

import { extentOf } from './screen.ts';

/**
 * Measurements。**理想も実測も同じ算法** — どちらも点の列から測る (52 の docs/85)。
 * 名前は WaveForms の Measurements に揃える。
 *
 * - 横切りの水準は **max と min の中央**。ノイズで横切りが増えないよう、Vpp の 5 % の
 *   ヒステリシスを付ける (一度水準の下へ 5 % 抜けてから、上へ横切った点だけ数える)
 * - freq / period は上向きの横切りの間隔の平均。**1 周期に満たなければ null** (`—`)
 * - avg / rms / duty は**整数の周期**の中で測る (画面の端の半端な周期で偏らない)。
 *   周期が見えなければ画面全体
 * - phase は reference (ch1) の横切りからの遅れ / 周期 × 360 ((−180, 180]。負は遅れ。±180° は 180°)。
 *   **周期が基準と 2 % 以上違えば null** (周波数の違う波の位相差は無意味)
 * - rise は 10〜90 % の立ち上がり時間
 */
export const MEASURE_NAMES = ['vpp', 'vmax', 'vmin', 'avg', 'rms', 'freq', 'period', 'duty', 'phase', 'rise'] as const;
export type MeasureName = (typeof MEASURE_NAMES)[number];

const HYSTERESIS = 0.05;

type Samples = ArrayLike<number>;

/** 上向き (`sign` = 1) か下向き (−1) の横切り (点の番号。小数は直線補間)。 */
function crossingsOf(samples: Samples, level: number, hysteresis: number, sign: 1 | -1): readonly number[] {
  const found: number[] = [];
  let armed = false;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] ?? 0;
    if (!armed) {
      if (sign * (value - level) < -hysteresis) armed = true;
      continue;
    }
    if (sign * (value - level) >= 0) {
      const before = samples[index - 1] ?? value;
      found.push(index - 1 + (value === before ? 1 : (level - before) / (value - before)));
      armed = false;
    }
  }
  return found;
}

type Shape = {
  readonly min: number;
  readonly max: number;
  readonly level: number;
  /** 周期を測った向きの横切り (点の番号)。上向きが 2 つあれば上向き、無ければ下向き。 */
  readonly crossings: readonly number[];
  /** 上向きの横切り (phase はこちらで合わせる)。 */
  readonly rising: readonly number[];
  /** 1 周期 (点の数)。どちらの向きも横切りが 2 つ無ければ null。 */
  readonly period: number | null;
};

const periodFrom = (crossings: readonly number[]): number | null => {
  const first = crossings[0];
  const last = crossings.at(-1);
  return first !== undefined && last !== undefined && crossings.length >= 2 ? (last - first) / (crossings.length - 1) : null;
};

/**
 * 形 (最大・最小・横切り・周期)。**画面にちょうど 2 周期**のとき (Auto の time/div) は
 * 上向きの横切りが両端に 1 つずつ落ちて 1 つしか数えられないことがあるので、
 * そのときは下向きの横切りで周期を測る。
 */
function shapeOf(samples: Samples): Shape | null {
  const extent = extentOf(samples);
  if (extent === null) return null;
  const level = (extent.max + extent.min) / 2;
  const hysteresis = (extent.max - extent.min) * HYSTERESIS;
  const flat = extent.max === extent.min;
  const rising = flat ? [] : crossingsOf(samples, level, hysteresis, 1);
  const falling = flat ? [] : crossingsOf(samples, level, hysteresis, -1);
  const crossings = periodFrom(rising) !== null || periodFrom(falling) === null ? rising : falling;
  return { ...extent, level, crossings, rising, period: periodFrom(crossings) };
}

/** 整数の周期の範囲 [from, to] (点の番号。小数も)。周期が見えなければ全体。 */
function windowOf(shape: Shape, length: number): readonly [number, number] {
  const first = shape.crossings[0];
  const last = shape.crossings.at(-1);
  if (shape.period === null || first === undefined || last === undefined) return [0, Math.max(0, length - 1)];
  return [first, last];
}

/**
 * [from, to] の中の f の平均。**点の間は直線でつなぎ (台形)、端の半端な刻みも数える** —
 * 端を点に丸めると 1 周期の点の数が半端なとき (4095.5 点など) 4 桁目がずれる。
 */
function meanOver(samples: Samples, [from, to]: readonly [number, number], f: (value: number) => number): number {
  if (to <= from) return f(samples[Math.round(from)] ?? 0);
  const at = (x: number): number => {
    const i = Math.min(Math.floor(x), samples.length - 2);
    const a = f(samples[i] ?? 0);
    const b = f(samples[i + 1] ?? 0);
    return a + (b - a) * (x - i);
  };
  let sum = 0;
  for (let left = from; left < to;) {
    const right = Math.min(to, Math.floor(left) + 1);
    sum += ((at(left) + at(right)) / 2) * (right - left);
    left = right;
  }
  return sum / (to - from);
}

/** (−0.5, 0.5] に畳む。 */
const wrap = (cycles: number): number => cycles - Math.ceil(cycles - 0.5);

/**
 * 周期が基準とこれ以上違えば phase を出さない (比)。**周波数の違う波どうしの位相差には
 * 意味が無い** — 2f で振れる瞬時電力 (Math = v × i) に角度を出すと、読み手は遅れと読む。
 */
const PHASE_PERIOD_TOLERANCE = 0.02;

function phaseOf(shape: Shape, reference: Samples, dt: number, referenceDt: number): number | null {
  const other = shapeOf(reference);
  if (shape.period === null || other === null || other.period === null || other.rising.length === 0 || shape.rising.length === 0) return null;
  if (Math.abs((shape.period * dt) / (other.period * referenceDt) - 1) > PHASE_PERIOD_TOLERANCE) return null;
  const period = shape.period;
  const offsets = shape.rising.map((own) => other.rising
    .map((ref) => wrap((own - ref) / period))
    .reduce((best, one) => (Math.abs(one) < Math.abs(best) ? one : best), 0.5));
  // **平均の前に 1 つの枝に揃える。** ちょうど半周期のずれは横切りごとに +0.5 と −0.5 に
  // 分かれることがあり、そのまま平均すると打ち消し合って 0° になる (−180° が 0.0° と出た)。
  // 最初のずれを基準に、各ずれを基準から ±0.5 周期の中へ 1 周期ずつ動かしてから平均する。
  const base = offsets[0] ?? 0;
  const aligned = offsets.map((one) => one - Math.round(one - base));
  const mean = aligned.reduce((sum, one) => sum + one, 0) / aligned.length;
  return toHalfOpen(-mean * 360);
}

/** 計算の誤差で −180° の側に来たものも 180° と読む幅 (度)。 */
const PHASE_EDGE = 1e-6;

/** (−180, 180] に丸める。**±180° はどちら向きに書いても 180°**。 */
function toHalfOpen(degrees: number): number {
  const wrapped = degrees - 360 * Math.ceil((degrees - 180) / 360);
  return wrapped <= -180 + PHASE_EDGE ? wrapped + 360 : wrapped;
}

function riseOf(samples: Samples, shape: Shape): number | null {
  const span = shape.max - shape.min;
  if (span === 0) return null;
  const low = shape.min + span * 0.1;
  const high = shape.min + span * 0.9;
  const rises: number[] = [];
  let from: number | null = null;
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1] ?? 0;
    const b = samples[index] ?? 0;
    const cross = (level: number): number => index - 1 + (level - a) / (b - a);
    if (a < low && b >= low) from = cross(low);
    if (from !== null && a < high && b >= high) {
      rises.push(cross(high) - from);
      from = null;
    }
    if (a > low && b <= low) from = null;
  }
  return rises.length === 0 ? null : rises.reduce((sum, one) => sum + one, 0) / rises.length;
}

/**
 * 点の列から 1 つ測る。`dt` は点の間隔 (s)、`reference` は phase の基準 (ch1)、`referenceDt` はその間隔。
 * **測れなければ null** (読み値の帯には `—`)。phase は周期が基準と違えば null。
 */
export function measure(name: MeasureName, samples: Samples, dt: number, reference?: Samples, referenceDt = dt): number | null {
  const shape = shapeOf(samples);
  if (shape === null) return null;
  switch (name) {
    case 'vmax':
      return shape.max;
    case 'vmin':
      return shape.min;
    case 'vpp':
      return shape.max - shape.min;
    case 'avg':
      return meanOver(samples, windowOf(shape, samples.length), (value) => value);
    case 'rms':
      return Math.sqrt(meanOver(samples, windowOf(shape, samples.length), (value) => value * value));
    case 'period':
      return shape.period === null ? null : shape.period * dt;
    case 'freq':
      return shape.period === null ? null : 1 / (shape.period * dt);
    case 'duty':
      return shape.period === null ? null : meanOver(samples, windowOf(shape, samples.length), (value) => (value > shape.level ? 1 : 0));
    case 'phase':
      return reference === undefined ? null : phaseOf(shape, reference, dt, referenceDt);
    case 'rise': {
      const rise = riseOf(samples, shape);
      return rise === null ? null : rise * dt;
    }
  }
}

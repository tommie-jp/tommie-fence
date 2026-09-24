/**
 * 縦軸の目盛。**8 目盛** (NanoVNA の画面と同じ縦の数)。
 *
 * - dB: 上が 0 dB、10 dB/目盛 (実機の既定)。0 dB を超える値 (アンプ) があれば 10 ずつ上げる
 * - 位相: −180〜180°、45°/目盛
 * - SWR: 1 から。値に合わせて 2 / 3 / 5 / 9 まで
 * - linear: 0〜1
 * - |Z| だけの枠: 対数 (10 倍ごと)。R / X が混ざれば線形
 * - 群遅延・Ω・TDR: 値に合わせて切りの良い幅
 */
export const DIVISIONS = 8;

export type Axis = {
  readonly min: number;
  readonly max: number;
  /** 対数の軸か (値は log10 で置く)。 */
  readonly log: boolean;
  /** 目盛の値 (下から上へ、両端を含む)。 */
  readonly ticks: readonly number[];
};

const linear = (min: number, max: number): Axis => ({
  min, max, log: false,
  ticks: Array.from({ length: DIVISIONS + 1 }, (_, index) => min + ((max - min) * index) / DIVISIONS),
});

const finite = (values: readonly number[]): readonly number[] => values.filter(Number.isFinite);

export function dbAxis(values: readonly number[]): Axis {
  const top = Math.max(0, ...finite(values).map((value) => Math.ceil(value / 10) * 10));
  const capped = Math.min(top, 80);
  return linear(capped - 10 * DIVISIONS, capped);
}

export const degAxis = (): Axis => linear(-180, 180);

export function swrAxis(values: readonly number[]): Axis {
  const max = Math.max(1, ...finite(values));
  const top = max <= 2 ? 2 : max <= 3 ? 3 : max <= 5 ? 5 : 9;
  return linear(1, top);
}

export const linAxis = (): Axis => linear(0, 1);

/** 1・2・2.5・5 × 10^k の刻みで、8 目盛に収まる一番細かいもの。 */
function niceStep(span: number): number {
  const raw = span / DIVISIONS;
  const power = 10 ** Math.floor(Math.log10(raw));
  const found = [1, 2, 2.5, 5, 10].find((multiple) => multiple * power >= raw);
  return (found ?? 10) * power;
}

/** 値に合わせた線形の軸。**0 を含める**か (Ω・TDR は含める)。 */
export function niceAxis(values: readonly number[], withZero: boolean, fallback: readonly [number, number]): Axis {
  const kept = finite(values);
  let low = kept.length === 0 ? fallback[0] : Math.min(...kept);
  let high = kept.length === 0 ? fallback[1] : Math.max(...kept);
  if (withZero) {
    low = Math.min(0, low);
    high = Math.max(0, high);
  }
  if (high - low < 1e-12) {
    const pad = Math.abs(high) > 0 ? Math.abs(high) * 0.5 : 1;
    low -= pad;
    high += pad;
  }
  let step = niceStep(high - low);
  let min = Math.floor(low / step) * step;
  // 下を切り捨てたぶん上が足りなくなることがある。足りるまで刻みを上げる。
  while (min + step * DIVISIONS < high) {
    step = niceStep(step * DIVISIONS * 1.01);
    min = Math.floor(low / step) * step;
  }
  return linear(min, min + step * DIVISIONS);
}

/**
 * R / X (と |Z|) の混ざった枠。**値の 5〜95% の幅で目盛を決める** — 低い周波数の
 * コンデンサ (数 kΩ) や共振の山 (GΩ) に目盛を引きずられると、見たい所が 0 の線に
 * 潰れる。外れた値は枠の縁に沿う (実機も縁に張り付く)。
 */
export function ohmAxis(values: readonly number[]): Axis {
  const sorted = [...finite(values)].sort((a, b) => a - b);
  if (sorted.length === 0) return niceAxis([], true, [0, 100]);
  const pick = (ratio: number): number => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
  return niceAxis([pick(0.05), pick(0.95)], true, [0, 100]);
}

/** |Z| だけの枠。**10 倍ごとの対数** (SRF の谷が見える)。0.1 Ω〜100 MΩ、2〜8 桁。 */
export function logOhmAxis(values: readonly number[]): Axis {
  const kept = finite(values).filter((value) => value > 0);
  // **下も上と同じ幅で頭を打つ** (開放の 1 GΩ だけの枠で目盛が 1000MΩ から始まった)。
  const low = kept.length === 0 ? 1 : Math.min(1e6, Math.max(0.1, Math.min(...kept)));
  const high = kept.length === 0 ? 1000 : Math.min(1e8, Math.max(...kept));
  let bottom = Math.floor(Math.log10(low));
  let top = Math.max(bottom + 2, Math.ceil(Math.log10(high)));
  if (top - bottom > DIVISIONS) bottom = top - DIVISIONS;
  top = Math.max(top, bottom + 2);
  return {
    min: bottom,
    max: top,
    log: true,
    ticks: Array.from({ length: top - bottom + 1 }, (_, index) => bottom + index),
  };
}

/** 軸の上の位置 (0 = 下、1 = 上)。**枠の外は縁に寄せる** (実機も縁に張り付く)。 */
export function fraction(axis: Axis, value: number): number {
  const placed = axis.log ? Math.log10(Math.max(value, 1e-12)) : value;
  const raw = (placed - axis.min) / (axis.max - axis.min);
  return Math.max(0, Math.min(1, raw));
}

/** 目盛の字。桁は刻みに合わせる。 */
export function tickLabel(value: number, axis: Axis, unit: string): string {
  if (axis.log) return siLabel(10 ** value, unit);
  const step = (axis.max - axis.min) / DIVISIONS;
  // 刻みを割り切れる桁 (0.125 は 3 桁、45 は 0 桁)。3 桁で頭を打つ。
  const digits = [0, 1, 2, 3].find((places) => Math.abs(step * 10 ** places - Math.round(step * 10 ** places)) < 1e-6) ?? 3;
  // 負号は − (U+2212)。読み値と同じ字にする (ハイフンは細くて読み落とす)。
  const text = (Math.abs(value) < step / 1e6 ? 0 : value).toFixed(digits).replace(/^-/, '−');
  return unit === '' ? text : `${text}${unit}`;
}

/** `1k` `10M` のような接頭辞つきの数 (Ω の対数の目盛)。 */
export function siLabel(value: number, unit: string): string {
  const [scale, prefix] = value >= 1e6 ? [1e6, 'M'] : value >= 1e3 ? [1e3, 'k'] : [1, ''];
  const shown = Math.round((value / scale) * 1000) / 1000;
  return `${shown}${prefix}${unit}`;
}

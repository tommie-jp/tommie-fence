import { Z0, abcdToS, cascade, lineAbcd, seriesZ, shuntY, terminatedGamma } from './abcd.ts';
import type { Abcd } from './abcd.ts';
import { ZERO, add, complex, div, inverse, isFiniteComplex, mul } from './complex.ts';
import type { Complex } from './complex.ts';
import type { SPoint } from './sparams.ts';

/**
 * 理想の模型 (`dut:`)。**CH0 から CH1 へ書いた順に縦続**する。
 * 最後に `open` / `short` を書くと、CH1 に繋がない 1 端子 (S11 だけ) になる。
 */

/** 光の速さ (m/s)。 */
const C0 = 299_792_458;

export type Place = 'series' | 'shunt';

/**
 * 集中定数。値のほかに**寄生分**を持てる — `esr` と `esl` は直列に、`cp` は
 * 全体に並列に付く。これで水晶 (C + L + R に並列 C) も SRF を持つコンデンサも書ける。
 */
export type LumpedSpec = {
  readonly kind: 'lumped';
  readonly place: Place;
  readonly part: 'R' | 'L' | 'C';
  readonly value: number;
  readonly esr: number;
  readonly esl: number;
  readonly cp: number;
};

/** 伝送線路 (損失なし)。先を `open` / `short` にするとスタブ。 */
export type LineSpec = {
  readonly kind: 'line';
  readonly place: Place;
  readonly z0: number;
  /** 長さ (m)。 */
  readonly length: number;
  /** 速度係数。 */
  readonly vf: number;
  readonly end: 'open' | 'short' | null;
};

/** 模型の終わり。CH1 には繋がない。 */
export type EndSpec = { readonly kind: 'end'; readonly end: 'open' | 'short' };

export type DutBody = LumpedSpec | LineSpec | EndSpec;
export type DutElement = DutBody & { readonly line: number | null };

const omegaOf = (f: number): number => 2 * Math.PI * f;

/** 並列にする。**片方が 0 Ω なら 0**。和が 0 (並列共振) なら大きな有限の値 (開放)。 */
function parallel(a: Complex, b: Complex): Complex {
  if (isZero(a) || isZero(b)) return ZERO;
  const sum = add(a, b);
  if (isZero(sum)) return complex(OPEN_OHMS);
  return div(mul(a, b), sum);
}

const isZero = (value: Complex): boolean => value.re === 0 && value.im === 0;

/** 開放・短絡の代わりに置く有限の値。**割り算を壊さず、S は十分に 1 / 0 へ寄る**。 */
const OPEN_OHMS = 1e15;
const SHORT_SIEMENS = 1e15;

/** Z → 並列のアドミタンス。**0 Ω (GND への短絡) は大きな有限の Y**。 */
const admittanceOf = (z: Complex): Complex => (isZero(z) ? complex(SHORT_SIEMENS) : inverse(z));

/** 集中定数 1 つのインピーダンス。 */
export function impedanceOf(spec: LumpedSpec, f: number): Complex {
  const w = omegaOf(f);
  const core = spec.part === 'R' ? complex(spec.value)
    : spec.part === 'L' ? complex(0, w * spec.value)
      : complex(0, -1 / (w * spec.value));
  const series = add(core, complex(spec.esr, w * spec.esl));
  if (spec.cp === 0) return series;
  return parallel(series, complex(0, -1 / (w * spec.cp)));
}

/** 線路の電気長 (ラジアン)。 */
export const electricalLength = (spec: LineSpec, f: number): number =>
  (2 * Math.PI * f * spec.length) / (spec.vf * C0);

/** 先を開放・短絡した線路の入力インピーダンス。 */
export function stubImpedance(spec: LineSpec, f: number): Complex {
  const t = Math.tan(electricalLength(spec, f));
  return spec.end === 'short' ? complex(0, spec.z0 * t) : complex(0, -spec.z0 / t);
}

function matrixOf(element: LumpedSpec | LineSpec, f: number): Abcd {
  if (element.kind === 'line') {
    if (element.end === null) return lineAbcd(element.z0, electricalLength(element, f));
    const z = stubImpedance(element, f);
    return element.place === 'series' ? seriesZ(z) : shuntY(admittanceOf(z));
  }
  const z = impedanceOf(element, f);
  return element.place === 'series' ? seriesZ(z) : shuntY(admittanceOf(z));
}

/** 模型が 1 端子か (最後が `open` / `short`)。 */
export const endOf = (elements: readonly DutElement[]): 'open' | 'short' | null => {
  const last = elements.at(-1);
  return last?.kind === 'end' ? last.end : null;
};

/** 壊れた値 (0 割りの Infinity・NaN) を「測れない」に畳む。 */
const finiteOr = (value: Complex): Complex | null => (isFiniteComplex(value) ? value : null);

/** 1 つの周波数での S。 */
export function sparamAt(elements: readonly DutElement[], f: number): SPoint {
  const body = elements.filter((element): element is DutElement & (LumpedSpec | LineSpec) => element.kind !== 'end');
  const matrix = cascade(body.map((element) => matrixOf(element, f)));
  const end = endOf(elements);
  if (end !== null) return { f, s11: finiteOr(terminatedGamma(matrix, end)), s21: null, s12: null, s22: null };
  const s = abcdToS(matrix, Z0);
  return { f, s11: finiteOr(s.s11), s21: finiteOr(s.s21), s12: finiteOr(s.s12), s22: finiteOr(s.s22) };
}

export const sparamsOf = (elements: readonly DutElement[], frequencies: readonly number[]): readonly SPoint[] =>
  frequencies.map((f) => sparamAt(elements, f));

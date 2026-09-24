import type { PanelTrace } from '../layout/panels.ts';
import type { MarkerSpec } from '../types.ts';
import { abs } from './complex.ts';
import type { Complex } from './complex.ts';
import { sparamAt } from './dut.ts';
import type { DutElement } from './dut.ts';
import { formatHertz } from './frequency.ts';
import { gammaEdge, scalarOf } from './series.ts';
import type { Basis, TdrSeries } from './series.ts';
import { groupDelay, impedanceFrom, phaseDeg, valueOf } from './sparams.ts';
import type { SPoint } from './sparams.ts';

/**
 * マーカーの読み値。**NanoVNA のマーカーと同じ書式** (`10.000 MHz` `-6.02 dB`)。
 * `data:` があれば**測った値** (マーカーは一番近い点に吸い付く、実機と同じ)、
 * 無ければ `dut:` の模型をその周波数で計算した値。
 */
export type Readings = {
  readonly basis: Basis | null;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** 表に収まらない読み (TDR の山)。 */
  readonly extra: readonly string[];
};

const FORMAT_LABEL: Readonly<Record<string, string>> = {
  logmag: 'LOGMAG', phase: 'PHASE', delay: 'DELAY', smith: 'SMITH', polar: 'POLAR',
  swr: 'SWR', linear: 'LINEAR', r: 'R', x: 'X', z: '|Z|', tdr: 'TDR',
};

export const traceLabel = (trace: PanelTrace): string => `${trace.spec.param} ${FORMAT_LABEL[trace.spec.format] ?? ''}`;

/** Ω の綴り (`150.0 Ω` `1.50 kΩ` `2.20 MΩ`)。 */
export function formatOhm(value: number): string {
  const size = Math.abs(value);
  if (size >= 1e6) return `${(value / 1e6).toFixed(2)} MΩ`;
  if (size >= 1e3) return `${(value / 1e3).toFixed(2)} kΩ`;
  return `${value.toFixed(1)} Ω`;
}

/** 負の数の頭を − (U+2212) にする。**実機の画面と同じ字**で、ハイフンより読みやすい。 */
const minus = (text: string): string => text.replace(/^-(?=0(?:\.0+)?(?:\s|$|°))/, '').replace(/^-/, '−');

function impedanceText(gamma: Complex): string {
  const edge = gammaEdge(gamma);
  if (edge === 'open') return '開放';
  if (edge === 'short') return '短絡';
  const z = impedanceFrom(gamma);
  // **丸めて 0 になる負の虚部は + で書く** (`− j0.0 Ω` を出さない)。
  const sign = z.im < 0 && formatOhm(-z.im) !== formatOhm(0) ? '−' : '+';
  return `${minus(formatOhm(z.re))} ${sign} j${formatOhm(Math.abs(z.im))}`;
}

/** 1 つの形式の 1 点の読み。群遅延は `delay` (秒) を別に渡す。 */
export function formatReading(trace: PanelTrace, value: Complex, delay: number | null): string {
  const { format } = trace.spec;
  switch (format) {
    case 'logmag': return `${minus((scalarOf(format, value) ?? 0).toFixed(2))} dB`;
    case 'phase': return `${minus(phaseDeg(value).toFixed(2))}°`;
    case 'delay': return delay === null ? '—' : `${minus((delay * 1e9).toFixed(3))} ns`;
    case 'swr': return (scalarOf(format, value) ?? 0).toFixed(2);
    case 'linear': return abs(value).toFixed(3);
    case 'r': case 'x': case 'z': return minus(formatOhm(scalarOf(format, value) ?? 0));
    case 'smith': return impedanceText(value);
    case 'polar': return `${abs(value).toFixed(3)} ∠ ${minus(phaseDeg(value).toFixed(1))}°`;
    default: return '—';
  }
}

/** 一番近い点の番号。 */
function nearest(points: readonly SPoint[], f: number): number {
  let best = 0;
  points.forEach((point, index) => {
    if (Math.abs(point.f - f) < Math.abs((points[best]?.f ?? 0) - f)) best = index;
  });
  return best;
}

export type ReadingInput = {
  readonly traces: readonly PanelTrace[];
  readonly markers: readonly MarkerSpec[];
  readonly dut: readonly DutElement[];
  /** 模型の掃引の刻み (群遅延の差を取る幅)。 */
  readonly step: number;
  readonly data: readonly SPoint[] | null;
  readonly tdr: readonly TdrSeries[];
};

export function readingsOf(input: ReadingInput): Readings {
  const { traces, markers, dut, step, data, tdr } = input;
  const basis: Basis | null = data !== null && data.length > 0 ? 'data' : dut.length > 0 ? 'model' : null;
  const columns = ['M', '周波数', ...traces.map(traceLabel)];

  const rows = basis === null ? [] : markers.map((marker, index) => {
    let f = marker.f;
    let point: SPoint;
    let delays: readonly (number | null)[];
    if (basis === 'data' && data !== null) {
      const at = nearest(data, marker.f);
      point = data[at] as SPoint;
      f = point.f;
      delays = traces.map((trace) => (trace.spec.format === 'delay' ? groupDelay(data, trace.spec.param)[at] ?? null : null));
    } else {
      point = sparamAt(dut, f);
      // **掃引の始めでは 0 Hz をまたがない** — 幅を f の半分で頭打ちにする
      // (1 MHz のマーカーを ±step/2 で測ると 0 Hz や負の周波数を計算して壊れた)。
      const half = Math.min(step / 2, f / 2);
      const around = [sparamAt(dut, f - half), point, sparamAt(dut, f + half)];
      delays = traces.map((trace) => (trace.spec.format === 'delay' ? groupDelay(around, trace.spec.param)[1] ?? null : null));
    }
    const cells = traces.map((trace, column) => {
      const value = valueOf(point, trace.spec.param);
      return value === null ? '—' : formatReading(trace, value, delays[column] ?? null);
    });
    return [`${index + 1}`, formatHertz(f), ...cells];
  });

  const extra = tdr.flatMap((series) => {
    const { peak, range } = series.tdr;
    if (peak === null) return [];
    const where = series.basis === 'data' ? '実測' : '理想';
    return [`${traceLabel(series.trace)} (${where}) の一番高い山: ${peak.distance.toFixed(3)} m (${(peak.t * 1e9).toFixed(2)} ns)。見える範囲 ${range.toFixed(1)} m`];
  });

  return { basis, columns, rows, extra };
}

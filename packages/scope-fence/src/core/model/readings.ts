import { formatDegrees, formatHertzReading, formatPercent, formatSeconds } from 'fence-kit';
import type { TraceName } from './channel.ts';
import { formatQuantity } from './quantity.ts';
import type { QuantityUnit } from './quantity.ts';
import { measure } from './measure.ts';
import type { MeasureName } from './measure.ts';

/**
 * 読み値 — Measurements の表とカーソルの表。**図の帯と CLI の `check` が同じ物を出す**
 * (AI は `check` の字を本文の「見るべき値」の表と数で突き合わせる。52 の docs/81 決め 16)。
 * 名前と書式は WaveForms に揃える (`Vpp 2.00 V`、`Freq 100.0 Hz`)。
 */

/** 1 本の波の点の列。`t0` は最初の点の時刻、`dt` は間隔。 */
export type Trace = {
  readonly name: TraceName;
  /** 縦の量の単位 (書かなければ V。Math だけが W や無次元になる)。 */
  readonly unit?: QuantityUnit;
  readonly samples: Float64Array;
  readonly dt: number;
  readonly t0: number;
  /** 理想 (計算) か実測 (`data:`) か。 */
  readonly basis: 'model' | 'data';
};

export type Readings = {
  /** 1 行目は見出し (`CH  Vpp  Freq`)。測る物が無ければ空。 */
  readonly measureRows: readonly (readonly string[])[];
  /** 1 行目は見出し (`  t  CH1  CH2`)、続いて X1・X2・ΔX。カーソルが無ければ空。 */
  readonly cursorRows: readonly (readonly string[])[];
  /** 値の出どころ。mixed は実測の ch と理想の ch が両方ある。 */
  readonly basis: 'model' | 'data' | 'mixed';
  /** mixed のときの理想の ch。 */
  readonly idealNames: readonly TraceName[];
};

const HEADINGS: Readonly<Record<MeasureName, string>> = {
  vpp: 'Vpp', vmax: 'Vmax', vmin: 'Vmin', avg: 'Avg', rms: 'RMS', freq: 'Freq', period: 'Period', duty: 'Duty', phase: 'Phase', rise: 'Rise',
};

const DASH = '—';

const label = (name: TraceName): string => name.toUpperCase();

function formatMeasure(name: MeasureName, value: number | null, unit: QuantityUnit | undefined): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  switch (name) {
    case 'freq':
      return formatHertzReading(value);
    case 'period':
    case 'rise':
      return formatSeconds(value);
    case 'duty':
      return formatPercent(value);
    case 'phase':
      return formatDegrees(value);
    default:
      return formatQuantity(value, unit);
  }
}

/** 時刻 t の値 (点の間は直線補間)。列の外なら null。 */
export function valueAtTime(trace: Pick<Trace, 'samples' | 'dt' | 't0'>, t: number): number | null {
  const index = (t - trace.t0) / trace.dt;
  const last = trace.samples.length - 1;
  if (!(index >= -1e-9 && index <= last + 1e-9)) return null;
  const i = Math.min(Math.max(0, Math.floor(index)), Math.max(0, last - 1));
  const a = trace.samples[i] ?? 0;
  const b = trace.samples[i + 1] ?? a;
  return a + (b - a) * Math.min(1, Math.max(0, index - i));
}

const quantity = (value: number | null, unit: QuantityUnit | undefined): string => (value === null ? DASH : formatQuantity(value, unit));

function cursorRowsOf(traces: readonly Trace[], cursors: readonly number[]): readonly (readonly string[])[] {
  const [x1, x2] = cursors;
  if (x1 === undefined) return [];
  const row = (name: string, t: number): readonly string[] => [name, formatSeconds(t), ...traces.map((trace) => quantity(valueAtTime(trace, t), trace.unit))];
  const rows = [['', 't', ...traces.map((trace) => label(trace.name))], row('X1', x1)];
  if (x2 === undefined) return rows;
  const span = x2 - x1;
  const delta = [
    'ΔX',
    span === 0 ? formatSeconds(0) : `${formatSeconds(span)} (${formatHertzReading(1 / Math.abs(span))})`,
    ...traces.map((trace) => {
      const [a, b] = [valueAtTime(trace, x1), valueAtTime(trace, x2)];
      return a === null || b === null ? DASH : formatQuantity(b - a, trace.unit);
    }),
  ];
  return [...rows, row('X2', x2), delta];
}

/** 帯の表。**phase の基準は最初の ch** (自分自身の行は `—`)。 */
export function readingsOf(input: {
  readonly traces: readonly Trace[];
  readonly cursors: readonly number[];
  readonly measures: readonly MeasureName[];
}): Readings {
  const { traces, cursors, measures } = input;
  const reference = traces[0];
  const measureRows = measures.length === 0 || traces.length === 0 ? [] : [
    ['CH', ...measures.map((name) => HEADINGS[name])],
    ...traces.map((trace) => [label(trace.name), ...measures.map((name) => (name === 'phase' && trace === reference
      ? DASH
      : formatMeasure(name, measure(name, trace.samples, trace.dt, reference?.samples), trace.unit)))]),
  ];
  const measured = traces.filter((trace) => trace.basis === 'data');
  const basis = measured.length === 0 ? 'model' : measured.length === traces.length ? 'data' : 'mixed';
  return {
    measureRows,
    cursorRows: traces.length === 0 ? [] : cursorRowsOf(traces, cursors),
    basis,
    idealNames: basis === 'mixed' ? traces.filter((trace) => trace.basis === 'model').map((trace) => trace.name) : [],
  };
}

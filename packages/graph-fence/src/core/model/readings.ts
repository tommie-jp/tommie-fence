import { isMeasured, peakOf, valueAt } from './lines.ts';
import type { LineSpec, Point } from './lines.ts';
import { formatReading } from './quantity.ts';

/**
 * 読み値 — `mark` の表と `peak` の表。**図の帯と CLI の `check` が同じ物を出す**
 * (AI は `check` の字を本文の「見るべき値」の表と数で突き合わせる。52 の docs/92 決め 10)。
 */

export type Readings = {
  /** 1 行目は見出し (x と線の名前)、続いて mark ごとに 1 行。mark が無ければ空。 */
  readonly markRows: readonly (readonly string[])[];
  /** 1 行目は見出し、続いて線ごとに頂点。peak が無ければ空。 */
  readonly peakRows: readonly (readonly string[])[];
  /** 値の出どころ。mixed は理想の線と実測の線が両方ある。 */
  readonly basis: 'model' | 'data' | 'mixed' | 'none';
};

const DASH = '—';

/** 見出しの線の名前。重ねた線は凡例の名前 (既定は実測) を添える (同じ名前の理想と並ぶため)。 */
export const columnName = (line: LineSpec, dataLabel: string): string => (isMeasured(line) ? `${line.name} (${dataLabel})` : line.name);

export function readingsOf(input: {
  readonly lines: readonly LineSpec[];
  /** 線ごとの描いた点 (peak を探す)。 */
  readonly sampled: ReadonlyMap<LineSpec, readonly Point[]>;
  readonly marks: readonly number[];
  readonly peak: boolean;
  readonly xName: string;
  readonly xUnit: string;
  readonly xLog: boolean;
  /** `data:` の凡例の名前 (既定は実測)。 */
  readonly dataLabel: string;
}): Readings {
  const { lines, marks, xUnit, xLog } = input;
  const measured = lines.some(isMeasured);
  const ideal = lines.some((line) => !isMeasured(line));
  const basis = lines.length === 0 ? 'none' : measured && ideal ? 'mixed' : measured ? 'data' : 'model';
  const markRows = marks.length === 0 || lines.length === 0
    ? []
    : [
      [input.xName, ...lines.map((line) => columnName(line, input.dataLabel))],
      ...marks.map((x) => [
        formatReading(x, xUnit),
        ...lines.map((line) => {
          const value = valueAt(line, x, xLog);
          return value === null ? DASH : formatReading(value, line.unit);
        }),
      ]),
    ];
  const peakRows = !input.peak || lines.length === 0
    ? []
    : [
      ['peak', input.xName, '値'],
      ...lines.map((line) => {
        const top = peakOf(input.sampled.get(line) ?? []);
        return [columnName(line, input.dataLabel), top === null ? DASH : formatReading(top.x, xUnit), top === null ? DASH : formatReading(top.y, line.unit)];
      }),
    ];
  return { markRows, peakRows, basis };
}

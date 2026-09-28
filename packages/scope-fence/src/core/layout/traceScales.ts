import type { TraceName } from '../model/channel.ts';
import type { QuantityUnit } from '../model/quantity.ts';
import type { Trace } from '../model/readings.ts';
import type { Scale } from '../render/trace.ts';
import type { FenceDocument } from '../types.ts';
import { autoRange } from './scales.ts';

/**
 * 線 1 本の尺度の設定 — ch と Math は同じ扱い (書いた range: / position: が先、無ければ Auto)。
 * 時間の画面は縦だけ、XY は横と縦の両方にこれを使う。
 */
export type ScaleSpec = {
  readonly name: TraceName;
  readonly range: number | null;
  readonly position: number | null;
  readonly line: number | null;
  readonly unit: QuantityUnit;
};

export function scaleSpecsOf(doc: FenceDocument): readonly ScaleSpec[] {
  const channels = doc.channels.map((channel): ScaleSpec => ({
    name: channel.name, range: channel.range, position: channel.position, line: channel.line, unit: 'V',
  }));
  const { math } = doc;
  return math === null ? channels : [...channels, { name: 'math', range: math.range, position: math.position, line: math.line, unit: math.unit }];
}

/** 線の点 (理想と実測をつないだもの) から尺度を決める。 */
export function scaleOf(traces: readonly Trace[], spec: ScaleSpec | undefined): Scale {
  const joined = Float64Array.from(traces.flatMap((trace) => [...trace.samples]));
  const auto = autoRange(joined, spec?.range ?? null);
  return { perDiv: auto.perDiv, position: spec?.position ?? auto.position };
}

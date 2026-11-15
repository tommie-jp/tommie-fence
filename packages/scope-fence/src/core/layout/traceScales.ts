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
  // 点の列をそのままつなぐ。前は 8192 点ずつを普通の配列に開いてつなぎ、数の配列に戻していた
  // (オシロの画面の時間の 14 % と、その分の GC。52 の docs/162)。値は同じ。
  const joined = new Float64Array(traces.reduce((total, trace) => total + trace.samples.length, 0));
  let offset = 0;
  for (const trace of traces) {
    joined.set(trace.samples, offset);
    offset += trace.samples.length;
  }
  const auto = autoRange(joined, spec?.range ?? null);
  return { perDiv: auto.perDiv, position: spec?.position ?? auto.position };
}

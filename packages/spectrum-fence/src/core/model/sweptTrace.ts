import type { SpectralLine } from 'fence-kit';
import { powerSum } from './level.ts';
import { lineDbm } from './receiver.ts';
import { frequenciesOf } from './sweep.ts';
import type { Point } from './trace.ts';

/**
 * 掃引型 (tinySA)。**線を受信機の RBW の山 (ガウス、−3 dB が ±RBW/2) でなぞり、フロアを
 * 電力で足す。** 点 i の値は、その点が受け持つ幅 (隣の点との中点まで) に線があれば、
 * その線の頂点の値と比べて大きい方 — 実機は点の間を細かく刻んで最大を取るので、
 * 線が点の間に落ちても山が消えない (52 の docs/86 決め 4)。
 */

/** ガウスの山の形の係数 (x = (f − f0) / RBW で −3 dB が x = ±0.5)。 */
const SHAPE = 4 * Math.LN2;
/** これより RBW で離れた線は足さない (山の裾が 10^-30 より小さい)。 */
const REACH = 5;

export type SweptInput = {
  readonly lines: readonly SpectralLine[];
  readonly start: number;
  readonly stop: number;
  readonly points: number;
  readonly rbw: number;
  /** フロア (dBm)。 */
  readonly floor: number;
};

type Power = { readonly f: number; readonly mw: number };

/** 周波数 f での読み (dBm)。 */
function levelAt(f: number, powers: readonly Power[], rbw: number, floor: number): number {
  let total = 10 ** (floor / 10);
  for (const line of powers) {
    const x = (f - line.f) / rbw;
    if (Math.abs(x) < REACH) total += line.mw * Math.exp(-SHAPE * x * x);
  }
  return powerSum([10 * Math.log10(total)]);
}

export function sweptTrace(input: SweptInput): readonly Point[] {
  const { lines, start, stop, points, rbw, floor } = input;
  const powers = lines.map((line) => ({ f: line.frequency, mw: 10 ** (lineDbm(line) / 10) }));
  const frequencies = frequenciesOf({ start, stop }, points);
  const step = (stop - start) / (points - 1);
  const trace: Point[] = frequencies.map((f) => ({ f, level: levelAt(f, powers, rbw, floor), at: f }));
  for (const line of powers) {
    const index = Math.round((line.f - start) / step);
    const here = trace[index];
    if (here === undefined) continue;
    const peak = levelAt(line.f, powers, rbw, floor);
    if (peak > here.level) trace[index] = { f: here.f, level: peak, at: line.f };
  }
  return trace;
}

import type { PanelTrace } from '../layout/panels.ts';
import type { TraceFormat } from '../types.ts';
import { ONE, abs, add, sub } from './complex.ts';
import type { Complex } from './complex.ts';
import { groupDelay, impedanceFrom, logMag, phaseDeg, swr, valueOf } from './sparams.ts';
import type { SPoint } from './sparams.ts';
import { tdrOf } from './tdr.ts';
import type { Tdr } from './tdr.ts';

/**
 * トレース 1 本ぶんの値の列。**理想 (`dut:`) と実測 (`data:`) で別の列**にして、
 * 描く側が破線と実線に描き分ける。
 */
export type Basis = 'model' | 'data';

export type RectSeries = {
  readonly kind: 'rect';
  readonly trace: PanelTrace;
  readonly basis: Basis;
  readonly points: readonly { readonly f: number; readonly value: number }[];
};

export type RoundSeries = {
  readonly kind: 'round';
  readonly trace: PanelTrace;
  readonly basis: Basis;
  readonly points: readonly { readonly f: number; readonly value: Complex }[];
};

export type TdrSeries = { readonly kind: 'tdr'; readonly trace: PanelTrace; readonly basis: Basis; readonly tdr: Tdr };

export type Series = RectSeries | RoundSeries | TdrSeries;

/** 1 点の値を形式の数に直す (dB・度・SWR・|S|・Ω)。群遅延と丸い枠と TDR は別の道。 */
export function scalarOf(format: TraceFormat, s: Complex): number | null {
  switch (format) {
    case 'logmag': return logMag(s);
    case 'phase': return phaseDeg(s);
    case 'swr': return swr(s);
    case 'linear': return abs(s);
    case 'r': return impedanceFrom(s).re;
    case 'x': return impedanceFrom(s).im;
    case 'z': return abs(impedanceFrom(s));
    default: return null;
  }
}

/** 等間隔の掃引か (TDR は逆 FFT なので等間隔が要る)。**1% のずれまで**は許す。 */
export function isEvenlySpaced(points: readonly SPoint[]): boolean {
  if (points.length < 3) return points.length === 2;
  const step = ((points.at(-1)?.f ?? 0) - (points[0]?.f ?? 0)) / (points.length - 1);
  return points.every((point, index) => Math.abs(point.f - ((points[0]?.f ?? 0) + step * index)) <= step * 0.01);
}

/** 列を作る。**描けない組 (S21 の無い 1 端子) は null**。 */
export function seriesOf(trace: PanelTrace, points: readonly SPoint[], basis: Basis): Series | null {
  const { param, format, vf } = trace.spec;
  const pairs = points.flatMap((point) => {
    const value = valueOf(point, param);
    return value === null ? [] : [{ f: point.f, value }];
  });
  if (pairs.length === 0) return null;

  if (format === 'smith' || format === 'polar') return { kind: 'round', trace, basis, points: pairs };
  if (format === 'tdr') {
    if (!isEvenlySpaced(points)) return null;
    const tdr = tdrOf(pairs.map((pair) => pair.f), pairs.map((pair) => pair.value), vf ?? 0.66);
    return tdr === null ? null : { kind: 'tdr', trace, basis, tdr };
  }
  if (format === 'delay') {
    const delays = groupDelay(points, param);
    return {
      kind: 'rect', trace, basis,
      points: points.flatMap((point, index) => {
        const delay = delays[index];
        return delay === null || delay === undefined ? [] : [{ f: point.f, value: delay * 1e9 }];
      }),
    };
  }
  return {
    kind: 'rect', trace, basis,
    points: pairs.flatMap(({ f, value }) => {
      const scalar = scalarOf(format, value);
      return scalar === null ? [] : [{ f, value: scalar }];
    }),
  };
}

/** Γ が開放 (1) か短絡 (−1) に張り付いているか。 */
export function gammaEdge(gamma: Complex): 'open' | 'short' | null {
  if (abs(sub(ONE, gamma)) < 1e-9) return 'open';
  if (abs(add(ONE, gamma)) < 1e-9) return 'short';
  return null;
}

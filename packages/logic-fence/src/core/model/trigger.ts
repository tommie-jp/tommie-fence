import { fenceError, notice, safeToken } from '../errors.ts';
import type { FenceError, TriggerSpec } from '../types.ts';
import type { BitRow } from './rows.ts';
import { secondsText } from './time.ts';
import { inWindow } from './window.ts';
import type { Window } from './window.ts';
import { LIMITS } from '../limits.ts';

/**
 * トリガの印 (T)。**書いた edge が実際にあるか**を確かめる — 波に無い時刻に印を置くと、
 * 「ここでトリガした」という図が嘘になる (instrument-screen の点検表)。
 * `at` を書けばその時刻に、書かなければ窓の中の最初の該当する edge に置く。
 */
export type TriggerMark = { readonly lane: string; readonly edge: 'rising' | 'falling'; readonly time: number };

export type Triggered = { readonly mark: TriggerMark | null; readonly said: readonly FenceError[] };

export function resolveTrigger(spec: TriggerSpec | null, lanes: readonly BitRow[], window: Window): Triggered {
  if (spec === null) return { mark: null, said: [] };
  const row = lanes.find((lane) => lane.name === spec.lane);
  if (row === undefined) {
    const names = lanes.map((lane) => lane.name);
    return {
      mark: null,
      said: [fenceError(`trigger のレーン ${safeToken(spec.lane)} がありません (1 ビットのレーン: ${names.length === 0 ? 'まだありません' : names.join(' / ')}。バスは指せません)`, spec.line, spec.lane)],
    };
  }
  const wanted = spec.edge === 'rising' ? 1 : 0;
  const slack = (window.t1 - window.t0) * 1e-9;
  const found = row.dense ? null : row.edgesIn(window.t0 - slack, window.t1, LIMITS.edges);
  if (found === null) {
    return { mark: null, said: [notice(`トリガのレーン ${safeToken(spec.lane)} は密で edge を数えていません (印を置きません)`, spec.line)] };
  }
  const edges = found.filter((edge) => edge.v === wanted);
  const label = `${safeToken(spec.lane)} の${spec.edge === 'rising' ? '立ち上がり' : '立ち下がり'}`;
  if (spec.at === null) {
    const first = edges[0];
    return first === undefined
      ? { mark: null, said: [notice(`窓の中に ${label}がありません (トリガの印を置きません)`, spec.line)] }
      : { mark: { lane: spec.lane, edge: spec.edge, time: first.t }, said: [] };
  }
  if (!inWindow(window, spec.at)) {
    return { mark: null, said: [notice(`トリガの時刻 ${secondsText(spec.at)} は窓 (${secondsText(window.t0)}〜${secondsText(window.t1)}) の外です (描いていません)`, spec.line)] };
  }
  const tolerance = Math.max(slack, (window.perDiv / 60) * 0.5);
  const near = edges.reduce<number | null>((best, edge) => (best === null || Math.abs(edge.t - spec.at!) < Math.abs(best - spec.at!) ? edge.t : best), null);
  if (near !== null && Math.abs(near - spec.at) <= tolerance) {
    return { mark: { lane: spec.lane, edge: spec.edge, time: near }, said: [] };
  }
  const hint = near === null ? '窓の中に無い' : `いちばん近いのは ${secondsText(near)}`;
  return {
    mark: { lane: spec.lane, edge: spec.edge, time: spec.at },
    said: [notice(`${label}は ${secondsText(spec.at)} にありません (${hint})。印は書いた時刻に置きました`, spec.line)],
  };
}

import { fenceError, notice, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import type { BusEntry, FenceError } from '../types.ts';
import type { BitRow, BusRow, BusSegment } from './rows.ts';
import { secondsText } from './time.ts';
import { minGapSeconds } from './window.ts';
import type { Window } from './window.ts';

/**
 * バス — 束ねたレーンの値が変わる区間。**メンバーの変わり目の和**で区切り、
 * **同時に (窓の幅の 1e-9 以内で) 変わるビットは 1 回の変化**にする (カウンターの桁上がり)。
 * 同じ値が続く区間は 1 つにつなぐ。
 */
const combine = (members: readonly BitRow[], t: number): number =>
  members.reduce((value, row) => value * 2 + row.levelAt(t), 0);

function segmentsOf(members: readonly BitRow[], window: Window): readonly BusSegment[] {
  const slack = (window.t1 - window.t0) * 1e-9;
  const times = members.flatMap((row) => (row.transitions ?? []).map((edge) => edge.t)).sort((a, b) => a - b);
  const bounds = [window.t0];
  for (const t of times) {
    // 窓の右端ちょうどの変化は画面に出ない (幅 0 の区間を作らない)。
    if (t >= window.t1 - slack) continue;
    if (t - (bounds[bounds.length - 1] ?? window.t0) > slack) bounds.push(t);
  }
  const segments: BusSegment[] = [];
  bounds.forEach((t0, index) => {
    const t1 = bounds[index + 1] ?? window.t1;
    const value = combine(members, t0);
    const last = segments[segments.length - 1];
    if (last !== undefined && last.value === value) segments[segments.length - 1] = { ...last, t1 };
    else segments.push({ t0, t1, value });
  });
  return segments;
}

export type BusBuilt = { readonly row: BusRow | null; readonly said: readonly FenceError[] };

export function buildBus(entry: BusEntry, lanes: readonly BitRow[], window: Window): BusBuilt {
  const { name, line } = entry;
  const found: BitRow[] = [];
  const said: FenceError[] = [];
  for (const member of entry.bits) {
    const row = lanes.find((lane) => lane.name === member);
    if (row === undefined) {
      const names = lanes.map((lane) => lane.name);
      said.push(fenceError(`バス ${safeToken(name)} のレーン ${safeToken(member)} がありません (${names.length === 0 ? '信号がまだ 1 本もありません' : names.join(' / ')})`, line, member));
    } else {
      found.push(row);
    }
  }
  if (found.length !== entry.bits.length) return { row: null, said };
  if (new Set(entry.bits).size !== entry.bits.length) {
    return { row: null, said: [fenceError(`バス ${safeToken(name)} に同じレーンが 2 度入っています`, line)] };
  }
  if (found.length > LIMITS.busBits) {
    return { row: null, said: [fenceError(`バスは ${LIMITS.busBits} ビットまでです (${safeToken(name)} は ${found.length} ビット)`, line, name)] };
  }
  const dense = found.some((row) => row.dense);
  const segments = dense ? null : segmentsOf(found, window);
  const gaps = segments === null ? [] : segments.slice(0, -1).map((segment) => segment.t1 - segment.t0);
  const minGap = gaps.length === 0 ? null : Math.min(...gaps);
  if (segments !== null && minGap !== null && minGap < minGapSeconds(window)) {
    said.push(notice(`バス ${safeToken(name)} に 3 px より短い値の区間があります (最短 ${secondsText(minGap)})。値の字は入りません`, line));
  }
  const row: BusRow = {
    kind: 'bus', name, line, radix: entry.radix, members: entry.bits, width: found.length,
    valueAt: (t) => combine(found, t), segments, dense, minGap,
  };
  return { row, said };
}

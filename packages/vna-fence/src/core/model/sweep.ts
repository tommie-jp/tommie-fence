import { LIMITS } from '../limits.ts';
import { DEVICES } from './device.ts';
import type { DeviceName } from './device.ts';
import { formatHertzShort, parseHertz } from './frequency.ts';

/** 掃引。**実機と同じく線形**に点を並べる。 */
export type Sweep = { readonly start: number; readonly stop: number; readonly points: number };

export const DEFAULT_POINTS = 101;

export const SWEEP_HINT = 'sweep: は「開始-終了 点数」で書きます (例: sweep: 1M-300M 101。点数を省くと 101)';

/** 機種の範囲いっぱい (sweep: を書かなかったとき)。 */
export const deviceSweep = (device: DeviceName): Sweep =>
  ({ start: DEVICES[device].min, stop: DEVICES[device].max, points: DEFAULT_POINTS });

export type SweepRead = { readonly ok: true; readonly sweep: Sweep } | { readonly ok: false; readonly reason: string };

/** `1M-300M 101`。読めなければ理由。 */
export function parseSweep(text: string): SweepRead {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || words.length > 2) return { ok: false, reason: SWEEP_HINT };
  const range = (words[0] ?? '').split('-');
  if (range.length !== 2) return { ok: false, reason: SWEEP_HINT };
  const start = parseHertz(range[0] ?? '');
  const stop = parseHertz(range[1] ?? '');
  if (start === null || stop === null) return { ok: false, reason: SWEEP_HINT };
  if (stop <= start) {
    return { ok: false, reason: `掃引の終わり (${formatHertzShort(stop)}) は始め (${formatHertzShort(start)}) より上にします` };
  }
  if (stop > LIMITS.frequencyMax) {
    return { ok: false, reason: `掃引は ${formatHertzShort(LIMITS.frequencyMax)} までです` };
  }
  const pointsText = words[1];
  const points = pointsText === undefined ? DEFAULT_POINTS : Number(pointsText);
  const { min, max } = LIMITS.points;
  if (!Number.isInteger(points) || points < min || points > max) {
    return { ok: false, reason: `点数は ${min}〜${max} の整数で書きます` };
  }
  return { ok: true, sweep: { start, stop, points } };
}

/** 掃引の周波数の列 (両端を含む)。 */
export function frequenciesOf(sweep: Sweep): readonly number[] {
  const step = (sweep.stop - sweep.start) / (sweep.points - 1);
  return Array.from({ length: sweep.points }, (_, index) =>
    (index === sweep.points - 1 ? sweep.stop : sweep.start + step * index));
}

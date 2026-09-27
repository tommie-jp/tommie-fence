import { formatHertzShort, parseHertz } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import type { Device } from './device.ts';

/**
 * 掃引 (横軸)。**vna の写し + `center:` `span:`**。実機と同じく線形。`span:` は常に幅
 * (開始-終了は `sweep:`。同じ字が計器で意味を変えない — 52 の docs/88 §1)。
 */
export type Sweep = {
  readonly start: number;
  readonly stop: number;
  /** 掃引型の点数。FFT 型は null (bin の数は samples: で決まる)。 */
  readonly points: number | null;
  /** `center:` + `span:` で書いたか (状態の行を CENTER / SPAN で出す)。 */
  readonly centered: boolean;
};

/**
 * 周波数。`100MHz` `100M` `300kHz` `0`。**接頭辞も `Hz` も無い素の数は断る**
 * (`1000` は 1 kHz か 1 GHz の書き間違いかもしれない)。0 だけは単位が要らない。
 */
export function parseFrequency(text: string): number | null {
  const trimmed = text.trim();
  if (/^0+(?:\.0+)?(?:Hz)?$/.test(trimmed)) return 0;
  if (!/(?:[kMG]|Hz)$/.test(trimmed)) return null;
  return parseHertz(trimmed);
}

export const FREQUENCY_HINT = '周波数は 100MHz / 300kHz / 960M のように単位か接頭辞を付けます';
export const SWEEP_HINT = 'sweep: は「開始-終了 点数」で書きます (例: sweep: 0-960M 450。FFT 型は点数を書かずに sweep: 0-20kHz)';

export type SweepText = { readonly start: number; readonly stop: number; readonly points: number | null };

export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string; readonly token?: string };

const fail = <T>(reason: string, token?: string): Read<T> =>
  (token === undefined ? { ok: false, reason } : { ok: false, reason, token });

/** 掃引の範囲の検査 (終わりが始めより上、上の端)。 */
function checkRange(start: number, stop: number): string | null {
  if (stop <= start) return `掃引の終わり (${formatHertzShort(stop)}) は始め (${formatHertzShort(start)}) より上にします`;
  if (stop > LIMITS.frequencyMax) return `掃引は ${formatHertzShort(LIMITS.frequencyMax)} までです`;
  return null;
}

/** `0-960M 450` / `0-20kHz`。 */
export function parseSweep(text: string): Read<SweepText> {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || words.length > 2) return fail(SWEEP_HINT);
  const range = (words[0] ?? '').split('-');
  if (range.length !== 2) return fail(SWEEP_HINT, words[0]);
  const start = parseFrequency(range[0] ?? '');
  const stop = parseFrequency(range[1] ?? '');
  if (start === null || stop === null) return fail(`${SWEEP_HINT}。${FREQUENCY_HINT}`, words[0]);
  const wrong = checkRange(start, stop);
  if (wrong !== null) return fail(wrong, words[0]);
  const pointsText = words[1];
  if (pointsText === undefined) return { ok: true, value: { start, stop, points: null } };
  const points = parsePoints(pointsText);
  return points.ok ? { ok: true, value: { start, stop, points: points.value } } : points;
}

/** 点数 (素の整数。数えた数なので単位は無い)。 */
export function parsePoints(text: string): Read<number> {
  const points = Number(text.trim());
  const { min, max } = LIMITS.points;
  if (!/^\d+$/.test(text.trim()) || points < min || points > max) return fail(`点数は ${min}〜${max} の整数で書きます`, text.trim());
  return { ok: true, value: points };
}

/** `center:` + `span:` を開始-終了に。 */
export function centered(center: number, span: number): Read<SweepText> {
  if (span === 0) return fail('span: 0 (ゼロスパン) はまだ描けません');
  const start = center - span / 2;
  if (start < 0) return fail(`center: から span: の半分を引くと 0 Hz より下になります (${formatHertzShort(start)})`);
  const wrong = checkRange(start, center + span / 2);
  return wrong === null ? { ok: true, value: { start, stop: center + span / 2, points: null } } : fail(wrong);
}

/** 機種の範囲いっぱい (sweep: を書かなかったとき)。 */
export const deviceSweep = (device: Device): SweepText => ({ start: device.range.min, stop: device.range.max, points: null });

/** 掃引が機種の範囲を外れていれば、その言い方。収まっていれば null。 */
export function rangeNotice(device: Device, start: number, stop: number): string | null {
  const { label, range } = device;
  if (stop > range.max) return `${label} は ${formatHertzShort(range.max)} までです (掃引の終わりが ${formatHertzShort(stop)})`;
  if (start < range.min) return `${label} は ${formatHertzShort(range.min)} からです (掃引の始めが ${formatHertzShort(start)})`;
  return null;
}

/**
 * 掃引型の点数を機種の選択肢に合わせる。**選択肢に無い数は一番近い選択肢に丸めて言う**
 * (実機のメニューで選べない数は描かない)。generic は選択肢を持たない。
 */
export function snapPoints(device: Device, points: number): { readonly points: number; readonly said: string | null } {
  const choices = device.points?.choices ?? [];
  if (choices.length === 0 || choices.includes(points)) return { points, said: null };
  const nearest = choices.reduce((best, one) => (Math.abs(one - points) < Math.abs(best - points) ? one : best));
  return { points: nearest, said: `${device.label} の点数は ${choices.join(' / ')} から選びます (${nearest} 点で描いています)` };
}

/** 掃引の周波数の列 (両端を含む)。 */
export function frequenciesOf(sweep: { readonly start: number; readonly stop: number }, points: number): readonly number[] {
  const step = (sweep.stop - sweep.start) / (points - 1);
  return Array.from({ length: points }, (_, index) => (index === points - 1 ? sweep.stop : sweep.start + step * index));
}

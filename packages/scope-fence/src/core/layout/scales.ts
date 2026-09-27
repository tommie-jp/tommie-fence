import { periodOf } from 'fence-kit';
import type { ChannelSpec } from '../model/channel.ts';
import { DIVISIONS, extentOf } from '../model/screen.ts';

/**
 * Auto の目盛。**実機で人が合わせる形** (52 の docs/85): V/div は Vpp が 6 目盛に入る
 * 1-2-5 の最小、0 V の基準は (max + min) / 2 に一番近い目盛の倍数。time/div は一番遅い波の
 * 2 周期が 10 目盛に入る 1-2-5。0〜2 V の方形波は 500 mV/div で 4 目盛の高さに出る。
 */
const STEPS = [1, 2, 5, 10] as const;
const FILL = 6;
const DEFAULT_TIME = 1e-3;

/** 1・2・5 × 10^k のうち raw 以上の最小。0 以下は 1。 */
export function niceStep125(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const decade = 10 ** Math.floor(Math.log10(raw));
  const mantissa = raw / decade;
  const step = STEPS.find((one) => one >= mantissa * (1 - 1e-9)) ?? 10;
  return step * decade;
}

/** V/div と 0 V の基準の位置 (目盛。中央が 0、上が正)。 */
export function autoRange(samples: ArrayLike<number>): { readonly perDiv: number; readonly position: number } {
  const extent = extentOf(samples);
  if (extent === null) return { perDiv: 1, position: 0 };
  const vpp = extent.max - extent.min;
  if (vpp === 0) {
    const value = extent.max;
    if (value === 0) return { perDiv: 1, position: 0 };
    const perDiv = niceStep125(Math.abs(value) / 3);
    return { perDiv, position: -Math.round(value / perDiv) || 0 };
  }
  const perDiv = niceStep125(vpp / FILL);
  return { perDiv, position: -Math.round((extent.max + extent.min) / 2 / perDiv) || 0 };
}

/** 一番遅い波の 2 周期が 10 目盛に入る time/div。波が無ければ 1 ms/div。 */
export function autoTimePerDiv(channels: readonly ChannelSpec[]): number {
  const periods = channels.flatMap((channel) =>
    (channel.source.kind === 'wave' ? [periodOf(channel.source.wave)] : [])).filter((one): one is number => one !== null);
  if (periods.length === 0) return DEFAULT_TIME;
  return niceStep125((2 * Math.max(...periods)) / DIVISIONS.x);
}

/** 電圧を格子の高さの割合に (0 = 下、1 = 上)。**外は縁に寄せる**。 */
export function fractionY(volts: number, perDiv: number, position: number): number {
  const fraction = (volts / perDiv + position + DIVISIONS.y / 2) / DIVISIONS.y;
  return Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0.5;
}

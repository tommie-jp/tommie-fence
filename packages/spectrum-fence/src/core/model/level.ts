import type { LevelUnit } from './device.ts';

/**
 * レベルの換算。**内側の量は dBV (電圧の rms)**、表示は dBV か dBm (50 Ω の電力)。
 * 振幅は fence-kit の `wave.ts` と同じ **peak (V)** で持つ。
 */

/** 50 Ω で 1 V rms は 20 mW = +13.01 dBm。 */
export const DBM_OVER_DBV = 10 * Math.log10(1000 / 50);

/** 描く・読む下の端。これより下は −200 に寄せる (log の −∞ を出さない)。 */
export const LEVEL_FLOOR = -200;

export const dbmFromDbv = (dbv: number): number => dbv + DBM_OVER_DBV;
export const dbvFromDbm = (dbm: number): number => dbm - DBM_OVER_DBV;

/** 正弦の peak (V) → dBV (rms)。0 以下は下の端。 */
export const dbvFromPeak = (peak: number): number =>
  (peak > 0 ? Math.max(LEVEL_FLOOR, 20 * Math.log10(peak / Math.SQRT2)) : LEVEL_FLOOR);

/** dBV → 表示の単位。 */
export const toUnit = (dbv: number, unit: LevelUnit): number => (unit === 'dBm' ? dbmFromDbv(dbv) : dbv);

/** 表示の単位 → dBV。 */
export const fromUnit = (value: number, unit: LevelUnit): number => (unit === 'dBm' ? dbvFromDbm(value) : value);

/** dB の電力の和 (`10 log10(Σ 10^(x/10))`)。空なら下の端。 */
export function powerSum(levels: readonly number[]): number {
  const total = levels.reduce((sum, level) => sum + 10 ** (level / 10), 0);
  return total > 0 ? Math.max(LEVEL_FLOOR, 10 * Math.log10(total)) : LEVEL_FLOOR;
}

/** 負の数の頭を − (U+2212) にする。**実機の画面と同じ字** (vna の読み値と同じ)。`−0.00` は出さない。 */
export const minus = (text: string): string => text.replace(/^-(?=0(?:\.0+)?(?:\s|$))/, '').replace(/^-/, '−');

/** 読み値の綴り。**小数 2 桁** (`−7.90 dBm` `−0.91 dBV`)。 */
export const formatLevel = (value: number, unit: LevelUnit): string => `${minus(value.toFixed(2))} ${unit}`;

/** 目盛の字。**末尾の 0 を落とす** (`−10` `−12.5`)。 */
export const formatTick = (value: number): string => minus(String(Math.round(value * 100) / 100));

/** 設定の綴り (`−10 dBm` `10 dB/div`)。 */
export const formatSetting = (value: number, unit: string): string => `${formatTick(value)} ${unit}`;

import { formatHertz } from 'fence-kit';
import { notice } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import type { FenceError } from '../types.ts';
import type { LevelUnit } from './device.ts';
import { LEVEL_FLOOR, formatLevel, formatSetting } from './level.ts';
import type { Point } from './trace.ts';

/**
 * 一番高い山と REF (格子の上端) の隔たり。**読みにくい設定を数で言う** — 山が上端から
 * 3 目盛以上下なら画面の下半分に潰れ、上端より上なら切れて読めない。どちらも、
 * 直すのに書く `ref:` の値まで言う (直下の CLAUDE.md の文法の方針 3)。
 */
export type Headroom = {
  /** 一番高い点 (実測があれば実測、無ければ理想)。無ければ null。 */
  readonly peak: Point | null;
  readonly ref: number;
  readonly scale: number;
  readonly unit: LevelUnit;
  /** `ref:` の行 (書いていなければ null)。 */
  readonly line: number | null;
};

/** これだけ目盛が下なら言う。 */
export const LOW_DIVISIONS = 3;
/** 勧める ref: の刻み (dB) の上限。scale: が細かければその scale で刻む。 */
const REF_STEP = 10;

const cents = (value: number): number => Math.round(value * 100) / 100;

/** 書き手が `ref:` に写す綴り (`-40dBm`。ASCII の -)。 */
const refSpelling = (value: number, unit: LevelUnit): string => `${cents(value)}${unit}`;

export function headroomNotice({ peak, ref, scale, unit, line }: Headroom): FenceError | null {
  if (peak === null || peak.level <= LEVEL_FLOOR) return null;
  const level = cents(peak.level);
  const step = Math.min(REF_STEP, scale);
  const head = `一番高い山 (${formatLevel(level, unit)}、${formatHertz(peak.at)}) は REF (${formatSetting(ref, unit)}) より`;

  if (level > ref) {
    // 山より上の一番近い刻み (山がちょうど刻みに乗るなら 1 つ上。上端に貼り付けない)。
    const top = cents(Math.floor(level / step) * step + step);
    const fix = top > LIMITS.levelRange.max
      ? `ref: の上限 ${refSpelling(LIMITS.levelRange.max, unit)} でも入りません`
      : `ref: ${refSpelling(top, unit)} なら入ります`;
    return notice(`${head}上で切れています (${fix})`, line);
  }
  const below = (ref - level) / scale;
  if (below < LOW_DIVISIONS - 1e-9) return null;
  // 10 dB/div なら山が上端から 1〜2 目盛になる値 (山を刻みに切り上げて 1 刻み上)。
  const suggested = cents(Math.ceil(level / step) * step + step);
  const after = (suggested - level) / scale;
  return notice(`${head} ${below.toFixed(1)} 目盛下です (ref: ${refSpelling(suggested, unit)} なら上端から ${after.toFixed(1)} 目盛)`, line);
}

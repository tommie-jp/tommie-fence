import { WINDOW_NAMES } from 'fence-kit';
import type { WindowName } from 'fence-kit';
import { LIMITS } from '../limits.ts';
import type { LevelUnit } from '../model/device.ts';
import type { Read } from '../model/sweep.ts';

/**
 * 値の読み。**単位は必須** (直下の CLAUDE.md の文法の方針 1)。素の数を受けるのは
 * 数えた数 (`points:` `samples:`) だけ。読めなければ理由と、受ける綴りの例を返す。
 */
const fail = <T>(reason: string, token?: string): Read<T> =>
  (token === undefined ? { ok: false, reason } : { ok: false, reason, token });

export type Level = { readonly value: number; readonly unit: LevelUnit };

const LEVEL = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(dBm|dBV)$/;
const DB = /^(\d+(?:\.\d+)?|\.\d+)\s*dB$/;

/** レベル (`-10dBm` `0dBV`)。`key` はエラー文に出すキーの名。 */
export function parseLevel(text: string, key: string): Read<Level> {
  const found = LEVEL.exec(text.trim());
  if (found === null) return fail(`${key}: は -10dBm / 0dBV のように単位を付けます`, text.trim() || undefined);
  const value = Number(found[1]);
  const { min, max } = LIMITS.levelRange;
  if (value < min || value > max) return fail(`${key}: は ${min}〜${max} の範囲で書きます`, text.trim());
  return { ok: true, value: { value, unit: found[2] as LevelUnit } };
}

/** dB の幅 (`10dB` `20dB`)。 */
export function parseDb(text: string, key: string, range: { readonly min: number; readonly max: number }): Read<number> {
  const found = DB.exec(text.trim());
  if (found === null) return fail(`${key}: は 10dB のように dB を付けます`, text.trim() || undefined);
  const value = Number(found[1]);
  if (value < range.min || value > range.max) return fail(`${key}: は ${range.min}〜${range.max} dB です`, text.trim());
  return { ok: true, value };
}

export function parseUnit(text: string): Read<LevelUnit> {
  const trimmed = text.trim();
  return trimmed === 'dBm' || trimmed === 'dBV' ? { ok: true, value: trimmed } : fail('unit: は dBm か dBV です', trimmed || undefined);
}

/** 標本の数 (2 の冪、1024〜65536)。 */
export function parseSamples(text: string): Read<number> {
  const trimmed = text.trim();
  const value = Number(trimmed);
  const { min, max } = LIMITS.samples;
  const powerOfTwo = Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
  if (!/^\d+$/.test(trimmed) || !powerOfTwo || value < min || value > max) {
    return fail(`samples: は ${min}〜${max} の 2 の冪で書きます (例: samples: 8192)`, trimmed || undefined);
  }
  return { ok: true, value };
}

export function parseWindow(text: string): Read<WindowName> {
  const trimmed = text.trim();
  return (WINDOW_NAMES as readonly string[]).includes(trimmed)
    ? { ok: true, value: trimmed as WindowName }
    : fail(`window: は ${WINDOW_NAMES.join(' / ')} のどれかです`, trimmed || undefined);
}

/** `on` / `off` (YAML 1.2 では字)。真偽値もそのまま受ける。 */
export function parseSwitch(value: unknown, key: string): Read<boolean> {
  if (typeof value === 'boolean') return { ok: true, value };
  const word = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (word === 'on') return { ok: true, value: true };
  if (word === 'off') return { ok: true, value: false };
  return fail(`${key}: は on か off で書きます`);
}

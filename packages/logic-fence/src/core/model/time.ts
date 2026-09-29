import { formatHertzReading, formatSeconds, parseHertz, parseSeconds } from 'fence-kit';

/**
 * 時間と周波数の読み書き。**単位は必須** (`1s` `500ms` `10us`)。素の数は読まずに null を返し、
 * 呼ぶ側が断る。例外は `0` だけ (どの単位でも同じ値)。負も読む (窓の左端やカーソルは 0 より左にも置ける)。
 */
export const parseTime = (text: string): number | null => parseSeconds(text);

export const TIME_HINT = '時間は 1s / 500ms / 10us / 0 のように単位を付けます';

/**
 * 周波数。`1Hz` `100kHz` `12M`。**接頭辞も `Hz` も無い素の数は断る**
 * (`1000` は 1 kHz か 1 GHz の書き間違いかもしれない。0 は不可)。
 */
export function parseFrequency(text: string): number | null {
  const trimmed = text.trim();
  if (!/(?:[kMG]|Hz)$/.test(trimmed)) return null;
  return parseHertz(trimmed);
}

export const FREQUENCY_HINT = '周波数は 1Hz / 100kHz / 12M のように単位か接頭辞を付けます';

/** 時間の読み値 (有効 4 桁)。fence-kit と同じ字。 */
export const secondsText = (seconds: number): string => formatSeconds(seconds);

/** 周波数の読み値 (有効 4 桁)。 */
export const hertzText = (hz: number): string => formatHertzReading(hz);

const UNITS: readonly (readonly [string, number])[] = [['s', 1], ['ms', 1e-3], ['µs', 1e-6], ['ns', 1e-9]];

/** 目盛 1 つぶんの時間で軸の単位を選ぶ (1 以上になる一番大きい単位)。 */
export function axisUnit(perDiv: number): readonly [string, number] {
  return UNITS.find(([, scale]) => perDiv >= scale * (1 - 1e-9)) ?? UNITS[3] ?? ['ns', 1e-9];
}

/** 軸の目盛の字 (`0` `1 s` `500 ms`)。単位は 1 つの図で揃える (`axisUnit`)。 */
export function axisLabel(seconds: number, unit: readonly [string, number]): string {
  const value = Math.round((seconds / unit[1]) * 1e6) / 1e6;
  return value === 0 ? `0 ${unit[0]}` : `${value} ${unit[0]}`;
}

import { parseWave } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';

/** 試験の波 (`square 1MHz -10dBm`)。読めなければ投げる。 */
export function wave(text: string): WaveSpec {
  const read = parseWave(text);
  if (!read.ok) throw new Error(read.reason);
  return read.value;
}

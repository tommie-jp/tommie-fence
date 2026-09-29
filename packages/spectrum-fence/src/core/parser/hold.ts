import { formatHertzShort } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import type { DeviceKind } from '../model/device.ts';
import { FREQUENCY_HINT, parseFrequency } from '../model/sweep.ts';
import type { Read } from '../model/sweep.ts';
import { parseSignalLine } from './lines.ts';

/**
 * `hold:` の 1 つ。**波は `signal:` と同じ綴り**で、周波数のところに `from..to` (`/刻み`) と
 * 書けば、その波が from から to まで動いたときの掃引を全部積む (VC を回したときの発振など)。
 * `sine 74MHz..102MHz -54.4dBm` / `sine 2402M..2480M/2M -48dBm`。
 */
export type HoldItem =
  | { readonly kind: 'wave'; readonly wave: WaveSpec; readonly assumed: readonly string[] }
  | {
    readonly kind: 'tune'; readonly wave: WaveSpec; readonly assumed: readonly string[];
    readonly from: number; readonly to: number; readonly step: number | null;
  };

const RANGE_HINT = '周波数の範囲は 74MHz..102MHz (刻みを付けるなら 74MHz..102MHz/2MHz) のように書きます';

const fail = (reason: string, token?: string): Read<HoldItem> => (token === undefined ? { ok: false, reason } : { ok: false, reason, token });

type Range = { readonly from: number; readonly to: number; readonly step: number | null };

function parseRange(word: string, kind: DeviceKind): Read<Range> {
  const [span = '', stepText, ...extra] = word.split('/');
  const ends = span.split('..');
  if (ends.length !== 2 || extra.length > 0) return { ok: false, reason: RANGE_HINT, token: word };
  const from = parseFrequency(ends[0] ?? '');
  const to = parseFrequency(ends[1] ?? '');
  if (from === null || to === null) return { ok: false, reason: `${RANGE_HINT}。${FREQUENCY_HINT}`, token: word };
  if (to <= from) return { ok: false, reason: `範囲の終わり (${formatHertzShort(to)}) は始め (${formatHertzShort(from)}) より上にします`, token: word };
  if (stepText === undefined) {
    return kind === 'fft'
      ? { ok: false, reason: 'FFT 型は位置ごとに FFT をするので、刻みを書きます (例: 1kHz..9kHz/2kHz)', token: word }
      : { ok: true, value: { from, to, step: null } };
  }
  const step = parseFrequency(stepText);
  if (step === null || step === 0) return { ok: false, reason: `刻みは 2MHz のように 0 より大きい周波数を書きます。${FREQUENCY_HINT}`, token: word };
  return { ok: true, value: { from, to, step } };
}

export function parseHoldItem(text: string, kind: DeviceKind): Read<HoldItem> {
  const words = text.trim().split(/\s+/);
  const ranged = words.filter((word) => word.includes('..'));
  const [word] = ranged;
  if (word === undefined) {
    const read = parseSignalLine(text);
    return read.ok ? { ok: true, value: { kind: 'wave', ...read.value } } : read;
  }
  if (ranged.length > 1) return fail('範囲を書けるのは 1 行に 1 つです (動かす波は 1 本)', ranged[1]);
  const range = parseRange(word, kind);
  if (!range.ok) return range;
  const read = parseSignalLine(words.map((one) => (one === word ? `${range.value.from}Hz` : one)).join(' '));
  if (!read.ok) return read;
  if (read.value.wave.frequency === null) return fail('dc は動かせません (周波数を持つ波で書きます)', word);
  return { ok: true, value: { kind: 'tune', ...read.value, ...range.value } };
}

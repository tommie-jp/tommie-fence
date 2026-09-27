import { parseWave } from 'fence-kit';
import type { WaveSpec } from 'fence-kit';
import type { MarkerSpec } from '../model/markers.ts';
import { FREQUENCY_HINT, parseFrequency } from '../model/sweep.ts';
import type { Read } from '../model/sweep.ts';

/** 波の 1 行。**操作 (`| rc`) は受けない** — 加工した波は scope の物。 */
export function parseSignalLine(text: string): Read<{ readonly wave: WaveSpec; readonly assumed: readonly string[] }> {
  if (text.includes('|')) return { ok: false, reason: 'spectrum の signal: に操作は書けません (加工した波は scope で描きます)', token: '|' };
  const read = parseWave(text);
  if (!read.ok) return { ok: false, reason: read.reason, ...(read.token === '' ? {} : { token: read.token }) };
  return { ok: true, value: { wave: read.value, assumed: read.assumed } };
}

const MARKER_HINT = 'マーカーは 100M / 30.5MHz のような周波数か peak で書きます';

/** マーカーの 1 つ。`peak` か周波数。`delta` `noise` は段 3。 */
export function parseMarker(text: string, line: number | null): Read<MarkerSpec> {
  const trimmed = text.trim();
  if (trimmed === 'peak') return { ok: true, value: { kind: 'peak', line } };
  const head = trimmed.split(/\s+/)[0] ?? '';
  if (head === 'delta' || head === 'noise') {
    return { ok: false, reason: `マーカーの ${head} はまだ書けません (この版で書けるのは周波数と peak)`, token: head };
  }
  const f = parseFrequency(trimmed);
  if (f === null) return { ok: false, reason: /^\d/.test(trimmed) ? `${MARKER_HINT}。${FREQUENCY_HINT}` : MARKER_HINT, ...(trimmed === '' ? {} : { token: trimmed }) };
  return { ok: true, value: { kind: 'f', f, line } };
}

import { linesOf, sampleWave } from 'fence-kit';
import type { SpectralLine, WaveSpec } from 'fence-kit';

/**
 * 信号 — `signal:` に並べた波の**和**。書き方は scope と同じ (fence-kit の `wave.ts`)。
 * 1 つの定義から 2 つの道が出る: 掃引型は線 (`linesOfSignal`)、FFT 型は時間の値 (`sampleSignal`)。
 */
export type Signal = readonly WaveSpec[];

export type SignalLines = { readonly lines: readonly SpectralLine[]; readonly truncated: boolean };

/**
 * 全部の波の線を、周波数の順に。**同じ周波数の線は電力で足す** (波どうしの位相は
 * 決まっていないので)。0 Hz の線だけは電圧で足す (直流は同じ向きに重なる)。
 */
export function linesOfSignal(signal: Signal, maxFrequency: number, maxLines: number): SignalLines {
  const byFrequency = new Map<number, number>();
  let dc = 0;
  let truncated = false;
  for (const spec of signal) {
    const room = maxLines - byFrequency.size;
    const read = linesOf(spec, { maxFrequency, maxLines: Math.max(0, room) });
    truncated ||= read.truncated;
    for (const line of read.lines) {
      if (line.frequency === 0) {
        dc += line.amplitude;
        continue;
      }
      const before = byFrequency.get(line.frequency) ?? 0;
      byFrequency.set(line.frequency, Math.sqrt(before ** 2 + line.amplitude ** 2));
    }
  }
  const lines = [...byFrequency].map(([frequency, amplitude]) => ({ frequency, amplitude })).sort((a, b) => a.frequency - b.frequency);
  return { lines: dc === 0 ? lines : [{ frequency: 0, amplitude: dc }, ...lines], truncated };
}

/** 時刻 t の和 (V)。 */
export const sampleSignal = (signal: Signal, t: number): number => signal.reduce((sum, spec) => sum + sampleWave(spec, t), 0);

/** 波の peak の和 (V)。FFT 型の入力の上限を見る。 */
export const peakOf = (signal: Signal): number =>
  signal.reduce((sum, spec) => sum + Math.abs(spec.amplitude) + (spec.shape === 'dc' ? 0 : Math.abs(spec.offset)), 0);

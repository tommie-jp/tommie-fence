import { describe, expect, test } from 'vitest';
import { niceSweep, spreadOf, sweepAdvice } from './advice.ts';
import type { RectSeries } from './model/series.ts';
import { renderVna } from './index.ts';

const fence = (lines: readonly string[]): string => lines.join('\n');
const notices = (source: string): readonly string[] => renderVna(source).notices.map((one) => one.message);

/** 直列 RLC (f0 ≈ 15.9 MHz、Q ≈ 10) を短絡で終える。 */
const RLC = ['dut:', '  - series R 10', '  - series L 1u', '  - series C 100p', '  - short'];
const rlc = (sweep: string, traces: readonly string[]): string =>
  fence([`sweep: ${sweep}`, ...RLC, 'traces:', ...traces.map((trace) => `  - ${trace}`), 'markers:', '  - 15.9M']);

const crowded = (messages: readonly string[]): readonly string[] => messages.filter((text) => text.includes('に集まっています'));
const still = (messages: readonly string[]): readonly string[] => messages.filter((text) => text.includes('しか動きません'));

describe('the change is crowded into a narrow part of the sweep', () => {
  test('a resonance swept 1 to 300 MHz says where to sweep instead, with the numbers', () => {
    const said = crowded(notices(rlc('1M-300M 101', ['S11 swr'])));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^S11 SWR の変化は掃引の \d+ % の幅 \(\d+\.\d{3} MHz〜\d+\.\d{3} MHz\) に集まっています \(sweep: \d+M-\d+M 101 なら形が見えます\)$/);
  });

  test('the suggested sweep reads back as a sweep that shows the resonance', () => {
    const said = crowded(notices(rlc('1M-300M 101', ['S11 swr'])))[0] ?? '';
    const suggested = /sweep: (\S+ \d+)/.exec(said)?.[1] ?? '';
    expect(crowded(notices(rlc(suggested, ['S11 swr'])))).toEqual([]);
  });

  test('keeps the number of points that was written', () => {
    expect(crowded(notices(rlc('1M-300M 201', ['S11 swr'])))[0]).toContain(' 201 なら形が見えます');
  });

  test('a sweep that already shows the resonance says nothing', () => {
    expect(crowded(notices(rlc('10M-22M 101', ['S11 logmag', 'S11 swr'])))).toEqual([]);
    expect(crowded(notices(rlc('15M-17M 101', ['S11 logmag', 'S11 swr'])))).toEqual([]);
  });

  test('traces that ask for the same sweep are said once, by name', () => {
    const dip = Array.from({ length: 101 }, (_, index) => ({ f: 1e6 + index * 1e6, value: index === 50 ? 0.5 : 0 }));
    const series = (param: 'S11' | 'S21', index: number, format: 'logmag' | 'linear'): RectSeries => ({
      kind: 'rect', basis: 'model', points: dip, trace: { index, spec: { param, format, vf: null, line: index + 1 } },
    });
    const said = sweepAdvice({
      panels: [{ kind: 'lin', series: [series('S11', 0, 'linear'), series('S21', 1, 'linear')] }],
      sweep: { start: 1e6, stop: 101e6, points: 101 },
      device: { min: 50e3, max: 1.5e9 },
    }).filter((one) => one.message.includes('に集まっています'));
    expect(said).toHaveLength(1);
    expect(said[0]?.message).toBe('S11 LINEAR・S21 LINEAR の変化は掃引の 1 % の幅 (51.000 MHz のまわり) に集まっています (sweep: 48.5M-53.5M 101 なら形が見えます)');
    expect(said[0]?.line).toBe(1);
  });

  test('Smith and TDR are not judged', () => {
    expect(crowded(notices(rlc('1M-300M 101', ['S11 smith', 'S11 polar'])))).toEqual([]);
  });

  test('a flat trace is never crowded', () => {
    expect(crowded(notices(fence(['sweep: 1M-300M 101', 'dut: series R 0', 'traces:', '  - S21 logmag'])))).toEqual([]);
  });
});

describe('the trace hardly moves on its panel', () => {
  test('S11 LOGMAG of 2.8 dB on a 10 dB scale points to swr or r / x', () => {
    // 谷は −3.5 dB、掃引の端 (10 MHz) で −0.75 dB。動く幅はその差。
    expect(still(notices(rlc('10M-22M 101', ['S11 logmag', 'S11 swr'])))).toEqual([
      'S11 LOGMAG は掃引の中で 2.8 dB しか動きません (10 dB/目盛)。反射の小さな変化は swr か r / x の枠で見えます',
    ]);
  });

  test('other panels stop at the scale', () => {
    const said = still(notices(rlc('15.5M-16.3M 101', ['S11 swr'])));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^S11 SWR は掃引の中で 0\.\d+ しか動きません \(1\/目盛\)$/);
  });

  test('a constant trace (the 0 dB of a thru) is not said', () => {
    expect(still(notices(fence(['sweep: 1M-300M 101', 'dut: series R 0', 'traces:', '  - S21 logmag', '  - S11 logmag'])))).toEqual([]);
  });

  test('the ripple of a measurement is not said when the model is flat', () => {
    const along = (value: (index: number) => number) => Array.from({ length: 11 }, (_, index) => ({ f: 1e6 * (index + 1), value: value(index) }));
    const trace = { index: 0, spec: { param: 'S21' as const, format: 'logmag' as const, vf: null, line: 3 } };
    const judge = (model: (index: number) => number) => sweepAdvice({
      panels: [{ kind: 'db', series: [
        { kind: 'rect', basis: 'model', trace, points: along(model) },
        { kind: 'rect', basis: 'data', trace, points: along((index) => -6 + (index % 2) * 0.1) },
      ] }],
      sweep: { start: 1e6, stop: 11e6, points: 11 },
      device: { min: 50e3, max: 1.5e9 },
    }).map((one) => one.message);
    expect(judge(() => -6)).toEqual([]);
    expect(judge((index) => -6 - index * 0.1)).toEqual(['S21 LOGMAG は掃引の中で 0.1 dB しか動きません (10 dB/目盛)']);
  });

  test('a trace that moves a division or more is not said', () => {
    expect(still(notices(rlc('10M-22M 101', ['S11 swr', 'S11 phase'])))).toEqual([]);
  });

  test('a |Z| on the log scale is not judged', () => {
    expect(still(notices(rlc('15.8M-16M 101', ['S11 z'])))).toEqual([]);
  });

  test('the same input says the same thing', () => {
    const source = rlc('1M-300M 101', ['S11 logmag', 'S11 swr']);
    expect(notices(source)).toEqual(notices(source));
  });
});

describe('spreadOf', () => {
  const points = (values: readonly number[]) => values.map((value, index) => ({ f: index, value }));

  test('finds the run of points far from the median, and the extreme', () => {
    const spread = spreadOf(points([0, 0, 0, 0, 0, 0, 0, 5, 9, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(spread).toEqual({ from: 7, to: 9, center: 8, height: 9 });
  });

  test('a flat or empty series has no spread', () => {
    expect(spreadOf(points([2, 2, 2]))).toBeNull();
    expect(spreadOf([])).toBeNull();
  });
});

describe('niceSweep', () => {
  const device = { min: 50e3, max: 1.5e9 };

  test('rounds the ends onto a 1-2-5 grid around the centre', () => {
    expect(niceSweep(15.9e6, 8e6, device)).toEqual({ start: 12e6, stop: 20e6 });
  });

  test('stays inside the device', () => {
    expect(niceSweep(15.9e6, 45e6, device)).toEqual({ start: 5e6, stop: 40e6 });
    expect(niceSweep(100e3, 200e3, { min: 50e3, max: 1.5e9 })).toEqual({ start: 50e3, stop: 200e3 });
    expect(niceSweep(1.49e9, 100e6, device)).toEqual({ start: 1.44e9, stop: 1.5e9 });
  });
});

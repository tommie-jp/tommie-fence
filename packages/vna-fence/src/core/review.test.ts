import { describe, expect, test } from 'vitest';
import { renderVna } from './index.ts';
import { logOhmAxis } from './layout/scales.ts';
import { complex } from './model/complex.ts';
import { sparamAt } from './model/dut.ts';
import { logMag } from './model/sparams.ts';
import { parseTouchstone } from './model/touchstone.ts';
import { mixPhase, valueAt, visibleRange } from './render/panel.ts';
import type { TdrSeries } from './model/series.ts';

/** レビュー (2026-09-25) で見つかった 9 件の、それぞれの再現。 */
describe('review findings', () => {
  test('the delay reading near the start of the sweep does not cross 0 Hz', () => {
    const result = renderVna('sweep: 1M-1G 401\ndut: series C 10p\ntraces:\n  - S21 delay\nmarkers:\n  - 1M');
    // τ / (1 + (ωτ)²) ≈ 1.000 ns (τ = 100 Ω × 10 pF)
    expect(result.readings.rows[0]?.[2]).toBe('1.000 ns');
  });

  test('the TDR axis stops at twice the farthest reflection, not at the wrapped tail', () => {
    const result = renderVna('sweep: 1M-900M 401\ndut:\n  - series R 25\n  - line 50 2m vf 0.66\n  - open\ntraces:\n  - S11 tdr vf 0.66');
    // 25 Ω の不整合でケーブルの中を往復する山 (4 m・6 m…) まで入る。範囲 (44 m) いっぱいにはしない。
    expect(result.svg).toContain('>10 m<');
    expect(result.svg).not.toContain('44.02 m');
  });

  test('a 0 Ω shunt is a short to ground: S11 = −1, S21 ≈ 0', () => {
    const point = sparamAt([{ kind: 'lumped', place: 'shunt', part: 'R', value: 0, esr: 0, esl: 0, cp: 0, line: null }], 50e6);
    expect(point.s11?.re).toBeCloseTo(-1, 9);
    expect(logMag(point.s21 ?? complex(1))).toBeLessThan(-200 + 1);
    const drawn = renderVna('sweep: 1M-100M\ndut: shunt R 0\nmarkers:\n  - 50M');
    expect(drawn.readings.rows[0]?.[4]).toBe('短絡');
  });

  test('a 2-port file with noise parameters reads the S part and stops', () => {
    const text = ['# GHZ S MA R 50', '1 0.5 0 0.5 0 0.5 0 0.5 0', '2 0.5 0 0.5 0 0.5 0 0.5 0', '1 1.2 0.3 45 0.2', '2 1.4 0.3 50 0.2'].join('\n');
    const read = parseTouchstone(text, 2);
    expect(read.ok && read.value.points).toHaveLength(2);
  });

  test('a phase marker across the ±180° wrap lands at ±180°, not at 0°', () => {
    expect(Math.abs(mixPhase(170, -170, 0.5))).toBeCloseTo(180, 9);
    expect(mixPhase(-170, 170, 0.25)).toBeCloseTo(-175, 9);
    expect(mixPhase(10, 20, 0.5)).toBeCloseTo(15, 9);
  });

  test('a snapped marker is drawn at the point it snapped to', () => {
    const points = [{ f: 1, value: 1 }, { f: 10, value: 2 }];
    expect(valueAt(points, 80, true, (a) => a)).toEqual({ f: 10, value: 2 });
    expect(valueAt(points, 5.5, false, (a, b, t) => a + (b - a) * t)).toEqual({ f: 5.5, value: 1.5 });
  });

  test('|Z| of an open alone keeps the log axis within 100 MΩ', () => {
    expect(logOhmAxis([1e9, 1e9]).max).toBeLessThanOrEqual(8);
  });

  test('visibleRange falls back to the whole range when nothing stands out', () => {
    const flat: TdrSeries = {
      kind: 'tdr', basis: 'model', trace: { index: 0, spec: { param: 'S11', format: 'tdr', vf: 0.66, line: null } },
      tdr: { points: [{ t: 0, distance: 0, value: 0 }], range: 10, peak: { t: 0, distance: 0, value: 0 } },
    };
    expect(visibleRange([flat])).toBe(10);
  });
});

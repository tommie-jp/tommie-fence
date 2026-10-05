import { describe, expect, test } from 'vitest';
import { renderVna } from './index.ts';
import { fraction, scaledAxis, tickLabel } from './layout/scales.ts';
import { parseTraceLine } from './parser/traces.ts';

const fence = (lines: readonly string[]): string => lines.join('\n');
const scaleOf = (text: string): number | null | undefined => {
  const read = parseTraceLine(text);
  return read.ok ? read.value.scale : undefined;
};

/** 3 次のローパス (S21 は 0 dB から下がる)。 */
const LOWPASS = ['dut:', '  - shunt C 47p', '  - series L 235n', '  - shunt C 47p'];
const drawn = (sweep: string, traces: readonly string[]) =>
  renderVna(fence([`sweep: ${sweep}`, ...LOWPASS, 'traces:', ...traces.map((trace) => `  - ${trace}`)]));
const labelsOf = (svg: string): string[] => (svg.match(/<text[^>]*text-anchor="end"[^>]*>[^<]*/g) ?? []).map((text) => text.replace(/<[^>]*>/, ''));

describe('reading a vertical scale on a trace line', () => {
  test.each([
    ['S21 logmag 1dB', 1],
    ['S21 logmag 0.5dB', 0.5],
    ['S21 phase 5deg', 5],
    ['S21 delay 1ns', 1],
    ['S21 delay 500ps', 0.5],
    ['S11 linear 0.1', 0.1],
    ['S11 swr 0.5', 0.5],
  ])('reads %s as %d per division', (text, scale) => {
    expect(scaleOf(text)).toBe(scale);
  });

  test('a trace without a scale keeps the default (null)', () => {
    expect(scaleOf('S21 logmag')).toBeNull();
  });

  test.each([
    ['S21 logmag 1', '単位つき'],
    ['S21 phase 5', '単位つき'],
    ['S21 delay 1', '単位つき'],
    ['S21 logmag 1dB/div', '/div は付けません'],
    ['S21 phase 5deg/div', 'S21 phase 5deg'],
    ['S11 swr 0.5/div', 'S11 swr 0.5'],
    ['S21 logmag 0dB', '0 より大きく'],
    ['S21 logmag 1deg', 'S21 logmag 1dB'],
    ['S11 linear 0.1dB', 'S11 linear 0.1'],
    ['S11 smith 1', '縦の尺度を書けるのは'],
    ['S11 r 10', '縦の尺度を書けるのは'],
  ])('refuses %s', (text, said) => {
    const read = parseTraceLine(text);
    expect(!read.ok && read.error.message).toContain(said);
  });

  test('two scales for one panel are refused', () => {
    const result = drawn('1M-200M 101', ['S21 logmag 1dB', 'S11 logmag 2dB']);
    expect(result.errors.map((one) => one.message).join('\n')).toContain('同じ枠');
  });
});

describe('the axis of a written scale', () => {
  test('logmag keeps 0 dB at the top, 8 divisions down', () => {
    const axis = scaledAxis('db', 1);
    expect([axis.min, axis.max]).toEqual([-8, 0]);
  });

  test('phase is centred on 0 degrees, plus and minus 4 divisions', () => {
    expect([scaledAxis('deg', 5).min, scaledAxis('deg', 5).max]).toEqual([-20, 20]);
  });

  test('delay and linear start at 0, swr at 1', () => {
    expect(scaledAxis('ns', 1).max).toBe(8);
    expect(scaledAxis('lin', 0.1).max).toBeCloseTo(0.8);
    expect([scaledAxis('swr', 0.5).min, scaledAxis('swr', 0.5).max]).toEqual([1, 5]);
  });

  test('tick labels follow the step', () => {
    expect(tickLabel(-0.5, scaledAxis('db', 0.5), '')).toBe('−0.5');
  });
});

describe('drawing with a written scale', () => {
  test('the axis numbers change and the heading names the scale', () => {
    const plain = drawn('1M-30M 101', ['S21 logmag']).svg;
    const scaled = drawn('1M-30M 101', ['S21 logmag 1dB']).svg;
    expect(plain).toContain('10 dB/目盛');
    expect(scaled).toContain('1 dB/目盛');
    expect(labelsOf(scaled)).toContain('−8');
    expect(labelsOf(plain)).toContain('−80');
  });

  test('a trace without a scale draws as before', () => {
    const a = renderVna(fence(['sweep: 1M-200M 201', ...LOWPASS, 'traces:', '  - S21 logmag'])).svg;
    const b = renderVna(fence(['sweep: 1M-200M 201', ...LOWPASS, 'traces:', '  - S21 logmag'])).svg;
    expect(a).toBe(b);
    expect(a).toContain('10 dB/目盛');
  });

  test('phase and delay name their scales too', () => {
    const svg = drawn('1M-30M 101', ['S21 phase 5deg', 'S21 delay 1ns']).svg;
    expect(svg).toContain('5°/目盛');
    expect(svg).toContain('1 ns/目盛');
  });

  test('the same scale applies to a measured overlay', () => {
    const touchstone = ['# MHz S RI R 50', '1 0.0 0.0 0.99 -0.01 0.99 -0.01 0.0 0.0', '30 0.0 0.0 0.9 -0.1 0.9 -0.1 0.0 0.0'].join('\n');
    const svg = renderVna(
      fence(['sweep: 1M-30M 101', ...LOWPASS, 'data: a.s2p', 'traces:', '  - S21 logmag 1dB']),
      { data: (name) => (name === 'a.s2p' ? touchstone : null) },
    ).svg;
    expect(svg).toContain('1 dB/目盛');
  });
});

describe('notices with a written scale', () => {
  const said = (messages: readonly { readonly message: string }[]): string[] => messages.map((one) => one.message);

  test('the almost flat S21 is said on the default scale', () => {
    const result = drawn('1M-30M 101', ['S21 logmag']);
    expect(said(result.notices).some((text) => text.includes('しか動きません'))).toBe(true);
  });

  test('a written scale silences the "hardly moves" notice', () => {
    const result = drawn('1M-30M 101', ['S21 logmag 1dB', 'S21 phase 5deg']);
    expect(said(result.notices).some((text) => text.includes('しか動きません'))).toBe(false);
  });

  test('a fall beyond the 8 divisions says a scale that fits', () => {
    const result = drawn('1M-200M 101', ['S21 logmag 1dB']);
    const out = said(result.notices).filter((text) => text.includes('範囲の外'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^S21 LOGMAG は 1 dB\/目盛 の尺度では範囲の外です \(最小 −\d+(\.\d+)? dB は下端 −8 dB \(8 目盛\) の外。\d+ dB\/目盛 なら収まります\)$/);
  });

  test('a scale that fits says nothing', () => {
    const result = drawn('1M-30M 101', ['S21 logmag 1dB']);
    expect(said(result.notices).filter((text) => text.includes('範囲の外'))).toEqual([]);
  });

  test('a rise above 0 dB cannot be fixed by the scale, so no scale is advised', () => {
    const result = renderVna(fence(['sweep: 1M-30M 101', 'dut: series R 0', 'traces:', '  - S21 logmag 1dB']));
    expect(said(result.notices)).toEqual([]);
  });
});

describe('the centre of a phase scale (at)', () => {
  const centerOf = (text: string): number | null | undefined => {
    const read = parseTraceLine(text);
    return read.ok ? read.value.center : undefined;
  };
  const said = (messages: readonly { readonly message: string }[]): string[] => messages.map((one) => one.message);
  const SERIES_C = ['dut: - series C 0.5p'];
  const seriesC = (traces: readonly string[], sweep = '1M-300M 101') =>
    renderVna(fence([`sweep: ${sweep}`, 'dut:', '  - series C 0.5p', 'traces:', ...traces.map((trace) => `  - ${trace}`)]));

  test.each([
    ['S21 phase 1deg at 90deg', 90],
    ['S21 phase 1deg at -90deg', -90],
    ['S21 phase 1deg at −90deg', -90],
    ['S21 phase 1deg at 90°', 90],
    ['S21 phase 5deg at 0deg', 0],
  ])('reads %s', (text, center) => {
    expect(centerOf(text)).toBe(center);
    expect(scaleOf(text)).not.toBeNull();
  });

  test('a trace without at keeps the default (null)', () => {
    expect(centerOf('S21 phase 5deg')).toBeNull();
  });

  test.each([
    ['S21 phase at 90deg', 'at の前に尺度'],
    ['S21 logmag 1dB at 90deg', 'phase の尺度の後ろだけ'],
    ['S21 delay 1ns at 90deg', 'S21 phase 1deg at 90deg'],
    ['S11 swr 0.5 at 2', 'phase の尺度の後ろだけ'],
    ['S11 smith at 90deg', 'phase の尺度の後ろだけ'],
    ['S21 phase 1deg at 90', '単位つき'],
    ['S21 phase 1deg at', '単位つき'],
    ['S21 phase 1deg at 90 deg', '1 語'],
    ['S21 phase 1deg at 181deg', '−180°〜180°'],
    ['S21 phase 1deg at -200deg', '−180°〜180°'],
  ])('refuses %s', (text, said) => {
    const read = parseTraceLine(text);
    expect(!read.ok && read.error.message).toContain(said);
  });

  test('the axis is centred and the labels are the real values', () => {
    const axis = scaledAxis('deg', 1, 90);
    expect([axis.min, axis.max]).toEqual([86, 94]);
    const svg = seriesC(['S21 phase 1deg at 90deg']).svg;
    expect(labelsOf(svg)).toEqual(expect.arrayContaining(['86', '90', '94']));
    expect(svg).toContain('1°/目盛 (中心 90°)');
  });

  test('a negative centre uses the minus sign', () => {
    const svg = seriesC(['S21 phase 5deg at -90deg']).svg;
    expect(svg).toContain('5°/目盛 (中心 −90°)');
    expect(labelsOf(svg)).toContain('−110');
  });

  test('without at the axis is drawn as before', () => {
    const svg = seriesC(['S21 phase 5deg']).svg;
    expect(svg).toContain('5°/目盛');
    expect(svg).not.toContain('中心');
    expect(labelsOf(svg)).toContain('−20');
  });

  test('a series C fits when the centre follows it', () => {
    const result = seriesC(['S21 phase 5deg at 90deg']);
    expect(said(result.notices).filter((text) => text.includes('範囲'))).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('out-of-range is judged around the centre and keeps it', () => {
    const result = seriesC(['S21 phase 1deg at 0deg']);
    const out = said(result.notices).filter((text) => text.includes('範囲の外'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/中心 0°\) の尺度では範囲の外です \(最大 \d+(\.\d+)?° は上端 4° \(8 目盛\) の外。\d+(\.\d+)?°\/目盛 なら収まります\)$/);
  });

  test('a centre far from the values says a scale that reaches them', () => {
    const result = seriesC(['S21 phase 1deg at 45deg']);
    const out = said(result.notices).filter((text) => text.includes('範囲の外'));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('中心 45°');
    expect(out[0]).toMatch(/\d+°\/目盛 なら収まります/);
  });

  test('a range across 180 degrees says so and wraps the labels', () => {
    const result = seriesC(['S21 phase 5deg at 170deg']);
    expect(said(result.notices).some((text) => text.includes('±180° をまたぎます'))).toBe(true);
    expect(labelsOf(result.svg)).toEqual(expect.arrayContaining(['150', '170', '−170']));
  });

  test('a range inside ±180 degrees says nothing about wrapping', () => {
    const result = seriesC(['S21 phase 5deg at 90deg']);
    expect(said(result.notices).some((text) => text.includes('をまたぎます'))).toBe(false);
  });

  test('a value past 180 degrees is folded to the other end', () => {
    const axis = scaledAxis('deg', 5, 170);
    expect(fraction(axis, -175)).toBeCloseTo(0.875);
    expect(fraction(axis, 170)).toBeCloseTo(0.5);
  });

  test('two traces in one panel with different centres are refused', () => {
    const result = seriesC(['S21 phase 5deg at 90deg', 'S11 phase 5deg at 0deg']);
    expect(said(result.errors).join('\n')).toContain('同じ枠');
  });

  test('one centre is used for the whole panel', () => {
    const result = seriesC(['S11 phase 5deg', 'S21 phase 5deg at 90deg']);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('中心 90°');
  });

  test('a measured overlay uses the same centre', () => {
    const touchstone = ['# MHz S RI R 50', '1 0.0 0.0 0.0 1.0 0.0 1.0 0.0 0.0', '30 0.0 0.0 0.0 1.0 0.0 1.0 0.0 0.0'].join('\n');
    const svg = renderVna(
      fence(['sweep: 1M-30M 101', ...SERIES_C, 'data: a.s2p', 'traces:', '  - S21 phase 5deg at 90deg']),
      { data: (name) => (name === 'a.s2p' ? touchstone : null) },
    ).svg;
    expect(svg).toContain('中心 90°');
  });
});

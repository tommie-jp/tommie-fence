import { describe, expect, test } from 'vitest';
import { renderGraph } from './index.ts';
import { linearAxis, logAxis, tickLabel } from './layout/axis.ts';
import { parseCsv } from './model/csv.ts';
import { matchColumns } from './model/data.ts';
import type { LineSpec } from './model/lines.ts';
import { formatReading, withPrefix } from './model/quantity.ts';

/** 2026-09-28 のコードの見直しで見つかった物の回帰試験 (52 の docs/96 の実装の記録)。 */

const said = (source: string): string => {
  const result = renderGraph(source);
  return [...result.errors, ...result.notices].map((one) => one.message).join('\n');
};

describe('見直しで直した物', () => {
  test('a line in ° takes a note in ° (both are deg)', () => {
    const result = renderGraph('x: f Hz 0..10\nlines:\n  位相 °: -x*9\nnotes:\n  - level -45°\n  - text 5 -45°: ここ');
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('ここ');
  });

  test('drops points at x ≤ 0 on a log x axis instead of printing NaN', () => {
    const result = renderGraph('x: f Hz log\nlines:\n  a V:\n    - 0 1\n    - 10 2\n    - 100 3\nnotes:\n  - mark 50');
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(result.readingLines.join('\n')).not.toContain('NaN');
    expect(said('x: f Hz log\nlines:\n  a V:\n    - 0 1\n    - 10 2')).toContain('x ≤ 0 の点 (1 点)');
  });

  test('labels the ends of a one-decade log axis whose unit has a prefix', () => {
    const axis = logAxis([], [2, 8]);
    expect(tickLabel(2, axis, 'mA')).toBe('2');
    expect(tickLabel(8, axis, 'mA')).toBe('8');
    expect(tickLabel(1e-3, logAxis([], [1e-6, 1]), 'mA')).toBe('10⁻³');
  });

  test('matches a column to a line only by the same name, and one column per line', () => {
    const line = (name: string, index: number): LineSpec => ({ name, unit: 'dB', source: { kind: 'points', points: [] }, index, line: null });
    const column = (name: string) => ({ name, unit: 'dB', points: [{ x: 1, y: 1 }] });
    const two = matchColumns([column('Channel 2 Magnitude')], [line('A', 0), line('B', 1)], '');
    expect(two.lines[0]?.index).toBe(2);
    expect(two.said[0]).toContain('新しい線');
    const once = matchColumns([column('gain1'), column('gain2')], [line('gain', 0)], '');
    expect(once.lines.map((one) => one.index)).toEqual([0, 1]);
    expect(matchColumns([column(' b ')], [line('A', 0), line('B', 1)], '').lines[0]?.index).toBe(1);
  });

  test('widens an x axis that has a single value', () => {
    const result = renderGraph('x: f Hz\nlines:\n  a V:\n    - 5 1\nnotes:\n  - mark 5');
    expect(result.errors).toEqual([]);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(result.readingLines.join('\n')).toContain('5.00 Hz');
  });

  test('writes the ticks of one linear axis in one style', () => {
    const axis = linearAxis([], [2000, 32000], 'Hz', false);
    expect(axis.ticks.map((tick) => tickLabel(tick.value, axis))).toEqual(axis.ticks.map((tick) => `${tick.value / 1000}k`));
  });

  test('puts a note with a prefixed unit on the panel of the plain unit', () => {
    const result = renderGraph('x: t s 0..1\nlines:\n  a V: x\nnotes:\n  - level 500mV');
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('0.500 V');
  });

  test('puts no prefix on dB or degrees, and picks the prefix after rounding', () => {
    expect(formatReading(2000, 'dB')).toBe('2000 dB');
    expect(formatReading(-100, 'deg')).toBe('−100°');
    expect(withPrefix(999.99)).toBe('1.00k');
    expect(formatReading(999.99, 'Hz')).toBe('1.00 kHz');
  });

  test('reads a heading of only e letters as a heading', () => {
    const read = parseCsv('e,E\n1,2\n', 'Hz');
    expect(read.ok && read.columns[0]?.name).toBe('E');
  });

  test('thins a measured column to 1001 points and says so (security review)', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => `${index + 1},1`).join('\n');
    const result = renderGraph('x: t s\ndata: m.csv', { data: () => `t (s),a (V)\n${rows}\n` });
    expect((result.svg.match(/<circle/g) ?? []).length).toBeLessThanOrEqual(1001 + 1);
    expect(result.notices.map((one) => one.message).join('\n')).toContain('1001 点に間引いて');
  });

  test('drops bidi and zero-width characters from what it prints (security review)', () => {
    const { svg } = renderGraph('title: safe\u202eevil\u202c name\nx: 周\u200b波数 Hz 0..1\nlines:\n  a\u202e V: x\nnotes:\n  - text 0.5 0.5V: x\u2066y');
    expect(svg).not.toMatch(/[\u202a-\u202e\u200b-\u200f\u2060-\u2069\ufeff]/u);
    expect(svg).toContain('safeevil name');
  });
});

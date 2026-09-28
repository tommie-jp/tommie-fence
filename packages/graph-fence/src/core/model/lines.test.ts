import { describe, expect, test } from 'vitest';
import { parseExpr } from './expr.ts';
import { peakOf, sampleLine, valueAt } from './lines.ts';
import type { LineSpec } from './lines.ts';

const exprLine = (text: string): LineSpec => {
  const read = parseExpr(text);
  if (!read.ok) throw new Error(read.reason);
  return { name: 'f', unit: 'mA', source: { kind: 'expr', expr: read.expr, text }, index: 0, line: null };
};

const points = [{ x: 15000, y: 14.4 }, { x: 15900, y: 17.6 }, { x: 17000, y: 13.9 }];
const pointLine: LineSpec = { name: 'p', unit: 'mA', source: { kind: 'points', points }, index: 0, line: null };
const dataLine: LineSpec = { name: 'd', unit: 'mA', source: { kind: 'data', points, column: 'd' }, index: 0, line: null };

describe('sampleLine', () => {
  test('samples an expression evenly, in log x on a log axis', () => {
    const run = sampleLine(exprLine('x'), { min: 100, max: 100000, log: true });
    expect(run).toHaveLength(512);
    expect(run[0]?.x).toBeCloseTo(100);
    expect(run[511]?.x).toBeCloseTo(100000);
    expect(run[255]?.x).toBeCloseTo(10 ** (2 + 3 * (255 / 511)), 3);
  });

  test('drops values it cannot draw', () => {
    expect(sampleLine(exprLine('log10(x)'), { min: -1, max: 1, log: false }).every((point) => Number.isFinite(point.y))).toBe(true);
    expect(sampleLine(exprLine('1/0'), { min: 0, max: 1, log: false })).toEqual([]);
  });

  test('keeps written points as they are', () => {
    expect(sampleLine(pointLine, { min: 0, max: 1, log: false })).toEqual(points);
  });
});

describe('valueAt', () => {
  test('computes an expression at x', () => {
    expect(valueAt(exprLine('2*x'), 3, false)).toBe(6);
    expect(valueAt(exprLine('1/0'), 3, false)).toBeNull();
  });

  test('interpolates written points, in log x on a log axis', () => {
    expect(valueAt(pointLine, 15900, true)).toBeCloseTo(17.6);
    const t = (Math.log10(16000) - Math.log10(15900)) / (Math.log10(17000) - Math.log10(15900));
    expect(valueAt(pointLine, 16000, true)).toBeCloseTo(17.6 + t * (13.9 - 17.6));
    expect(valueAt(pointLine, 16450, false)).toBeCloseTo((17.6 + 13.9) / 2);
    expect(valueAt(pointLine, 17000, false)).toBeCloseTo(13.9);
  });

  test('takes the nearest measured point and nothing outside', () => {
    expect(valueAt(dataLine, 15800, false)).toBe(17.6);
    expect(valueAt(dataLine, 10000, false)).toBeNull();
    expect(valueAt(pointLine, 20000, false)).toBeNull();
  });
});

describe('peakOf', () => {
  test('finds the highest point', () => {
    expect(peakOf(points)).toEqual({ x: 15900, y: 17.6 });
    expect(peakOf([])).toBeNull();
  });
});

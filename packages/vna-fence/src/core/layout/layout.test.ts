import { describe, expect, test } from 'vitest';
import { DEFAULT_TRACES } from '../parser/parseFence.ts';
import type { TraceSpec } from '../types.ts';
import { SIZE, groupPanels, placePanels } from './panels.ts';
import { dbAxis, degAxis, fraction, linAxis, logOhmAxis, niceAxis, ohmAxis, siLabel, swrAxis, tickLabel } from './scales.ts';

const trace = (param: 'S11' | 'S21', format: TraceSpec['format']): TraceSpec => ({ param, format, vf: null, line: null });

describe('groupPanels', () => {
  test('puts traces of the same unit in one panel, in the order written', () => {
    const groups = groupPanels(DEFAULT_TRACES);
    expect(groups.map((group) => group.kind)).toEqual(['db', 'smith']);
    expect(groups[0]?.traces.map((one) => one.index)).toEqual([0, 1]);
  });

  test('R, X and |Z| share the ohm panel', () => {
    expect(groupPanels([trace('S11', 'r'), trace('S11', 'x'), trace('S11', 'z')]).map((group) => group.kind)).toEqual(['ohm']);
  });
});

describe('placePanels', () => {
  test('wraps to a new row past the row width', () => {
    const groups = groupPanels([trace('S21', 'logmag'), trace('S11', 'smith'), trace('S21', 'phase')]);
    const placed = placePanels(groups, 14, 50);
    expect(placed.panels[0]?.box.y).toBe(50);
    expect(placed.panels[2]?.box.y).toBeGreaterThan(50);
    expect(placed.panels[2]?.box.x).toBe(14);
    expect(placed.width).toBeLessThanOrEqual(SIZE.maxRow);
  });

  test('nothing to place is nothing high', () => {
    expect(placePanels([], 0, 0).height).toBe(0);
  });
});

describe('axes', () => {
  test('dB: 0 at the top, 10 dB a division', () => {
    expect(dbAxis([-6, -40])).toMatchObject({ min: -80, max: 0 });
    expect(dbAxis([12])).toMatchObject({ min: -60, max: 20 });
    expect(dbAxis([500])).toMatchObject({ max: 80 });
  });

  test('phase, linear, SWR', () => {
    expect(degAxis()).toMatchObject({ min: -180, max: 180 });
    expect(linAxis()).toMatchObject({ min: 0, max: 1 });
    expect(swrAxis([1.5]).max).toBe(2);
    expect(swrAxis([2.5]).max).toBe(3);
    expect(swrAxis([4]).max).toBe(5);
    expect(swrAxis([80]).max).toBe(9);
  });

  test('a nice axis covers the values in 8 divisions', () => {
    const axis = niceAxis([0.3, 7.7], false, [0, 1]);
    expect(axis.min).toBeLessThanOrEqual(0.3);
    expect(axis.max).toBeGreaterThanOrEqual(7.7);
    expect(axis.ticks).toHaveLength(9);
    expect(niceAxis([], true, [0, 5]).max).toBeGreaterThanOrEqual(5);
    expect(niceAxis([3, 3], false, [0, 1]).max).toBeGreaterThan(3);
  });

  test('ohms follow the middle of the values, not a spike', () => {
    const values = [...Array.from({ length: 98 }, (_, index) => index), 1e9, -1e9];
    const axis = ohmAxis(values);
    expect(axis.max).toBeLessThan(200);
    expect(ohmAxis([]).max).toBeGreaterThanOrEqual(100);
  });

  test('|Z| alone is logarithmic, in decades', () => {
    const axis = logOhmAxis([0.5, 20000]);
    expect(axis.log).toBe(true);
    expect(axis.min).toBe(-1);
    expect(axis.max).toBe(5);
    expect(logOhmAxis([]).max - logOhmAxis([]).min).toBeGreaterThanOrEqual(2);
    expect(logOhmAxis([1e-3, 1e12]).max - logOhmAxis([1e-3, 1e12]).min).toBeLessThanOrEqual(8);
  });

  test('fraction clamps to the frame', () => {
    const axis = linAxis();
    expect(fraction(axis, 2)).toBe(1);
    expect(fraction(axis, -1)).toBe(0);
    expect(fraction(logOhmAxis([1, 1000]), 10)).toBeCloseTo(1 / 3, 9);
  });

  test('tick labels use the true minus sign and SI prefixes on log axes', () => {
    expect(tickLabel(-10, dbAxis([]), '')).toBe('−10');
    expect(tickLabel(3, logOhmAxis([1, 1e4]), 'Ω')).toBe('1kΩ');
    expect(tickLabel(0.125, linAxis(), '')).toBe('0.125');
    expect(siLabel(2e6, 'Ω')).toBe('2MΩ');
  });
});

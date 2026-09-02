import { describe, expect, test } from 'vitest';
import { axisLabel } from './labels.ts';

describe('axisLabel', () => {
  test('writes letters the way a spreadsheet counts, so 27 reads as aa', () => {
    expect(axisLabel(1, 'alpha', 'lower')).toBe('a');
    expect(axisLabel(27, 'alpha', 'lower')).toBe('aa');
  });

  test('writes letters in capitals by default, the way the boards are printed', () => {
    expect(axisLabel(2, 'alpha', 'upper')).toBe('B');
    expect(axisLabel(27, 'alpha', 'upper')).toBe('AA');
  });

  test('writes numbers when the axis was asked for numbers', () => {
    expect(axisLabel(3, 'numeric', 'upper')).toBe('3');
    expect(axisLabel(30, 'numeric', 'lower')).toBe('30');
  });
});

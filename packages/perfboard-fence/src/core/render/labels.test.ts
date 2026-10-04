import { describe, expect, test } from 'vitest';
import { FENCE_SPELLING } from '../model/address.ts';
import type { Spelling } from '../types.ts';
import { colAxisLabel, rowAxisLabel } from './labels.ts';

const ALPHA_ROWS: Spelling = { silk: 'alpha-rows', rows: 15 };
const ALPHA_COLS: Spelling = { silk: 'alpha-cols', rows: 18 };

describe('rowAxisLabel / colAxisLabel', () => {
  test('writes letters the way a spreadsheet counts, so 27 reads as aa', () => {
    expect(rowAxisLabel(1, FENCE_SPELLING, 'lower')).toBe('a');
    expect(rowAxisLabel(27, FENCE_SPELLING, 'lower')).toBe('aa');
  });

  test('writes letters in capitals by default, the way the boards are printed', () => {
    expect(rowAxisLabel(2, FENCE_SPELLING, 'upper')).toBe('B');
    expect(rowAxisLabel(27, FENCE_SPELLING, 'upper')).toBe('AA');
  });

  test('numbers the columns on the fence and alpha-rows boards', () => {
    expect(colAxisLabel(3, FENCE_SPELLING, 'upper')).toBe('3');
    expect(colAxisLabel(30, ALPHA_ROWS, 'lower')).toBe('30');
  });

  test('counts the rows from the bottom when the letters run bottom-up', () => {
    // 15 行の基板: 一番下の行 (15) が A、一番上の行 (1) が O。秋月 C タイプの刷り方。
    expect(rowAxisLabel(15, ALPHA_ROWS, 'upper')).toBe('A');
    expect(rowAxisLabel(1, ALPHA_ROWS, 'upper')).toBe('O');
  });

  test('puts the letters on the columns and the bottom-up numbers on the rows on an alpha-cols board', () => {
    expect(colAxisLabel(1, ALPHA_COLS, 'upper')).toBe('A');
    expect(colAxisLabel(24, ALPHA_COLS, 'upper')).toBe('X');
    expect(rowAxisLabel(18, ALPHA_COLS, 'upper')).toBe('1');
    expect(rowAxisLabel(1, ALPHA_COLS, 'upper')).toBe('18');
  });
});

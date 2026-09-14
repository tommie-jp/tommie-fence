import { describe, expect, test } from 'vitest';
import { sameShape } from './sameShape.ts';

describe('sameShape', () => {
  test('鍵の並びが違っても同じ中身なら同じ', () => {
    expect(sameShape({ id: 'R1', at: { row: 1, col: 2 } }, { at: { col: 2, row: 1 }, id: 'R1' })).toBe(true);
  });

  test('並びの順は区別する (部品の書いた順は中身の一部)', () => {
    expect(sameShape([1, 2], [2, 1])).toBe(false);
  });

  test('null と空文字は別', () => {
    expect(sameShape({ value: null }, { value: '' })).toBe(false);
  });
});

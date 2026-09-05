import { describe, expect, test } from 'vitest';
import { stepCell } from './move.ts';

describe('stepCell', () => {
  test('returns null for a fractional row or column, instead of spelling a hole the board does not have', () => {
    // 穴の間は文法に無い。`a1.25` を書くと、次に読むときに黙って落ちる (52 の docs/23)。
    expect(stepCell('a1', 0, 0.25)).toBeNull();
    expect(stepCell('a1', 0.5, 0)).toBeNull();
    expect(stepCell('a1', 0, 1)).toBe('a2');
  });
});

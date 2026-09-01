import { describe, expect, test } from 'vitest';
import { formatAddress, parseAddress, rowIndex, rowLabel } from './address.ts';

describe('rowLabel', () => {
  test('numbers the rows with letters, 1 based', () => {
    expect(rowLabel(1)).toBe('a');
    expect(rowLabel(26)).toBe('z');
  });

  test('carries into two letters past z, the way a spreadsheet does', () => {
    // ユニバーサル基板は 26 行を超える板がある (A タイプで 44 行)。
    // 表計算と同じ数え方にしてあるので、`aa` が 27 行目だと説明せずに読める。
    expect(rowLabel(27)).toBe('aa');
    expect(rowLabel(28)).toBe('ab');
    expect(rowLabel(52)).toBe('az');
    expect(rowLabel(53)).toBe('ba');
  });
});

describe('rowIndex', () => {
  test('reads back what rowLabel wrote', () => {
    for (const index of [1, 2, 26, 27, 28, 52, 53, 702, 703]) {
      expect(rowIndex(rowLabel(index))).toBe(index);
    }
  });

  test('refuses what is not a row label', () => {
    expect(rowIndex('')).toBeNull();
    expect(rowIndex('a1')).toBeNull();
    expect(rowIndex('A')).toBeNull();
  });
});

describe('parseAddress', () => {
  test('reads a row letter followed by a column number', () => {
    expect(parseAddress('b3')).toEqual({ row: 2, col: 3 });
    expect(parseAddress('a1')).toEqual({ row: 1, col: 1 });
  });

  test('reads a two letter row', () => {
    expect(parseAddress('ab12')).toEqual({ row: 28, col: 12 });
  });

  test('takes upper case and normalises it', () => {
    // 板の印字が大文字のことがあるので、どちらでも受ける。
    expect(parseAddress('B3')).toEqual({ row: 2, col: 3 });
  });

  test('refuses what is not an address', () => {
    for (const text of ['3b', 'b', '3', 'b0', 'b-1', 'b 3', '', 'b3c', '+t5']) {
      expect(parseAddress(text)).toBeNull();
    }
  });

  test('does not care whether the address is on a board (that is the board to say)', () => {
    expect(parseAddress('zz999')).not.toBeNull();
  });
});

describe('formatAddress', () => {
  test('writes what parseAddress reads', () => {
    for (const text of ['a1', 'b3', 'ab12', 'z26']) {
      expect(formatAddress(parseAddress(text)!)).toBe(text);
    }
  });
});

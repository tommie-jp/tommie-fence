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
    // `b0` `b-1` は**板の外の番地**として読めるようになった (下の describe を見る)。
    for (const text of ['3b', 'b', '3', 'b 3', '', 'b3c', '+t5', '-3b']) {
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

describe('bounds', () => {
  test('refuses a row label longer than any real board needs', () => {
    // **無限ループの入口だった。** 200 字を超える行ラベルは rowIndex が
    // Infinity になり、rowLabel の桁下げが終わらなくなる。
    expect(parseAddress(`${'a'.repeat(230)}1`)).toBeNull();
    expect(rowIndex('a'.repeat(230))).toBeNull();
  });

  test('still takes the labels a real board uses', () => {
    // 実在する一番大きい板 (秋月 A タイプ) でも 44 行 = `ar`。
    expect(parseAddress('ar1')).not.toBeNull();
    expect(parseAddress('zzzz1')).not.toBeNull();
  });

  test('refuses a column number too long to be a column', () => {
    expect(parseAddress(`b${'9'.repeat(30)}`)).toBeNull();
  });

  test('formats a row label in bounded time, whatever it is given', () => {
    // 桁あふれで `while` が終わらなくなった件の見張り。0 と負は板の外の行として読む。
    expect(rowLabel(Number.POSITIVE_INFINITY)).toBe('');
    expect(rowLabel(Number.NEGATIVE_INFINITY)).toBe('');
    expect(rowLabel(Number.NaN)).toBe('');
    expect(rowLabel(0)).toBe('0');
    expect(rowLabel(-1)).toBe('-a');
  });
});

describe('板の外の番地', () => {
  test('reads a column at or left of the first one', () => {
    // 板の外を指せないと、縁の銅箔やコネクタの張り出す先を書けない。
    expect(parseAddress('a0')).toEqual({ row: 1, col: 0 });
    expect(parseAddress('a-1')).toEqual({ row: 1, col: -1 });
    expect(parseAddress('b-12')).toEqual({ row: 2, col: -12 });
  });

  test('reads a row at or above the first one, written with a minus', () => {
    expect(parseAddress('01')).toEqual({ row: 0, col: 1 });
    expect(parseAddress('-a1')).toEqual({ row: -1, col: 1 });
    expect(parseAddress('-b2')).toEqual({ row: -2, col: 2 });
  });

  test('reads both sides at once, the way the examples are written', () => {
    expect(parseAddress('00')).toEqual({ row: 0, col: 0 });
    expect(parseAddress('0-3')).toEqual({ row: 0, col: -3 });
    expect(parseAddress('-B-2')).toEqual({ row: -2, col: -2 });
  });

  test('writes those addresses back the way they were written', () => {
    for (const written of ['a-1', '00', '0-3', '-a1', '-b-2', 'b3']) {
      expect(formatAddress(parseAddress(written)!)).toBe(written);
    }
  });

  test('refuses a spelling that is not a row and a column', () => {
    // `-12` は行が読めない (行は英字か 0)。読めない綴りを通すと、
    // どこを指しているのか書いた人にも読む人にも決まらない。
    for (const bad of ['-12', '--a1', 'a--1', '-', '0', 'a', '1', 'a1-']) {
      expect(parseAddress(bad)).toBeNull();
    }
  });

  test('keeps the counting continuous across zero', () => {
    // …-B(-2) -A(-1) 0 A(1) B(2)… と、間を空けずに並ぶ。
    expect(rowIndex('-a')).toBe(-1);
    expect(rowIndex('0')).toBe(0);
    expect(rowLabel(0)).toBe('0');
    expect(rowLabel(-1)).toBe('-a');
    expect(rowLabel(-27)).toBe('-aa');
  });
});

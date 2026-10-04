import { describe, expect, test } from 'vitest';
import { colName, FENCE_SPELLING, formatAddress, isAddressSpelling, isCrossing, parseAddress, rowIndex, rowLabel, rowName } from './address.ts';
import type { Spelling } from '../types.ts';

describe('rowLabel', () => {
  test('numbers the rows with letters, 1 based', () => {
    expect(rowLabel(1)).toBe('a');
    expect(rowLabel(26)).toBe('z');
  });

  test('carries into two letters past z, the way a spreadsheet does', () => {
    // ユニバーサル基板は 26 行を超える基板がある (A タイプで 44 行)。
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
    expect(parseAddress('b3', FENCE_SPELLING)).toEqual({ row: 2, col: 3 });
    expect(parseAddress('a1', FENCE_SPELLING)).toEqual({ row: 1, col: 1 });
  });

  test('reads a two letter row', () => {
    expect(parseAddress('ab12', FENCE_SPELLING)).toEqual({ row: 28, col: 12 });
  });

  test('takes upper case and normalises it', () => {
    // 基板の印字が大文字のことがあるので、どちらでも受ける。
    expect(parseAddress('B3', FENCE_SPELLING)).toEqual({ row: 2, col: 3 });
  });

  test('refuses what is not an address', () => {
    // `b0` `b-1` は**基板の外の番地**として読めるようになった (下の describe を見る)。
    for (const text of ['3b', 'b', '3', 'b 3', '', 'b3c', '+t5', '-3b']) {
      expect(parseAddress(text, FENCE_SPELLING)).toBeNull();
    }
  });

  test('does not care whether the address is on a board (that is the board to say)', () => {
    expect(parseAddress('zz999', FENCE_SPELLING)).not.toBeNull();
  });
});

describe('formatAddress', () => {
  test('writes what parseAddress reads', () => {
    for (const text of ['a1', 'b3', 'ab12', 'z26']) {
      expect(formatAddress(parseAddress(text, FENCE_SPELLING)!, FENCE_SPELLING)).toBe(text);
    }
  });
});

describe('bounds', () => {
  test('refuses a row label longer than any real board needs', () => {
    // **無限ループの入口だった。** 200 字を超える行ラベルは rowIndex が
    // Infinity になり、rowLabel の桁下げが終わらなくなる。
    expect(parseAddress(`${'a'.repeat(230)}1`, FENCE_SPELLING)).toBeNull();
    expect(rowIndex('a'.repeat(230))).toBeNull();
  });

  test('still takes the labels a real board uses', () => {
    // 実在する一番大きい基板 (秋月 A タイプ) でも 44 行 = `ar`。
    expect(parseAddress('ar1', FENCE_SPELLING)).not.toBeNull();
    expect(parseAddress('zzzz1', FENCE_SPELLING)).not.toBeNull();
  });

  test('refuses a column number too long to be a column', () => {
    expect(parseAddress(`b${'9'.repeat(30)}`, FENCE_SPELLING)).toBeNull();
  });

  test('formats a row label in bounded time, whatever it is given', () => {
    // 桁あふれで `while` が終わらなくなった件の見張り。0 と負は基板の外の行として読む。
    expect(rowLabel(Number.POSITIVE_INFINITY)).toBe('');
    expect(rowLabel(Number.NEGATIVE_INFINITY)).toBe('');
    expect(rowLabel(Number.NaN)).toBe('');
    expect(rowLabel(0)).toBe('0');
    expect(rowLabel(-1)).toBe('-a');
  });
});

describe('基板の外の番地', () => {
  test('reads a column at or left of the first one', () => {
    // 基板の外を指せないと、縁の銅箔やコネクタの張り出す先を書けない。
    expect(parseAddress('a0', FENCE_SPELLING)).toEqual({ row: 1, col: 0 });
    expect(parseAddress('a-1', FENCE_SPELLING)).toEqual({ row: 1, col: -1 });
    expect(parseAddress('b-12', FENCE_SPELLING)).toEqual({ row: 2, col: -12 });
  });

  test('reads a row at or above the first one, written with a minus', () => {
    expect(parseAddress('01', FENCE_SPELLING)).toEqual({ row: 0, col: 1 });
    expect(parseAddress('-a1', FENCE_SPELLING)).toEqual({ row: -1, col: 1 });
    expect(parseAddress('-b2', FENCE_SPELLING)).toEqual({ row: -2, col: 2 });
  });

  test('reads both sides at once, the way the examples are written', () => {
    expect(parseAddress('00', FENCE_SPELLING)).toEqual({ row: 0, col: 0 });
    expect(parseAddress('0-3', FENCE_SPELLING)).toEqual({ row: 0, col: -3 });
    expect(parseAddress('-B-2', FENCE_SPELLING)).toEqual({ row: -2, col: -2 });
  });

  test('writes those addresses back the way they were written', () => {
    for (const written of ['a-1', '00', '0-3', '-a1', '-b-2', 'b3']) {
      expect(formatAddress(parseAddress(written, FENCE_SPELLING)!, FENCE_SPELLING)).toBe(written);
    }
  });

  test('refuses a spelling that is not a row and a column', () => {
    // `-12` は行が読めない (行は英字か 0)。読めない綴りを通すと、
    // どこを指しているのか書いた人にも読む人にも決まらない。
    for (const bad of ['-12', '--a1', 'a--1', '-', '0', 'a', '1', 'a1-']) {
      expect(parseAddress(bad, FENCE_SPELLING)).toBeNull();
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

/**
 * 交点の間 (端数の番地)。**書けるのは注釈だけ** — ピンは穴に挿すので、部品も
 * 配線も節点も交点そのものを指す (実機で「フェンス editor すべてで 1/10 単位を
 * デフォルトにする」。breadboard と同じ綴り)。
 */
describe('交点の間 (端数の番地)', () => {
  test('reads a pair of tenths after the address', () => {
    expect(parseAddress('b5c3', FENCE_SPELLING)).toEqual({ row: 2, col: 5, rows: 0.2, cols: 0.3 });
  });

  test('writes the pair back, and leaves a whole crossing as it was', () => {
    const at = parseAddress('b5c3', FENCE_SPELLING);

    expect(at === null ? '' : formatAddress(at, FENCE_SPELLING)).toBe('b5c3');
    expect(formatAddress({ row: 2, col: 5 }, FENCE_SPELLING)).toBe('b5');
  });

  test('takes the pair on a multi-letter row and a column outside the board', () => {
    expect(parseAddress('ab12c3', FENCE_SPELLING)).toEqual({ row: 28, col: 12, rows: 0.2, cols: 0.3 });
    expect(parseAddress('a-1c3', FENCE_SPELLING)).toEqual({ row: 1, col: -1, rows: 0.2, cols: 0.3 });
  });

  test('refuses a pair that means no offset, so one place has one spelling', () => {
    expect(parseAddress('b5a0', FENCE_SPELLING)).toBeNull();
  });

  test('tells a crossing from a place between crossings', () => {
    const between = parseAddress('b5c3', FENCE_SPELLING);
    const crossing = parseAddress('b5', FENCE_SPELLING);

    expect(between === null ? false : isCrossing(between)).toBe(false);
    expect(crossing === null ? false : isCrossing(crossing)).toBe(true);
  });
});

/**
 * 基板のシルク (52 の docs/108)。**番地の綴りは図の端に刷った名前と同じ**で、
 * 英字と数字のどちらが行か・どちらから数えるかだけが基板で変わる。
 */
describe('基板のシルク', () => {
  // 横置きの 5x7cm (24 列 18 行): 英字が列 (左から)、数字が行 (下から)。
  const TURNED: Spelling = { silk: 'alpha-cols', rows: 18 };
  // 秋月 C タイプ (25 列 15 行): 英字が行 (下から)、数字が列 (左から)。
  const AKIZUKI: Spelling = { silk: 'alpha-rows', rows: 15 };

  test('reads a1 as the bottom left hole and x18 as the top right hole on a turned 5x7cm', () => {
    expect(parseAddress('a1', TURNED)).toEqual({ row: 18, col: 1 });
    expect(parseAddress('x18', TURNED)).toEqual({ row: 1, col: 24 });
    expect(parseAddress('X01', TURNED)).toEqual({ row: 18, col: 24 });
  });

  test('reads a1 as the bottom left hole and o25 as the top right hole on an Akizuki board', () => {
    expect(parseAddress('a1', AKIZUKI)).toEqual({ row: 15, col: 1 });
    expect(parseAddress('o25', AKIZUKI)).toEqual({ row: 1, col: 25 });
  });

  test('keeps reading the fence way when the board has no silk of its own', () => {
    expect(parseAddress('b3', FENCE_SPELLING)).toEqual({ row: 2, col: 3 });
  });

  test('writes back the same spelling it read, on every silk', () => {
    for (const spelling of [FENCE_SPELLING, AKIZUKI, TURNED]) {
      for (const text of ['a1', 'c5', 'o20', 'x18', 'a0', 'a-2', 'p1', '0-3', '-b4', 'z30', 'aa4']) {
        const at = parseAddress(text, spelling);
        expect(at === null ? null : formatAddress(at, spelling), `${spelling.silk} ${text}`).toBe(text);
      }
    }
  });

  test('keeps a place between crossings in the same direction the letters and numbers run', () => {
    // 下から数える向きでは、「下の行へ 0.2」は綴りの上では「英字を 0.2 小さく」になる。
    for (const spelling of [FENCE_SPELLING, AKIZUKI, TURNED]) {
      for (const at of [{ row: 4, col: 6, rows: 0.2, cols: 0.3 }, { row: 1, col: 1, rows: 0.9, cols: 0 }, { row: 18, col: 24, rows: 0, cols: 0.5 }]) {
        const spelled = formatAddress(at, spelling);
        expect(parseAddress(spelled, spelling), `${spelling.silk} ${spelled}`).toEqual(at);
      }
    }
  });

  test('puts the outside of an Akizuki board past the last row, counting on from the bottom', () => {
    // 15 行: 一番下の行の下 (行 16) は英字の 0、一番上の行の上 (行 0) は 16 番目の `p`。
    expect(parseAddress('0' + '1', AKIZUKI)).toEqual({ row: 16, col: 1 });
    expect(parseAddress('p1', AKIZUKI)).toEqual({ row: 0, col: 1 });
  });

  test('says an address shape without caring which silk reads it', () => {
    expect(isAddressSpelling('c5')).toBe(true);
    expect(isAddressSpelling('b5a0')).toBe(false);
    expect(isAddressSpelling('10k')).toBe(false);
  });

  test('names a row and a column the way the board prints them', () => {
    expect(rowName(1, FENCE_SPELLING)).toBe('a');
    expect(rowName(1, AKIZUKI)).toBe('o');
    expect(rowName(1, TURNED)).toBe('18');
    expect(colName(24, TURNED)).toBe('x');
    expect(colName(24, AKIZUKI)).toBe('24');
  });
});

import { describe, expect, test } from 'vitest';
import { createBoard, holeStrip, isOnBoard, offBoardReason, parseBoardSize } from './board.ts';
import { parseAddress } from './address.ts';

const at = (text: string) => parseAddress(text)!;

describe('parseBoardSize', () => {
  test('reads 列x行, the order the board is sold in', () => {
    // 秋月 C タイプは 72×47.5mm、つまり長辺 × 短辺。板の呼び方と同じ順にする。
    expect(parseBoardSize('28x18')).toEqual({ cols: 28, rows: 18 });
  });

  test('takes a capital X and spaces around it', () => {
    expect(parseBoardSize('28 X 18')).toEqual({ cols: 28, rows: 18 });
  });

  test('refuses a size that is not two numbers', () => {
    for (const text of ['28', '28x', 'x18', '28x18x2', 'axb', '', '0x18', '28x0', '-1x18']) {
      expect(parseBoardSize(text)).toBeNull();
    }
  });

  test('refuses a board too big to be a real one', () => {
    // 上限が無いと、フェンス 1 つで巨大な SVG を作らせられる。
    expect(parseBoardSize('1000x1000')).toBeNull();
  });
});

describe('createBoard', () => {
  test('keeps the size it was given', () => {
    expect(createBoard({ cols: 28, rows: 18 })).toEqual({ cols: 28, rows: 18 });
  });
});

describe('offBoardReason', () => {
  const board = createBoard({ cols: 28, rows: 18 });

  test('says nothing about an address on the board', () => {
    expect(offBoardReason(board, at('a1'))).toBeNull();
    expect(offBoardReason(board, at('r28'))).toBeNull();
  });

  test('says which way it ran off, because the fix is different', () => {
    expect(offBoardReason(board, at('a29'))).toContain('28 列');
    expect(offBoardReason(board, at('s1'))).toContain('18 行');
  });

  test('names the address it is talking about', () => {
    expect(offBoardReason(board, at('a29'))).toContain('a29');
  });

  test('isOnBoard agrees with it', () => {
    expect(isOnBoard(board, at('r28'))).toBe(true);
    expect(isOnBoard(board, at('s29'))).toBe(false);
  });
});

describe('holeStrip', () => {
  test('gives every hole an identity of its own', () => {
    // **ここがブレッドボードとの分かれ目。** あちらは同じ列の 5 穴が内部で
    // つながっているので列がストリップになるが、ユニバーサル基板は全穴が独立で、
    // 導通は配線でしか生まれない。
    expect(holeStrip(at('b3'))).toBe('hole:2,3');
    expect(holeStrip(at('b3'))).not.toBe(holeStrip(at('c3')));
    expect(holeStrip(at('b3'))).not.toBe(holeStrip(at('b4')));
  });
});

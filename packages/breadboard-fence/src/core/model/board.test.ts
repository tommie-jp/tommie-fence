import { describe, expect, test } from 'vitest';
import { DEFAULT_BOARD } from '../types.ts';
import { parseAddress } from './address.ts';
import { createBoard, isOnBoard, offBoardReason, railOrder, stripOf } from './board.ts';

const at = (text: string) => {
  const address = parseAddress(text);
  if (!address) throw new Error(`テストの前提が壊れている: ${text}`);
  return address;
};

describe('createBoard', () => {
  test('gives a half size board 30 columns', () => {
    expect(createBoard('half').columns).toBe(30);
  });

  test('gives a full size board 63 columns', () => {
    expect(createBoard('full').columns).toBe(63);
  });

  test('fills the printing options with the defaults when only a size is given', () => {
    expect(createBoard('half')).toEqual({ ...DEFAULT_BOARD, columns: 30 });
  });

  test('keeps the printing options written in the spec', () => {
    const board = createBoard({ ...DEFAULT_BOARD, rails: railOrder('+-+-')!, letters: 'upper' });

    expect(board.columns).toBe(30);
    expect(board.rails).toEqual(['+t', '-t', '+b', '-b']);
    expect(board.letters).toBe('upper');
  });

  test('rejects rails that are not a permutation of the four rail rows', () => {
    // 素通しすると欠けたレールが y=0 に無言で描かれるので、宣言した不変条件はここで落とす。
    expect(() => createBoard({ ...DEFAULT_BOARD, rails: ['+t', '-t', '-t', '+b'] })).toThrow();
  });

  test('keeps a board that has no power rails railless', () => {
    // レールは実物でも両面テープ留めの独立ストリップで、剥がした板が実在する。
    expect(createBoard({ ...DEFAULT_BOARD, rails: null }).rails).toBeNull();
  });
});

describe('railOrder', () => {
  test('reads the default arrangement', () => {
    expect(railOrder('+--+')).toEqual(['+t', '-t', '-b', '+b']);
  });

  test('reads an arrangement with the positive rail inside at the bottom', () => {
    expect(railOrder('+-+-')).toEqual(['+t', '-t', '+b', '-b']);
  });

  test('rejects a side that has two rails of the same polarity', () => {
    expect(railOrder('++--')).toBeNull();
    expect(railOrder('+---')).toBeNull();
  });

  test('rejects anything that is not four polarity signs', () => {
    for (const bad of ['+-+', '+-+-+', 'abcd', '']) {
      expect(railOrder(bad), bad).toBeNull();
    }
  });
});

describe('stripOf', () => {
  test('derives one strip for holes a5 through e5 in the same column', () => {
    const strips = ['a5', 'b5', 'c5', 'd5', 'e5'].map((text) => stripOf(at(text)));
    expect(new Set(strips).size).toBe(1);
  });

  test('separates the top block from the bottom block across the ravine', () => {
    expect(stripOf(at('e5'))).not.toBe(stripOf(at('f5')));
  });

  test('separates neighbouring columns', () => {
    expect(stripOf(at('a5'))).not.toBe(stripOf(at('a6')));
  });

  test('joins every hole of one power rail into a single strip', () => {
    expect(stripOf(at('+t1'))).toBe(stripOf(at('+t30')));
  });

  test('keeps the four power rails apart', () => {
    const rails = ['+t1', '-t1', '+b1', '-b1'].map((text) => stripOf(at(text)));
    expect(new Set(rails).size).toBe(4);
  });
});

describe('isOnBoard', () => {
  test('accepts a column within the board', () => {
    expect(isOnBoard(createBoard('half'), at('a30'))).toBe(true);
  });

  test('rejects a column past the end of a half size board', () => {
    expect(isOnBoard(createBoard('half'), at('a31'))).toBe(false);
  });

  test('accepts that same column on a full size board', () => {
    expect(isOnBoard(createBoard('full'), at('a31'))).toBe(true);
  });

  test('rejects a rail address on a board without rails', () => {
    expect(isOnBoard(createBoard({ ...DEFAULT_BOARD, rails: null }), at('+t5'))).toBe(false);
  });
});

describe('offBoardReason', () => {
  test('gives no reason for an address the board has', () => {
    expect(offBoardReason(createBoard('half'), at('a30'))).toBeNull();
    expect(offBoardReason(createBoard('half'), at('+t30'))).toBeNull();
  });

  test('names the columns the board actually has', () => {
    expect(offBoardReason(createBoard('half'), at('a31'))).toContain('1〜30 列');
  });

  test('says the board has no rails rather than blaming the column', () => {
    // 列は板の中なので「ボードの外」では直す手がかりにならない。
    const reason = offBoardReason(createBoard({ ...DEFAULT_BOARD, rails: null }), at('+t5'));

    expect(reason).toContain('レール');
    expect(reason).not.toContain('列');
  });
});

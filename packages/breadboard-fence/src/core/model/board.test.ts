import { describe, expect, test } from 'vitest';
import { parseAddress } from './address.ts';
import { createBoard, isOnBoard, stripOf } from './board.ts';

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
});

import { describe, expect, test } from 'vitest';
import { formatAddress, isTopBlock, parseAddress } from './address.ts';

describe('parseAddress', () => {
  test('parses a hole address into its row and column', () => {
    expect(parseAddress('a5')).toEqual({ kind: 'hole', row: 'a', col: 5 });
  });

  test('parses a two digit column', () => {
    expect(parseAddress('j30')).toEqual({ kind: 'hole', row: 'j', col: 30 });
  });

  test('parses a power rail address into polarity, side and column', () => {
    expect(parseAddress('+t5')).toEqual({ kind: 'rail', polarity: '+', side: 't', col: 5 });
    expect(parseAddress('-b20')).toEqual({ kind: 'rail', polarity: '-', side: 'b', col: 20 });
  });

  test('accepts an uppercase row letter and normalises it to lowercase', () => {
    // 図の行ラベルを大文字で印字できる (board.letters) ので、番地も大小どちらでも書ける。
    expect(parseAddress('A5')).toEqual({ kind: 'hole', row: 'a', col: 5 });
    expect(parseAddress('J30')).toEqual({ kind: 'hole', row: 'j', col: 30 });
  });

  test('accepts an uppercase rail side letter too', () => {
    expect(parseAddress('+T5')).toEqual({ kind: 'rail', polarity: '+', side: 't', col: 5 });
    expect(parseAddress('-B20')).toEqual({ kind: 'rail', polarity: '-', side: 'b', col: 20 });
  });

  test('returns null for a row letter that does not exist', () => {
    expect(parseAddress('k5')).toBeNull();
    expect(parseAddress('K5')).toBeNull();
  });

  test('returns null for column zero because columns are one based', () => {
    expect(parseAddress('a0')).toBeNull();
  });

  test('returns null for text that is not an address', () => {
    expect(parseAddress('U1.7')).toBeNull();
    expect(parseAddress('')).toBeNull();
    expect(parseAddress('resistor')).toBeNull();
  });
});

describe('formatAddress', () => {
  test('round trips a hole address back to its text form', () => {
    const address = parseAddress('c12');
    expect(address).not.toBeNull();
    expect(formatAddress(address!)).toBe('c12');
  });

  test('round trips a rail address back to its text form', () => {
    const address = parseAddress('-b7');
    expect(formatAddress(address!)).toBe('-b7');
  });
});

describe('isTopBlock', () => {
  test('reports rows a through e as the top block', () => {
    expect(isTopBlock('a')).toBe(true);
    expect(isTopBlock('e')).toBe(true);
  });

  test('reports rows f through j as the bottom block', () => {
    expect(isTopBlock('f')).toBe(false);
    expect(isTopBlock('j')).toBe(false);
  });
});

/**
 * 交点の間と板の外 (52 の docs、実機で「text はどこでも移動できるようにする。
 * breadboard の穴のない領域含む。ボード外含む」)。
 *
 * **綴りは circuit と同じ**「行の英字 + 列の数字」の組で、1 組で小数第 1 位。
 * 穴と穴の間・溝の中・板の左右へは、この端数で届く。
 */
describe('交点の間 (端数の番地)', () => {
  test('reads a pair as tenths of a row and a column, as the schematic fence does', () => {
    expect(parseAddress('b5c3')).toEqual({ kind: 'hole', row: 'b', col: 5, rows: 0.2, cols: 0.3 });
    // `a0` の組は「ずれ無し」なので、綴りが 2 通りにならないよう断る。
    expect(parseAddress('b5a0')).toBeNull();
  });

  test('writes the fraction back in the same spelling', () => {
    const at = parseAddress('b5c3');

    expect(at === null ? '' : formatAddress(at)).toBe('b5c3');
    // 端数の無い番地は今までどおり。
    expect(formatAddress({ kind: 'hole', row: 'b', col: 5 })).toBe('b5');
  });

  test('takes a fraction on a rail too, which is how a note leaves the board', () => {
    expect(parseAddress('+t5c3')).toEqual({
      kind: 'rail', polarity: '+', side: 't', col: 5, rows: 0.2, cols: 0.3,
    });
  });

  test('keeps the plain spellings working', () => {
    expect(parseAddress('a1')).toEqual({ kind: 'hole', row: 'a', col: 1 });
    expect(parseAddress('+t5')).toEqual({ kind: 'rail', polarity: '+', side: 't', col: 5 });
    expect(parseAddress('k1')).toBeNull();
  });
});

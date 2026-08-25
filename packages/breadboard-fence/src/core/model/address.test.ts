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

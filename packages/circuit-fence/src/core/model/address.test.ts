import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { DEFAULT_PITCH, cornerOf, formatAddress, isSameAddress, parseAddress, toPoint } from './address.ts';

describe('parseAddress', () => {
  test('reads the row from the letter and the column from the number', () => {
    expect(parseAddress('a1')).toEqual({ row: 0, col: 0 });
    expect(parseAddress('b3')).toEqual({ row: 1, col: 2 });
    expect(parseAddress('z12')).toEqual({ row: 25, col: 11 });
  });

  test('reads an address written in upper case the same way', () => {
    expect(parseAddress('B3')).toEqual(parseAddress('b3'));
  });

  test('rejects a column of zero, which no address has', () => {
    expect(parseAddress('a0')).toBeNull();
  });

  test('rejects a row past the last letter', () => {
    expect(parseAddress('aa1')).toBeNull();
  });

  test('rejects a column past the limit', () => {
    expect(parseAddress(`a${LIMITS.columns}`)).not.toBeNull();
    expect(parseAddress(`a${LIMITS.columns + 1}`)).toBeNull();
  });

  test('rejects text that is not an address at all', () => {
    expect(parseAddress('1a')).toBeNull();
    expect(parseAddress('resistor')).toBeNull();
    expect(parseAddress('')).toBeNull();
    expect(parseAddress('a')).toBeNull();
  });

  test('rejects a full width address so it is not read as a different cell', () => {
    expect(parseAddress('ａ１')).toBeNull();
  });
});

describe('formatAddress', () => {
  test('writes the address back the way it was read', () => {
    expect(formatAddress({ row: 0, col: 0 })).toBe('a1');
    expect(formatAddress({ row: 1, col: 2 })).toBe('b3');
  });
});

describe('toPoint', () => {
  test('puts the first cell at the origin so the drawing starts there', () => {
    expect(toPoint({ row: 0, col: 0 }, DEFAULT_PITCH)).toEqual({ x: 0, y: 0 });
  });

  test('counts columns to the right and rows downward', () => {
    expect(toPoint({ row: 1, col: 2 }, DEFAULT_PITCH)).toEqual({ x: 2 * DEFAULT_PITCH, y: -DEFAULT_PITCH });
  });

  test('scales with the pitch the drawing asks for', () => {
    expect(toPoint({ row: 1, col: 1 }, 1.5)).toEqual({ x: 1.5, y: -1.5 });
  });
});

describe('isSameAddress', () => {
  test('tells the same cell from another one', () => {
    expect(isSameAddress({ row: 1, col: 1 }, { row: 1, col: 1 })).toBe(true);
    expect(isSameAddress({ row: 1, col: 1 }, { row: 1, col: 2 })).toBe(false);
  });

  test('treats a slanted pair as two different cells, which is allowed', () => {
    expect(isSameAddress({ row: 0, col: 0 }, { row: 1, col: 3 })).toBe(false);
  });
});

describe('cornerOf', () => {
  test('turns across before down for the -| operator', () => {
    // b3 -| c5 は、まず横に c5 の列まで行き、そこから下りる。
    expect(cornerOf({ row: 1, col: 2 }, { row: 2, col: 4 }, '-|')).toEqual({ row: 1, col: 4 });
  });

  test('turns down before across for the |- operator', () => {
    expect(cornerOf({ row: 1, col: 2 }, { row: 2, col: 4 }, '|-')).toEqual({ row: 2, col: 2 });
  });

  test('has no corner when the wire is straight', () => {
    expect(cornerOf({ row: 1, col: 2 }, { row: 2, col: 4 }, '--')).toBeNull();
  });

  test('has no corner when the bend would land on an end anyway', () => {
    // 同じ行どうしを -| で結んでも、ただの直線 (曲がる場所がない)。
    expect(cornerOf({ row: 0, col: 0 }, { row: 0, col: 4 }, '-|')).toBeNull();
    expect(cornerOf({ row: 0, col: 0 }, { row: 2, col: 0 }, '-|')).toBeNull();
  });
});

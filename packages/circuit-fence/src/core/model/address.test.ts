import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import {
  DEFAULT_PITCH, addressHint, cornerOf, formatAddress, isSameAddress, legacyParseAddress, oldSpellingHint,
  parseAddress, rowLetters, rowOfLetters, texNameOfAddress, toPoint,
} from './address.ts';

/**
 * 旧い綴りの行の英字。**表計算の列名と同じ bijective base-26** で、`z` の次は `aa`。
 * 番号は 0 始まりなので、依頼の 1 始まりの n との対応は n = row + 1。
 * いまは旧い綴りを読み直す (直し方を返す・書き換える) ためだけに使う。
 */
describe('rowLetters と rowOfLetters', () => {
  // n=1→A, 26→Z, 27→AA, 52→AZ, 53→BA, 702→ZZ, 703→AAA (0 始まりに直したもの)
  const CASES: readonly (readonly [number, string])[] = [
    [0, 'a'], [25, 'z'], [26, 'aa'], [51, 'az'], [52, 'ba'], [701, 'zz'], [702, 'aaa'],
  ];

  test.each(CASES)('row %i is spelled %s', (row, letters) => {
    expect(rowLetters(row)).toBe(letters);
  });

  test.each(CASES)('%s reads back as row %i', (row, letters) => {
    expect(rowOfLetters(letters)).toBe(row);
  });

  test('goes round trip for every row up to three letters', () => {
    for (let row = 0; row < 800; row += 1) expect(rowOfLetters(rowLetters(row))).toBe(row);
  });
});

describe('parseAddress', () => {
  test('reads the column first and the row second, both counted from 1', () => {
    expect(parseAddress('1,1')).toEqual({ row: 0, col: 0 });
    expect(parseAddress('5,3')).toEqual({ row: 2, col: 4 });
    expect(parseAddress('12,26')).toEqual({ row: 25, col: 11 });
  });

  test('reads a row past 26, which the letters used to carry (aa)', () => {
    expect(parseAddress('1,27')).toEqual({ row: 26, col: 0 });
  });

  test('reads a decimal on either side', () => {
    expect(parseAddress('1.5,1')).toEqual({ row: 0, col: 0.5 });
    expect(parseAddress('1,1.5')).toEqual({ row: 0.5, col: 0 });
    expect(parseAddress('1.5,1.5')).toEqual({ row: 0.5, col: 0.5 });
    expect(parseAddress('2,1.25')).toEqual({ row: 0.25, col: 1 });
    expect(parseAddress('3,2.7')).toEqual({ row: 1.7, col: 2 });
  });

  test('rejects zero and negative numbers, which no address has', () => {
    expect(parseAddress('0,1')).toBeNull();
    expect(parseAddress('1,0')).toBeNull();
    expect(parseAddress('-1,1')).toBeNull();
    expect(parseAddress('0.5,1')).toBeNull();
  });

  test('rejects a row or a column past the limit', () => {
    expect(parseAddress(`${LIMITS.columns},${LIMITS.rows}`)).not.toBeNull();
    expect(parseAddress(`${LIMITS.columns + 1},1`)).toBeNull();
    expect(parseAddress(`1,${LIMITS.rows + 1}`)).toBeNull();
  });

  test('rejects a step that runs past the last row or column, which has no next one', () => {
    expect(parseAddress(`1,${LIMITS.rows - 1}.5`)).not.toBeNull();
    expect(parseAddress(`1,${LIMITS.rows}.5`)).toBeNull();
    expect(parseAddress(`${LIMITS.columns}.5,1`)).toBeNull();
  });

  test(`rejects a third decimal, finer than the ${LIMITS.addressDecimals} the grammar allows`, () => {
    expect(parseAddress('1.25,1')).not.toBeNull();
    expect(parseAddress('1.125,1')).toBeNull();
    expect(parseAddress('1,1.125')).toBeNull();
  });

  test('keeps one spelling for one place, so it rejects zeros that say nothing', () => {
    // ネットの名前も図どうしの突き合わせも綴りで見るので、2 通りに書けると揺れる。
    expect(parseAddress('2.50,1')).toBeNull();
    expect(parseAddress('2.0,1')).toBeNull();
    expect(parseAddress('02,1')).toBeNull();
    expect(parseAddress('2.,1')).toBeNull();
    expect(parseAddress('.5,1')).toBeNull();
    expect(parseAddress('1,01')).toBeNull();
  });

  test('rejects a space around the comma, which splits a part line into two words', () => {
    expect(parseAddress('1, 1')).toBeNull();
    expect(parseAddress('1 ,1')).toBeNull();
    expect(parseAddress(' 1,1')).toBeNull();
  });

  test('rejects text that is not an address at all', () => {
    expect(parseAddress('1')).toBeNull();
    expect(parseAddress('1,1,1')).toBeNull();
    expect(parseAddress('resistor')).toBeNull();
    expect(parseAddress('')).toBeNull();
    expect(parseAddress('U1.5')).toBeNull();
    expect(parseAddress('(1,1)')).toBeNull();
  });

  test('rejects a full width address so it is not read as a different cell', () => {
    expect(parseAddress('１,１')).toBeNull();
  });

  test('does not read the old spelling any more', () => {
    // 旧綴りは読まずに断る (直し方は oldSpellingHint が返す)。両方を読む期間は作らない。
    expect(parseAddress('a1')).toBeNull();
    expect(parseAddress('a1f5')).toBeNull();
    expect(parseAddress('C1')).toBeNull();
  });
});

describe('formatAddress', () => {
  test('writes the column first and the row second, counted from 1', () => {
    expect(formatAddress({ row: 0, col: 0 })).toBe('1,1');
    expect(formatAddress({ row: 2, col: 4 })).toBe('5,3');
    expect(formatAddress({ row: 0.25, col: 1 })).toBe('2,1.25');
  });

  test('writes every spelling back the way it was read', () => {
    for (const written of ['1,1', '5,3', '1.5,1', '1,1.5', '1.5,1.5', '2,1.25', '3,2.7', '99,99', '98.5,98.05']) {
      expect(formatAddress(parseAddress(written)!)).toBe(written);
    }
  });

  test('writes one spelling for a place the numbers reach two ways', () => {
    expect(formatAddress({ row: 0, col: 0.5 })).toBe(formatAddress({ row: 0, col: 0.50 }));
    expect(formatAddress({ row: 0, col: 0.1 + 0.2 })).toBe('1.3,1');
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

  test('measures a half step as half a cell', () => {
    expect(toPoint({ row: 0.5, col: 0.5 }, DEFAULT_PITCH)).toEqual({ x: DEFAULT_PITCH / 2, y: -DEFAULT_PITCH / 2 });
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

  test('tells a half step from the cell it sits between', () => {
    expect(isSameAddress({ row: 0, col: 0.5 }, { row: 0, col: 0.5 })).toBe(true);
    expect(isSameAddress({ row: 0, col: 0.5 }, { row: 0, col: 0 })).toBe(false);
    expect(isSameAddress({ row: 0, col: 0.5 }, { row: 0, col: 0.25 })).toBe(false);
  });
});

describe('cornerOf', () => {
  test('turns across before down for the -| operator', () => {
    // 3,2 -| 5,3 は、まず横に 5 列まで行き、そこから下りる。
    expect(cornerOf({ row: 1, col: 2 }, { row: 2, col: 4 }, '-|')).toEqual({ row: 1, col: 4 });
  });

  test('turns down before across for the |- operator', () => {
    expect(cornerOf({ row: 1, col: 2 }, { row: 2, col: 4 }, '|-')).toEqual({ row: 2, col: 2 });
  });

  test('has no corner when the wire is straight', () => {
    expect(cornerOf({ row: 1, col: 2 }, { row: 2, col: 4 }, '--')).toBeNull();
  });

  test('has no corner when the bend would land on an end anyway', () => {
    expect(cornerOf({ row: 0, col: 0 }, { row: 0, col: 4 }, '-|')).toBeNull();
    expect(cornerOf({ row: 0, col: 0 }, { row: 2, col: 0 }, '-|')).toBeNull();
  });

  test('bends a wire at a half step like any other address', () => {
    expect(cornerOf({ row: 0, col: 0.5 }, { row: 2, col: 4 }, '-|')).toEqual({ row: 0, col: 4 });
  });
});

describe('texNameOfAddress', () => {
  test('spells a place with letters and digits only, which TikZ reads as a name', () => {
    // `,` は TikZ が座標の区切りと読み、`.` はノードのピンと読む。
    expect(texNameOfAddress({ row: 0, col: 0 })).toBe('x1y1');
    expect(texNameOfAddress({ row: 0.25, col: 1.5 })).toBe('x2p5y1p25');
    expect(texNameOfAddress({ row: 0.5, col: 0.5 })).toMatch(/^[a-z][a-z0-9]*$/);
  });

  test('gives two places two names', () => {
    const names = [
      { row: 0, col: 0 }, { row: 0, col: 0.5 }, { row: 0.5, col: 0 }, { row: 0.5, col: 0.5 },
      { row: 0, col: 5 }, { row: 0, col: 0.25 }, { row: 10, col: 0 }, { row: 0, col: 10 },
      { row: 1, col: 0 }, { row: 0, col: 1 },
    ].map(texNameOfAddress);
    expect(new Set(names).size).toBe(names.length);
  });
});

/** 旧い読み手。直し方の案内と、旧い文書の書き換え (migrateAddresses) だけが使う。 */
describe('legacyParseAddress', () => {
  test('reads the row from the letter and the column from the number', () => {
    expect(legacyParseAddress('a1')).toEqual({ row: 0, col: 0 });
    expect(legacyParseAddress('b3')).toEqual({ row: 1, col: 2 });
    expect(legacyParseAddress('B3')).toEqual({ row: 1, col: 2 });
    expect(legacyParseAddress('aa1')).toEqual({ row: 26, col: 0 });
  });

  test('reads the pairs between the cells', () => {
    expect(legacyParseAddress('a1a5')).toEqual({ row: 0, col: 0.5 });
    expect(legacyParseAddress('a1f0')).toEqual({ row: 0.5, col: 0 });
    expect(legacyParseAddress('a1f5')).toEqual({ row: 0.5, col: 0.5 });
    expect(legacyParseAddress('a2c0f0')).toEqual({ row: 0.25, col: 1 });
    expect(legacyParseAddress('b3h0')).toEqual({ row: 1.7, col: 2 });
    expect(legacyParseAddress('a1a0b5')).toEqual({ row: 0.01, col: 0.05 });
  });

  test('rejects what the old reader rejected', () => {
    for (const written of ['a0', 'a1a0', 'a1k5', 'a1.5', 'a_1.5', 'a1b5b5b5', '1a', 'resistor', '', 'ａ１']) {
      expect(legacyParseAddress(written), written).toBeNull();
    }
    expect(legacyParseAddress(`${rowLetters(LIMITS.rows)}1`)).toBeNull();
    expect(legacyParseAddress(`a${LIMITS.columns + 1}`)).toBeNull();
  });
});

describe('oldSpellingHint', () => {
  test('says the old spelling is old and hands back the one to write', () => {
    expect(oldSpellingHint('a1f5')).toBe('a1f5 は旧い綴りです。1.5,1.5 と書きます');
    expect(oldSpellingHint('a1')).toBe('a1 は旧い綴りです。1,1 と書きます');
    expect(oldSpellingHint('c5')).toContain('5,3');
    expect(oldSpellingHint('a1a5')).toContain('1.5,1');
    expect(oldSpellingHint('a1f0')).toContain('1,1.5');
    expect(oldSpellingHint('a2c0f0')).toContain('2,1.25');
    expect(oldSpellingHint('b3h0')).toContain('3,2.7');
    expect(oldSpellingHint('aa1')).toContain('1,27');
  });

  test('reads the spellings older still the same way', () => {
    expect(oldSpellingHint('a_1.5')).toContain('1.5,1');
    expect(oldSpellingHint('a.5_1')).toContain('1,1.5');
    expect(oldSpellingHint('a1_5')).toContain('1.5,1');
    expect(oldSpellingHint('a1.5')).toContain('1.5,1');
  });

  test('says nothing about text that is no old address', () => {
    expect(oldSpellingHint('1,1')).toBeNull();
    expect(oldSpellingHint('resistor')).toBeNull();
    expect(oldSpellingHint('U1.out')).toBeNull();
    expect(oldSpellingHint('a0')).toBeNull();
    expect(oldSpellingHint(`a${LIMITS.columns + 1}`)).toBeNull();
  });

  test('never hands back a spelling that fails to parse', () => {
    for (const written of ['a1', 'a1f5', 'b2c7f5', `${rowLetters(LIMITS.rows - 1)}${LIMITS.columns}`, 'a1.5', 'a_1.25']) {
      const hint = oldSpellingHint(written);
      const suggested = /([0-9.]+,[0-9.]+) と書きます/.exec(hint ?? '');
      expect(suggested, written).not.toBeNull();
      expect(parseAddress(suggested?.[1] ?? ''), written).not.toBeNull();
    }
  });
});

describe('addressHint', () => {
  test('hands back the one spelling for a place written with extra zeros', () => {
    expect(addressHint('2.50,1')).toContain('2.5,1');
    expect(addressHint('02,1')).toContain('2,1');
    expect(addressHint('2.0,1.10')).toContain('2,1.1');
  });

  test('says how fine a decimal may be when it is finer than that', () => {
    expect(addressHint('1.125,1')).toContain(String(LIMITS.addressDecimals));
  });

  test('says where the grid ends when the place is off it', () => {
    expect(addressHint('0,1')).toContain(`${LIMITS.columns},${LIMITS.rows}`);
    expect(addressHint(`1,${LIMITS.rows + 1}`)).toContain(`${LIMITS.columns},${LIMITS.rows}`);
  });

  test('says nothing about text that is not a near miss', () => {
    expect(addressHint('resistor')).toBeNull();
    expect(addressHint('U1.out')).toBeNull();
    expect(addressHint('1,1')).toBeNull();
    expect(addressHint('vin/2')).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import {
  DEFAULT_PITCH, addressHint, cornerOf, formatAddress, isSameAddress, parseAddress, rowLetters,
  rowOfLetters, texNameOfAddress, toPoint,
} from './address.ts';

/**
 * 行の英字。**表計算の列名と同じ bijective base-26** で、`z` の次は `aa`。
 * 番号は 0 始まりなので、依頼の 1 始まりの n との対応は n = row + 1。
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
    // 桁上がりのたびに 1 ずれる書き方をしていないか。境界だけでは見つからない。
    for (let row = 0; row < 800; row += 1) expect(rowOfLetters(rowLetters(row))).toBe(row);
  });

  test('never spells a row with a letter that stands for zero', () => {
    // 0 始まりの 26 進数で書くと `aa` が `a` と同じ場所になる。
    const spellings = new Set(Array.from({ length: 800 }, (_, row) => rowLetters(row)));

    expect(spellings.size).toBe(800);
  });
});

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

  test('reads a row past z, where the letters carry (aa, ab, ...)', () => {
    // 実機で「z 以降も作れるように」。表計算の列名と同じ桁上がり。
    expect(parseAddress('aa1')).toEqual({ row: 26, col: 0 });
    expect(parseAddress('AB1')).toEqual({ row: 27, col: 0 });
  });

  test('rejects a row past the limit', () => {
    expect(parseAddress(`${rowLetters(LIMITS.rows - 1)}1`)).not.toBeNull();
    expect(parseAddress(`${rowLetters(LIMITS.rows)}1`)).toBeNull();
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

describe('parseAddress between the cells', () => {
  test('reads a column step from the digit of another pair', () => {
    expect(parseAddress('a1a5')).toEqual({ row: 0, col: 0.5 });
    expect(parseAddress('b3a5')).toEqual({ row: 1, col: 2.5 });
  });

  test('reads a row step from the letter of the pair, counted like the row itself (a = 0)', () => {
    expect(parseAddress('a1f0')).toEqual({ row: 0.5, col: 0 });
    expect(parseAddress('a1f5')).toEqual({ row: 0.5, col: 0.5 });
  });

  test('reads a second pair as the next decimal, which halves the gap again', () => {
    expect(parseAddress('a1a2a5')).toEqual({ row: 0, col: 0.25 });
    expect(parseAddress('a1c2f5')).toEqual({ row: 0.25, col: 0.25 });
    expect(parseAddress('b2c7f5')).toEqual({ row: 1.25, col: 1.75 });
  });

  test('reads it the same way in upper case', () => {
    expect(parseAddress('A1F5')).toEqual(parseAddress('a1f5'));
  });

  test('rejects a last pair that carries no step, because the plain address says the same place', () => {
    expect(parseAddress('a1a0')).toBeNull();
    expect(parseAddress('a1b5a0')).toBeNull();
  });

  test('keeps a zero pair that a later pair needs', () => {
    expect(parseAddress('a1a0b5')).toEqual({ row: 0.01, col: 0.05 });
  });

  test('rejects a letter past j, which stands for no decimal digit', () => {
    expect(parseAddress('a1k5')).toBeNull();
    expect(parseAddress('a1z0')).toBeNull();
  });

  test('rejects a decimal, which is a pin (U1.5)', () => {
    expect(parseAddress('a1.5')).toBeNull();
    expect(parseAddress('u1.5')).toBeNull();
  });

  test('rejects the separator the spelling used to need', () => {
    expect(parseAddress('a_1.5')).toBeNull();
    expect(parseAddress('a.5_1')).toBeNull();
  });

  test('rejects more pairs than the decimals allow', () => {
    expect(parseAddress('a1b5b5')).not.toBeNull();
    expect(parseAddress('a1b5b5b5')).toBeNull();
  });

  test('rejects a step that runs past the last row, which has no next row', () => {
    const last = rowLetters(LIMITS.rows - 1);
    const beforeLast = rowLetters(LIMITS.rows - 2);

    expect(parseAddress(`${beforeLast}1f0`)).not.toBeNull();
    expect(parseAddress(`${last}1f0`)).toBeNull();
  });

  test('rejects a step that runs past the last column', () => {
    expect(parseAddress(`a${LIMITS.columns - 1}a5`)).not.toBeNull();
    expect(parseAddress(`a${LIMITS.columns}a5`)).toBeNull();
  });

  test('rejects a half written pair', () => {
    expect(parseAddress('a1a')).toBeNull();
    expect(parseAddress('a15a')).toBeNull();
    expect(parseAddress('1a5')).toBeNull();
  });
});

describe('formatAddress between the cells', () => {
  test('writes a pair only when there is a step', () => {
    expect(formatAddress({ row: 0, col: 0.5 })).toBe('a1a5');
    expect(formatAddress({ row: 0.5, col: 0.5 })).toBe('a1f5');
    expect(formatAddress({ row: 0.5, col: 0 })).toBe('a1f0');
  });

  test('writes every spelling back the way it was read', () => {
    for (const written of ['a1', 'b3', 'a1a5', 'a1f5', 'a1f0', 'a1a2f5', 'b2c7f5', 'z99', 'y98f5', 'a1a0b5']) {
      expect(formatAddress(parseAddress(written)!)).toBe(written);
    }
  });

  test('writes one spelling for a place the numbers reach two ways', () => {
    expect(formatAddress({ row: 0, col: 0.5 })).toBe(formatAddress({ row: 0, col: 0.50 }));
    expect(formatAddress({ row: 0, col: 1 })).toBe('a2');
  });
});

describe('texNameOfAddress', () => {
  test('leaves a whole cell alone, so the drawing it writes does not change', () => {
    expect(texNameOfAddress({ row: 0, col: 0 })).toBe('a1');
    expect(texNameOfAddress({ row: 1, col: 2 })).toBe('b3');
  });

  test('hands the spelling straight through, because no dot is left for TikZ to read as an anchor', () => {
    expect(texNameOfAddress({ row: 0, col: 0.5 })).toBe('a1a5');
    expect(texNameOfAddress({ row: 0.5, col: 0.5 })).not.toMatch(/[._]/);
  });

  test('gives two places two names', () => {
    const names = [
      { row: 0, col: 0 }, { row: 0, col: 0.5 }, { row: 0.5, col: 0 }, { row: 0.5, col: 0.5 },
      { row: 0, col: 5 }, { row: 0, col: 0.25 },
    ].map(texNameOfAddress);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('addresses between the cells in the geometry', () => {
  test('measures a half step as half a cell', () => {
    expect(toPoint({ row: 0.5, col: 0.5 }, DEFAULT_PITCH)).toEqual({
      x: DEFAULT_PITCH / 2, y: -DEFAULT_PITCH / 2,
    });
  });

  test('tells a half step from the cell it sits between', () => {
    expect(isSameAddress({ row: 0, col: 0.5 }, { row: 0, col: 0.5 })).toBe(true);
    expect(isSameAddress({ row: 0, col: 0.5 }, { row: 0, col: 0 })).toBe(false);
    expect(isSameAddress({ row: 0, col: 0.5 }, { row: 0, col: 0.25 })).toBe(false);
  });

  test('bends a wire at a half step like any other address', () => {
    expect(cornerOf({ row: 0, col: 0.5 }, { row: 2, col: 4 }, '-|')).toEqual({ row: 0, col: 4 });
  });
});

describe('addressHint', () => {
  test('turns the separator the spelling used to need into the pairs that work', () => {
    expect(addressHint('a_1.5')).toContain('a1a5');
    expect(addressHint('a.5_1')).toContain('a1f0');
    expect(addressHint('b.25_2.75')).toContain('b2c7f5');
  });

  test('reads the misplaced separator as the column decimal it stood for', () => {
    // `a1_5` は `_` の後ろが**列の端数**という書き間違い (行の端数を書く場所が
    // 無い綴り)。組の位置が `a.5_1.5` と違うので、1 つの分解で兼ねると行と列が
    // 入れ替わり、**言われたとおり直すと別の交点へ移る**案内になる
    // (`a1_5` に `a5a1` を返していた)。
    expect(addressHint('a1_5')).toContain('a1a5');
    expect(addressHint('c12_5')).toContain('c12a5');
    expect(addressHint('b2_75')).toContain('b2a7a5');
  });

  test('counts the decimals of the misplaced separator, not the column number', () => {
    // 端数の桁を数える先も入れ替わっていた。`c1_555` は端数が 3 桁なので断る。
    expect(addressHint('c1_555')).toContain('端数');
    // `c123_5` の 3 桁は**列のほう**で、端数は 1 桁。桁の話で断ってはいけない
    // (列 123 は格子の外なので、案内そのものが出ない)。
    expect(addressHint('c123_5')).toBeNull();
  });

  test('points back to the plain spelling when the old separator carried no decimal', () => {
    expect(addressHint('a_1')).toContain('a1');
    expect(addressHint('a.0_1')).toContain('a1');
  });

  test('turns a decimal into the pairs that work', () => {
    expect(addressHint('a1.5')).toContain('a1a5');
    expect(addressHint('c12.25')).toContain('c12a2a5');
  });

  test('says which letters a pair may use', () => {
    expect(addressHint('a1k5')).toContain('a〜j');
  });

  test('says how many pairs there may be when there are more', () => {
    expect(addressHint('a1b5b5b5')).toContain(String(LIMITS.addressDecimals));
  });

  test('says how fine a decimal may be when it is finer than that', () => {
    expect(addressHint('a1.125')).toContain(String(LIMITS.addressDecimals));
  });

  test('points back to the plain spelling when the last pair carries no step', () => {
    expect(addressHint('a1a0')).toContain('a1');
  });

  test('says a fraction is not a way to write it', () => {
    expect(addressHint('a.1/4_2')).toContain('組');
  });

  test('says nothing about text that is not a near miss', () => {
    expect(addressHint('resistor')).toBeNull();
    expect(addressHint('U1.out')).toBeNull();
    expect(addressHint('a1')).toBeNull();
    expect(addressHint('a1a5')).toBeNull();
  });
});

describe('addressHint が返す綴り', () => {
  test('never hands back a spelling that fails to parse', () => {
    // 言われたとおりに直しても通らない案内は、自己修正のループを空回りさせる。
    const near = ['a0.5', 'a100.5', 'a1_0', 'a_0', 'a1.999', 'a1k5', 'a1a0', 'a1b5b5b5'];
    for (const written of [...near, `${rowLetters(LIMITS.rows - 1)}.5_1`, `a${LIMITS.columns}.5`]) {
      const hint = addressHint(written);
      if (hint === null) continue;
      const suggested = /[a-z]+\d+(?:[a-j]\d){0,2}/.exec(hint.replace(/^[^(]*\(/, ''));
      if (suggested === null) continue;
      expect(parseAddress(suggested[0]), `${written} → ${hint}`).not.toBeNull();
    }
  });

  test('says nothing about fractions for text that is not an address at all', () => {
    // `points:` の名前を書き間違えた人に分数の話をしても、直す手がかりにならない。
    expect(addressHint('vin/2')).toBeNull();
    expect(addressHint('R1/2')).toBeNull();
  });
});

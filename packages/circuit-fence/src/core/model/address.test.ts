import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import {
  DEFAULT_PITCH, addressHint, cornerOf, formatAddress, isSameAddress, parseAddress, texNameOfAddress,
  toPoint,
} from './address.ts';

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

describe('parseAddress between the cells', () => {
  test('reads a column written between two cells', () => {
    expect(parseAddress('a_1.5')).toEqual({ row: 0, col: 0.5 });
    expect(parseAddress('b_3.5')).toEqual({ row: 1, col: 2.5 });
  });

  test('reads a row written between two letters', () => {
    expect(parseAddress('a.5_1')).toEqual({ row: 0.5, col: 0 });
    expect(parseAddress('a.5_1.5')).toEqual({ row: 0.5, col: 0.5 });
  });

  test('reads a quarter step, which halves the gap again', () => {
    expect(parseAddress('a_1.25')).toEqual({ row: 0, col: 0.25 });
    expect(parseAddress('a.25_2')).toEqual({ row: 0.25, col: 1 });
  });

  test('reads it the same way in upper case', () => {
    expect(parseAddress('A.5_1.5')).toEqual(parseAddress('a.5_1.5'));
  });

  test('reads a trailing zero as the same place, so one spelling stays canonical', () => {
    expect(parseAddress('a_1.50')).toEqual(parseAddress('a_1.5'));
  });

  test('rejects a decimal written without the separator, which is a pin (U1.5)', () => {
    expect(parseAddress('a1.5')).toBeNull();
    expect(parseAddress('u1.5')).toBeNull();
  });

  test('rejects a separator without a decimal, which is just a1', () => {
    expect(parseAddress('a_1')).toBeNull();
    expect(parseAddress('a_1.0')).toBeNull();
    expect(parseAddress('a.0_1')).toBeNull();
  });

  test('rejects a fraction, so the same place has one spelling', () => {
    expect(parseAddress('a.1/4_2')).toBeNull();
    expect(parseAddress('a_1/4')).toBeNull();
  });

  test('rejects a decimal finer than the limit', () => {
    expect(parseAddress(`a_1.${'1'.repeat(LIMITS.addressDecimals)}`)).not.toBeNull();
    expect(parseAddress(`a_1.${'1'.repeat(LIMITS.addressDecimals + 1)}`)).toBeNull();
  });

  test('rejects a step that runs past the last row, which has no next letter', () => {
    expect(parseAddress('y.5_1')).not.toBeNull();
    expect(parseAddress('z.5_1')).toBeNull();
  });

  test('rejects a step that runs past the last column', () => {
    expect(parseAddress(`a_${LIMITS.columns - 1}.5`)).not.toBeNull();
    expect(parseAddress(`a_${LIMITS.columns}.5`)).toBeNull();
  });

  test('rejects a half written address', () => {
    expect(parseAddress('a_')).toBeNull();
    expect(parseAddress('_1')).toBeNull();
    expect(parseAddress('a.5')).toBeNull();
    expect(parseAddress('a.5_')).toBeNull();
    expect(parseAddress('a_1.5_2')).toBeNull();
  });
});

describe('formatAddress between the cells', () => {
  test('writes the separator only when there is a decimal', () => {
    expect(formatAddress({ row: 0, col: 0.5 })).toBe('a_1.5');
    expect(formatAddress({ row: 0.5, col: 0.5 })).toBe('a.5_1.5');
    expect(formatAddress({ row: 0.5, col: 0 })).toBe('a.5_1');
  });

  test('writes every spelling back the way it was read', () => {
    for (const written of ['a1', 'b3', 'a_1.5', 'a.5_1.5', 'a.5_1', 'a_1.25', 'a.25_2', 'z99', 'y.5_98.5']) {
      expect(formatAddress(parseAddress(written)!)).toBe(written);
    }
  });

  test('writes one spelling for a place written two ways', () => {
    expect(formatAddress(parseAddress('a_1.50')!)).toBe('a_1.5');
    expect(formatAddress(parseAddress('a_1.10')!)).toBe('a_1.1');
  });
});

describe('texNameOfAddress', () => {
  test('leaves a whole cell alone, so the drawing it writes does not change', () => {
    expect(texNameOfAddress({ row: 0, col: 0 })).toBe('a1');
    expect(texNameOfAddress({ row: 1, col: 2 })).toBe('b3');
  });

  test('keeps the dot out, which TikZ reads as the anchor of a node', () => {
    expect(texNameOfAddress({ row: 0, col: 0.5 })).not.toContain('.');
    expect(texNameOfAddress({ row: 0.5, col: 0.5 })).not.toContain('.');
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
  test('turns a decimal written without the separator into the spelling that works', () => {
    expect(addressHint('a1.5')).toContain('a_1.5');
    expect(addressHint('c12.25')).toContain('c_12.25');
  });

  test('says how fine a decimal may be when it is finer than that', () => {
    expect(addressHint('a1.125')).toContain(String(LIMITS.addressDecimals));
  });

  test('turns a decimal written with the separator alone into the spelling that works', () => {
    expect(addressHint('a1_5')).toContain('a_1.5');
  });

  test('points back to the plain spelling when the separator carries no decimal', () => {
    expect(addressHint('a_1')).toContain('a1');
    expect(addressHint('a.0_1')).toContain('a1');
  });

  test('says a fraction is not a way to write it', () => {
    expect(addressHint('a.1/4_2')).toContain('.25');
  });

  test('says nothing about text that is not a near miss', () => {
    expect(addressHint('resistor')).toBeNull();
    expect(addressHint('U1.out')).toBeNull();
    expect(addressHint('a1')).toBeNull();
  });
});

describe('addressHint が返す綴り', () => {
  test('never hands back a spelling that fails to parse', () => {
    // 言われたとおりに直しても通らない案内は、自己修正のループを空回りさせる。
    for (const written of ['a0.5', 'a100.5', 'a1_0', 'a_0', 'z1.5', 'a1.999']) {
      const hint = addressHint(written);
      if (hint === null) continue;
      const suggested = /[a-z](?:\.\d+)?_?\d+(?:\.\d+)?/.exec(hint.replace(/^[^(]*\(/, ''));
      if (suggested === null) continue;
      expect(parseAddress(suggested[0])).not.toBeNull();
    }
  });

  test('says nothing about fractions for text that is not an address at all', () => {
    // `points:` の名前を書き間違えた人に分数の話をしても、直す手がかりにならない。
    expect(addressHint('vin/2')).toBeNull();
    expect(addressHint('R1/2')).toBeNull();
  });

  test('keeps the decimals it allows in step with the limit', () => {
    expect(addressHint(`a1_${'1'.repeat(LIMITS.addressDecimals)}`)).not.toBeNull();
  });
});

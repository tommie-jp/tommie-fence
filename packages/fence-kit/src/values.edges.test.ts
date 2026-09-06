import { describe, expect, test } from 'vitest';
import {
  capacitorCode, inductorCode, parseMicrohenries, parseOhms, parsePicofarads, parseResistor,
  resistorBandColors, resistorBands,
} from './values.ts';

/**
 * 値の読み方と、実物の帯・刷り数字の**縁**。
 *
 * ここが緩むと**図に嘘の帯が出る** — 実物と違う色で描かれた抵抗は、図を信じて
 * 部品箱から取る人を間違えさせる。だから「読めない・書けない」は黙って丸めず
 * null にする、という決めを縁ごとに押さえる。
 */

describe('抵抗値を読む', () => {
  test('reads the plain forms, with and without the unit', () => {
    expect(parseOhms('330')).toBe(330);
    expect(parseOhms('10k')).toBe(10_000);
    expect(parseOhms('2M')).toBe(2_000_000);
  });

  test('reads the infix form, where the unit stands in for the point', () => {
    expect(parseOhms('4k7')).toBe(4700);
    expect(parseOhms('1R5')).toBe(1.5);
  });

  test('drops the ohm sign, in either width', () => {
    expect(parseOhms('330Ω')).toBe(330);
    expect(parseOhms('330 ohms')).toBe(330);
  });

  test('says nothing for what it cannot read', () => {
    expect(parseOhms('なんとか')).toBeNull();
    expect(parseOhms('')).toBeNull();
    expect(parseOhms('k')).toBeNull();
  });
});

describe('カラーコード', () => {
  test('draws the three band code for a plain value', () => {
    expect(resistorBandColors(330)).toEqual(['orange', 'orange', 'brown']);
  });

  test('rounds up into the next decade without losing a digit', () => {
    // 99.6 は 2 桁に丸めると 100 — 桁が 1 つ増える。
    expect(resistorBandColors(99.6)).toHaveLength(3);
  });

  test('says nothing for a value that has no bands', () => {
    expect(resistorBandColors(0)).toBeNull();
    expect(resistorBandColors(-1)).toBeNull();
    expect(resistorBandColors(Number.NaN)).toBeNull();
  });

  test('uses four bands by default, brown for the one per cent it ships as', () => {
    expect(resistorBands(330)).toEqual(['orange', 'orange', 'brown', 'brown']);
  });

  test('takes a tolerance it has a colour for, and refuses one it does not', () => {
    expect(resistorBands(330, { tolerance: 5 })?.at(-1)).toBeDefined();
    expect(resistorBands(330, { tolerance: 3 })).toBeNull();
  });

  test('goes to three figures when two cannot say the value', () => {
    expect(resistorBands(4990)).toHaveLength(5);
  });

  test('always uses three figures once a tempco is written, since a six band with two is not a real part', () => {
    expect(resistorBands(330, { tempco: 100 })).toHaveLength(6);
  });

  test('refuses a tempco it has no colour for, rather than rounding to a near one', () => {
    expect(resistorBands(330, { tempco: 7 })).toBeNull();
  });

  test('says nothing for a value no multiplier reaches', () => {
    expect(resistorBands(1e30)).toBeNull();
    expect(resistorBands(0)).toBeNull();
  });
});

describe('抵抗の綴りを丸ごと読む', () => {
  test('takes the value written on the part', () => {
    expect(parseResistor('10k')).toMatchObject({ ohms: 10_000 });
  });

  test('says nothing when the value cannot be read', () => {
    expect(parseResistor('なんとか')).toBeNull();
  });
});

describe('コンデンサ', () => {
  test('reads the plain and the infix forms', () => {
    expect(parsePicofarads('100n')).toBe(100_000);
    expect(parsePicofarads('4u7')).toBe(4_700_000);
    expect(parsePicofarads('47')).toBe(47);
  });

  test('says nothing for what it cannot read, or for nothing at all', () => {
    expect(parsePicofarads('なんとか')).toBeNull();
    expect(parsePicofarads('0')).toBeNull();
  });

  test('prints the three digit code the real part carries', () => {
    expect(capacitorCode(100_000)).toBe('104');
    expect(capacitorCode(47)).toBe('470');
  });

  test('says nothing below ten picofarads, which the real part prints in full', () => {
    expect(capacitorCode(4.7)).toBeNull();
  });
});

describe('インダクタ', () => {
  test('reads the plain and the infix forms', () => {
    expect(parseMicrohenries('100u')).toBe(100);
    expect(parseMicrohenries('4m7')).toBe(4700);
  });

  test('says nothing for what it cannot read', () => {
    expect(parseMicrohenries('なんとか')).toBeNull();
  });

  test('prints the three digit code in microhenries', () => {
    expect(inductorCode(100)).toBe('101');
  });
});

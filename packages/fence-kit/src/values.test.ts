import { describe, expect, test } from 'vitest';
import {
  capacitorCode, inductorCode, parseMicrohenries, parseOhms, parsePicofarads, parseResistor,
  resistorBandColors, resistorBands,
} from './values.ts';

describe('parseOhms', () => {
  test('reads a plain number of ohms', () => {
    expect(parseOhms('330')).toBe(330);
  });

  test('reads the k and M suffixes', () => {
    expect(parseOhms('10k')).toBe(10_000);
    expect(parseOhms('2.2M')).toBe(2_200_000);
  });

  test('reads a decimal point written as the unit letter', () => {
    expect(parseOhms('4k7')).toBe(4700);
    expect(parseOhms('1R')).toBe(1);
  });

  test('ignores a trailing ohm sign', () => {
    expect(parseOhms('10kΩ')).toBe(10_000);
  });

  test('returns null for text that is not a resistance', () => {
    expect(parseOhms('red')).toBeNull();
    expect(parseOhms('')).toBeNull();
  });
});

describe('resistorBandColors', () => {
  test('gives 10k the brown black orange bands', () => {
    expect(resistorBandColors(10_000)).toEqual(['brown', 'black', 'orange']);
  });

  test('gives 330 the orange orange brown bands', () => {
    expect(resistorBandColors(330)).toEqual(['orange', 'orange', 'brown']);
  });

  test('gives 10 ohms the brown black black bands', () => {
    expect(resistorBandColors(10)).toEqual(['brown', 'black', 'black']);
  });

  test('uses the gold band for a resistance below ten ohms', () => {
    expect(resistorBandColors(4.7)).toEqual(['yellow', 'violet', 'gold']);
    expect(resistorBandColors(1)).toEqual(['brown', 'black', 'gold']);
  });

  test('returns null for a resistance it cannot encode', () => {
    expect(resistorBandColors(0)).toBeNull();
    expect(resistorBandColors(-5)).toBeNull();
  });
});

describe('resistorBands', () => {
  test('reads a two figure value as four bands (digits, multiplier, tolerance)', () => {
    // 実物も E24 (2 桁) は 4 帯。既定の許容差は金属皮膜の標準 ±1% (茶)。
    expect(resistorBands(10000)).toEqual(['brown', 'black', 'orange', 'brown']);
  });

  test('reads a three figure value as five bands, the way E96 parts are marked', () => {
    expect(resistorBands(4990)).toEqual(['yellow', 'white', 'white', 'brown', 'brown']);
  });

  test('takes the tolerance that was written', () => {
    expect(resistorBands(10000, { tolerance: 5 })).toEqual(['brown', 'black', 'orange', 'gold']);
    expect(resistorBands(10000, { tolerance: 10 })?.at(-1)).toBe('silver');
  });

  test('adds a sixth band only when a temperature coefficient was written', () => {
    expect(resistorBands(10000, { tempco: 50 })?.length).toBe(6);
    expect(resistorBands(10000, { tempco: 50 })?.at(-1)).toBe('red');
    expect(resistorBands(10000)?.length).toBe(4);
  });

  test('keeps three figures when the value needs them, tempco or not', () => {
    expect(resistorBands(4990, { tempco: 100 })).toEqual(
      ['yellow', 'white', 'white', 'brown', 'brown', 'brown'],
    );
  });

  test('answers null for a value no colour code can carry', () => {
    for (const ohms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resistorBands(ohms)).toBeNull();
    }
  });

  test('answers null for a tolerance or a tempco it has no colour for', () => {
    expect(resistorBands(10000, { tolerance: 3 })).toBeNull();
    expect(resistorBands(10000, { tempco: 42 })).toBeNull();
  });
});

describe('parseResistor', () => {
  test('reads the value alone, leaving the tolerance to the default', () => {
    expect(parseResistor('10k')).toEqual({ ohms: 10000, tolerance: undefined, tempco: undefined });
  });

  test('reads a tolerance written after the value', () => {
    expect(parseResistor('4k99 0.5%')).toMatchObject({ ohms: 4990, tolerance: 0.5 });
    expect(parseResistor('10k ±5%')).toMatchObject({ tolerance: 5 });
  });

  test('reads a temperature coefficient, which asks for the sixth band', () => {
    expect(parseResistor('10k 1% 50ppm')).toEqual({ ohms: 10000, tolerance: 1, tempco: 50 });
    expect(parseResistor('10k 50ppm/K')).toMatchObject({ tempco: 50 });
  });

  test('answers null for a word it cannot read, rather than drawing bands it guessed', () => {
    for (const text of ['', 'red', '10k 5', '10k 1% 2%', '10k blue', '100n']) {
      expect(parseResistor(text)).toBeNull();
    }
  });
});

describe('コンデンサの 3 桁コード', () => {
  test('reads the spellings a capacitor is written with', () => {
    expect(parsePicofarads('100n')).toBe(100000);
    expect(parsePicofarads('0.1u')).toBe(100000);
    expect(parsePicofarads('10p')).toBe(10);
    expect(parsePicofarads('4n7')).toBe(4700);
    expect(parsePicofarads('100nF')).toBe(100000);
  });

  test('writes the code that is printed on the part', () => {
    // 100n = 100,000pF = 10 × 10^4 → 104。実物のセラミックの刷り字と同じ。
    expect(capacitorCode(100000)).toBe('104');
    expect(capacitorCode(10000)).toBe('103');
    expect(capacitorCode(100)).toBe('101');
    expect(capacitorCode(4700)).toBe('472');
  });

  test('answers null where the part itself would not use a code', () => {
    // 10pF 未満は実物も `4.7` と直に刷る。3 桁に丸めると別の容量になる。
    expect(capacitorCode(4.7)).toBeNull();
    expect(capacitorCode(0)).toBeNull();
    expect(capacitorCode(123)).toBeNull();
  });

  test('answers null for a spelling it cannot read', () => {
    for (const text of ['', 'red', '10k?', 'abc']) expect(parsePicofarads(text)).toBeNull();
  });
});

describe('インダクタの 3 桁コード', () => {
  test('reads the spellings an inductor is written with', () => {
    expect(parseMicrohenries('100u')).toBe(100);
    expect(parseMicrohenries('10m')).toBe(10000);
    expect(parseMicrohenries('4u7')).toBe(4.7);
    expect(parseMicrohenries('470')).toBe(470);
  });

  test('writes the code in microhenries, the way the part is printed', () => {
    expect(inductorCode(100)).toBe('101');
    expect(inductorCode(10000)).toBe('103');
    expect(inductorCode(22)).toBe('220');
  });

  test('answers null below ten, where the part prints the value itself', () => {
    expect(inductorCode(4.7)).toBeNull();
  });
});

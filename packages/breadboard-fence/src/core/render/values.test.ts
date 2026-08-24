import { describe, expect, test } from 'vitest';
import { parseOhms, resistorBandColors } from './values.ts';

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

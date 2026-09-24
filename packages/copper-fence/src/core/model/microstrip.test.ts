import { describe, expect, test } from 'vitest';
import {
  coplanar, electricalDegrees, formatHertz, groundedCoplanar, guidedWavelength, microstrip, microstripWidthFor, parseHertz,
} from './microstrip.ts';

/**
 * 52 の docs/73 §1.5 の表 (Python で同じ式を組んだ値) と、web の計算機
 * (FR4 1.6mm で約 3.0mm) と、ZEP の記事 (CPWG 1.0 / 0.15 で 50Ω) に合わせる。
 */
describe('microstrip', () => {
  test('gives 50 ohms for 3.06mm on 1.6mm FR4', () => {
    expect(microstrip(3.06, 1.6, 4.4).z0).toBeCloseTo(50, 0);
    expect(microstrip(3.0, 1.6, 4.4).z0).toBeCloseTo(50.6, 1);
    expect(microstrip(1.53, 0.8, 4.4).z0).toBeCloseTo(50, 0);
  });

  test('narrows and widens the way the table in the memo does', () => {
    expect(microstrip(2.5, 1.6, 4.4).z0).toBeCloseTo(56.3, 1);
    expect(microstrip(5.0, 1.6, 4.4).z0).toBeCloseTo(36.4, 1);
    expect(microstrip(3.06, 1.6, 4.4).epsEff).toBeCloseTo(3.33, 2);
  });

  test('finds the width back from the impedance', () => {
    expect(microstripWidthFor(50, 1.6, 4.4)).toBeCloseTo(3.06, 2);
    expect(microstripWidthFor(50, 0.8, 4.2)).toBeCloseTo(1.58, 2);
  });
});

describe('coplanar lines', () => {
  test('gives 50 ohms for 1.0 / 0.15mm with the ground on both faces', () => {
    expect(groundedCoplanar(1.0, 0.15, 1.6, 4.4).z0).toBeCloseTo(50.7, 1);
    expect(groundedCoplanar(1.0, 0.15, 1.6, 4.4).epsEff).toBeCloseTo(2.75, 2);
  });

  test('rises without the back ground', () => {
    expect(coplanar(1.0, 0.15, 1.6, 4.4).z0).toBeCloseTo(53.2, 1);
    expect(coplanar(1.0, 0.15, 1.6, 4.4).z0).toBeGreaterThan(groundedCoplanar(1.0, 0.15, 1.6, 4.4).z0);
  });
});

describe('wavelength', () => {
  test('gives a quarter wave of 17.1mm at 2.4GHz on 50-ohm FR4', () => {
    expect(guidedWavelength(2.4e9, 3.33) / 4).toBeCloseTo(17.1, 1);
    expect(electricalDegrees(17.1, 2.4e9, 3.33)).toBeCloseTo(90, 0);
  });
});

describe('parseHertz / formatHertz', () => {
  test('reads k, M and G with or without Hz', () => {
    expect(parseHertz('2.4G')).toBe(2.4e9);
    expect(parseHertz('2400M')).toBe(2.4e9);
    expect(parseHertz('1575MHz')).toBe(1.575e9);
    expect(parseHertz('433M')).toBe(433e6);
    expect(parseHertz('10k')).toBe(1e4);
    expect(parseHertz('100000000')).toBe(1e8);
  });

  test('refuses m, which would be read a billion times too large', () => {
    expect(parseHertz('2.4m')).toBeNull();
    expect(parseHertz('fast')).toBeNull();
    expect(parseHertz('0')).toBeNull();
  });

  test('spells the frequency back in the nearest unit', () => {
    expect(formatHertz(2.4e9)).toBe('2.4GHz');
    expect(formatHertz(433e6)).toBe('433MHz');
    expect(formatHertz(1e4)).toBe('10kHz');
  });
});

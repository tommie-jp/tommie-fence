import { describe, expect, test } from 'vitest';
import { PART_TYPES, closestPartType, lookupPartType, partTypeNames } from './parts.ts';

describe('PART_TYPES', () => {
  test('carries the two terminal parts a schematic is drawn with', () => {
    for (const name of ['resistor', 'capacitor', 'inductor', 'diode', 'led', 'zener']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
    }
  });

  test('draws the electrolytic capacitor with the curved plate symbol', () => {
    // eC はフォントが無くてプロセスごと落ちる。曲板の cC は実機で通る (実測)。
    expect(lookupPartType('ecap')?.kind).toBe('two-terminal');
    expect(lookupPartType('ecap')?.symbol).toBe('cC');
    expect(lookupPartType('ecap')?.unitTex).toBe('\\mathrm{F}');
  });

  test('carries the sources and the parts that break a circuit', () => {
    for (const name of ['vsource', 'sine', 'isource', 'battery', 'switch', 'fuse', 'lamp']) {
      expect(lookupPartType(name)?.kind).toBe('two-terminal');
    }
  });

  test('keeps the one terminal symbols', () => {
    expect(lookupPartType('port')?.kind).toBe('one-terminal');
    expect(lookupPartType('ground')?.kind).toBe('one-terminal');
  });

  test('gives a unit only where the value has one', () => {
    expect(lookupPartType('resistor')?.unitTex).toBe('\\Omega');
    expect(lookupPartType('inductor')?.unitTex).toBe('\\mathrm{H}');
    expect(lookupPartType('vsource')?.unitTex).toBe('\\mathrm{V}');
    expect(lookupPartType('isource')?.unitTex).toBe('\\mathrm{A}');
    // ダイオードの値は型番なので単位を足さない。
    expect(lookupPartType('diode')?.unitTex).toBeNull();
    expect(lookupPartType('switch')?.unitTex).toBeNull();
  });

  test('never uses a symbol the fence TeX cannot draw', () => {
    // eC はフォントが無く、例外ではなくプロセスごと落ちる (実機で確認)。
    const symbols = Object.values(PART_TYPES).map((type) => type.symbol);

    expect(symbols).not.toContain('eC');
    expect(symbols.some((symbol) => symbol.includes('op amp'))).toBe(false);
  });

  test('lists every type it knows', () => {
    expect(partTypeNames()).toContain('resistor');
    expect(partTypeNames().length).toBeGreaterThan(10);
  });

  test('does not answer for something that is not a type', () => {
    expect(lookupPartType('toString')).toBeNull();
    expect(lookupPartType('__proto__')).toBeNull();
  });
});

describe('closestPartType', () => {
  test('finds the type behind a typo', () => {
    expect(closestPartType('resistr')).toBe('resistor');
    expect(closestPartType('capasitor')).toBe('capacitor');
    expect(closestPartType('LED')).toBe('led');
  });

  test('finds the type behind a name that was cut short', () => {
    expect(closestPartType('induct')).toBe('inductor');
  });

  test('says nothing when there is nothing close', () => {
    expect(closestPartType('thyristor')).toBeNull();
    expect(closestPartType('')).toBeNull();
  });

  test('does not guess wildly at a short name', () => {
    // 2 文字違えば別物。`triac` に `diode` を勧めない。
    expect(closestPartType('triac')).toBeNull();
  });
});

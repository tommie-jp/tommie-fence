import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * **読めない値を既定で埋めない** (直下の CLAUDE.md の文法の方針 1)。
 * 以前は読めない抵抗値を茶黒黒金の帯で黙って描き、C の素の数を pF で読んでいた。
 */
const errorsOf = (parts: string): readonly string[] =>
  renderPerfboard(`board: 28x18\nparts:\n${parts}\n`).errors.map((error) => error.message);

describe('部品の値 — 読めない値を断る', () => {
  test('refuses a resistor value it cannot read, and marks the value', () => {
    const result = renderPerfboard('board: 28x18\nparts:\n  R1: resistor b3 b7 whatever\n');
    const error = result.errors.find((one) => one.message.includes('抵抗値'));

    expect(error?.line).toBe(3);
    expect(error?.message).toContain('330 / 4k7 / 1M / 10k 5%');
    expect(error?.token).toBe('whatever');
  });

  test('refuses two tolerances, and a tolerance that has no colour', () => {
    expect(errorsOf('  R1: resistor b3 b7 10k 1% 2%').join('\n')).toContain('抵抗値');
    expect(errorsOf('  R1: resistor b3 b7 10k 3%').join('\n')).toContain('3%');
  });

  test('refuses a bare number for a capacitor and an inductor', () => {
    expect(errorsOf('  C1: capacitor b3 b5 47').join('\n')).toContain('100n / 47p / 10u');
    expect(errorsOf('  L1: inductor b3 b7 1').join('\n')).toContain('100u / 10m');
  });

  test('keeps accepting a bare number of ohms, and prefixed values', () => {
    expect(errorsOf('  R1: resistor b3 b7 330\n  C1: capacitor d3 d5 100n\n  L1: inductor f3 f7 100u')).toEqual([]);
  });
});

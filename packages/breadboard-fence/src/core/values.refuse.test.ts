import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';

/**
 * **読めない値を既定で埋めない** (直下の CLAUDE.md の文法の方針 1)。
 * 以前は読めない抵抗値を茶黒黒金の帯で黙って描き、C の素の数を pF で読んでいた。
 */
const errorsOf = (parts: string): readonly string[] =>
  renderBreadboard(`parts:\n${parts}\n`).errors.map((error) => error.message);

describe('部品の値 — 読めない値を断る', () => {
  test('refuses a resistor value it cannot read, on the line it was written', () => {
    const result = renderBreadboard('parts:\n  R1: resistor a5 a10 whatever\n');
    const error = result.errors.find((one) => one.message.includes('抵抗値'));

    expect(error?.line).toBe(2);
    expect(error?.message).toContain('330 / 4k7 / 1M / 10k 5%');
  });

  test('refuses two tolerances, and a tolerance that has no colour', () => {
    expect(errorsOf('  R1: resistor a5 a10 10k 1% 2%').join('\n')).toContain('抵抗値');
    expect(errorsOf('  R1: resistor a5 a10 10k 3%').join('\n')).toContain('3%');
  });

  test('refuses the same in the map form', () => {
    const messages = errorsOf('  R1:\n    type: resistor\n    holes: [a5, a10]\n    value: whatever');

    expect(messages.join('\n')).toContain('抵抗値');
  });

  test('refuses a bare number for a capacitor and an inductor', () => {
    expect(errorsOf('  C1: capacitor a5 a8 47').join('\n')).toContain('100n / 47p / 10u');
    expect(errorsOf('  L1: inductor a5 a10 1').join('\n')).toContain('100u / 10m');
  });

  test('keeps accepting a bare number of ohms, and prefixed values', () => {
    expect(errorsOf('  R1: resistor a5 a10 330\n  C1: capacitor b5 b8 100n\n  L1: inductor c5 c10 100u'))
      .toEqual([]);
  });
});

import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';

/**
 * **数には単位を要る** (直下の CLAUDE.md の文法の方針 1)。
 * 以前は `capacitor a1 a3 47` を 47 F、`crystal … 16` を 16 Hz と黙って描いていた。
 * 素の数を受けるのは単位が 1 つに決まる所 (抵抗の Ω、電圧源の V) だけ。
 */
const compile = (part: string) => compileCircuit(`parts:\n  ${part}\n`);
const messages = (part: string): string => compile(part).errors.map((error) => error.message).join('\n');

describe('値の素の数', () => {
  test('refuses a bare number for a capacitor, an inductor, a crystal and a current source', () => {
    expect(messages('C1: capacitor a1 a3 47')).toContain('100n / 47p / 10u');
    expect(messages('C1: ecap a1 a3 100')).toContain('100n / 47p / 10u');
    expect(messages('L1: inductor a1 a3 1')).toContain('100u / 10m');
    expect(messages('X1: crystal a1 a3 16')).toContain('16M');
    expect(messages('I1: isource a1 a3 2')).toContain('1m');
  });

  test('says which line, and draws the part without the value', () => {
    const result = compile('C1: capacitor a1 a3 47');

    expect(result.errors[0]?.line).toBe(2);
    expect(result.tex).not.toContain('47');
  });

  test('keeps accepting a bare number of ohms and volts', () => {
    for (const part of ['R1: resistor a1 a3 330', 'V1: vsource a1 a3 5', 'B1: battery a1 a3 9', 'TL1: tline a1 a3 50']) {
      expect(messages(part)).toBe('');
    }
  });

  test('accepts a prefix, and a prefix with the unit, and reads both the same', () => {
    expect(messages('C1: capacitor a1 a3 47p')).toBe('');
    expect(messages('C1: capacitor a1 a3 47pF')).toBe('');
    expect(messages('C1: capacitor a1 a3 1F')).toBe('');
    expect(messages('X1: crystal a1 a3 16MHz')).toBe('');
    expect(compile('C1: capacitor a1 a3 47pF').tex).toContain('a^=$47\\,\\mathrm{p}\\mathrm{F}$');
    expect(compile('C1: capacitor a1 a3 47p').tex).toContain('a^=$47\\,\\mathrm{p}\\mathrm{F}$');
    expect(compile('V1: vsource a1 a3 5V').tex).toContain('a^=$5\\,\\mathrm{V}$');
  });

  test('refuses a capital K, which it would draw as it is written', () => {
    expect(messages('R1: resistor a1 a3 100K')).toContain('小文字の k');
    expect(messages('C1: capacitor a1 a3 4.7K')).toContain('小文字の k');
  });

  test('leaves alone the values that are not numbers of the unit', () => {
    for (const part of ['D1: diode a1 a3 1N4148', 'F1: fuse a1 a3 3A', 'R1: resistor a1 a3 4k7']) {
      expect(messages(part)).toBe('');
    }
  });
});

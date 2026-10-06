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
    expect(messages('C1: capacitor 1,1 3,1 47')).toContain('100n / 47p / 10u');
    expect(messages('C1: ecap 1,1 3,1 100')).toContain('100n / 47p / 10u');
    expect(messages('L1: inductor 1,1 3,1 1')).toContain('100u / 10m');
    expect(messages('X1: crystal 1,1 3,1 16')).toContain('16M');
    expect(messages('I1: isource 1,1 3,1 2')).toContain('1m');
  });

  test('says which line, and draws the part without the value', () => {
    const result = compile('C1: capacitor 1,1 3,1 47');

    expect(result.errors[0]?.line).toBe(2);
    expect(result.tex).not.toContain('47');
  });

  test('keeps accepting a bare number of ohms and volts', () => {
    for (const part of ['R1: resistor 1,1 3,1 330', 'V1: vsource 1,1 3,1 5', 'B1: battery 1,1 3,1 9', 'TL1: tline 1,1 3,1 50']) {
      expect(messages(part)).toBe('');
    }
  });

  test('accepts a prefix, and a prefix with the unit, and reads both the same', () => {
    expect(messages('C1: capacitor 1,1 3,1 47p')).toBe('');
    expect(messages('C1: capacitor 1,1 3,1 47pF')).toBe('');
    expect(messages('C1: capacitor 1,1 3,1 1F')).toBe('');
    expect(messages('X1: crystal 1,1 3,1 16MHz')).toBe('');
    expect(compile('C1: capacitor 1,1 3,1 47pF').tex).toContain('a^=$47\\,\\mathrm{p}\\mathrm{F}$');
    expect(compile('C1: capacitor 1,1 3,1 47p').tex).toContain('a^=$47\\,\\mathrm{p}\\mathrm{F}$');
    expect(compile('V1: vsource 1,1 3,1 5V').tex).toContain('a^=$5\\,\\mathrm{V}$');
  });

  test('refuses a capital K, which it would draw as it is written', () => {
    expect(messages('R1: resistor 1,1 3,1 100K')).toContain('小文字の k');
    expect(messages('C1: capacitor 1,1 3,1 4.7K')).toContain('小文字の k');
  });

  test('leaves alone the values that are not numbers of the unit', () => {
    for (const part of ['D1: diode 1,1 3,1 1N4148', 'F1: fuse 1,1 3,1 3A', 'R1: resistor 1,1 3,1 4k7']) {
      expect(messages(part)).toBe('');
    }
  });
});

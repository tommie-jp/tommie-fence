import { describe, expect, test } from 'vitest';
import { compileCircuit } from '../index.ts';
import type { TexTarget } from '../types.ts';

/**
 * 値の記号が、どのフォントの何番の字として組まれるか。
 *
 * TeX の数式は `.` を cmmi (数式の斜体) の 0x3A 番、`/` を同じく 0x3D 番で組む。
 * 描き上がった SVG には**番号がそのまま** `:` と `=` の字で入るので、TeX のフォントを
 * 読まない描き手 (librsvg・sharp で焼いた PNG、`--embed-fonts` 無しの SVG、字の検索や
 * 写し取り) では `AMS1117-3.3` が `3:3`、`6V/12V` が `6V=12V` に見えた
 * (教科書の 01-circuits 第 5・6 章)。`-` も数式では cmsy の 0 番 (引き算の −) になる。
 *
 * 文字の組 (`\mbox{…}`) に入れると cmr の字になり、番号が ASCII と同じになる
 * (`.` 0x2E、`/` 0x2F、`-` 0x2D)。どの描き手でも書いたとおりの字で読める。
 */
const texOf = (part: string, target: TexTarget = 'fence'): string =>
  compileCircuit(`parts:\n  ${part}\n`, { target }).tex ?? '';

/** TeX の中の `$…$` の中身を全部。 */
const mathOf = (tex: string): string[] => [...tex.matchAll(/\$([^$]*)\$/g)].map((match) => match[1] ?? '');

/** 文字の組に入れた字を除いた、数式の字だけ。 */
const bareMath = (math: string): string => math.replace(/\\mbox\{[^}]*\}/g, '');

/** 数式で組むと ASCII と違う番号の字になる記号。 */
const MATH_FONT_PUNCTUATION = /[./-]/;

describe('値の記号は書いたとおりの字で組む', () => {
  test('sets the dot of a part number as text, not as the math italic period (AMS1117-3.3)', () => {
    expect(texOf('U1: regulator 6,2 AMS1117-3.3')).toContain('{$\\mathrm{AMS1117\\mbox{-}3\\mbox{.}3}$}');
  });

  test('sets a slash as text, not as the math italic slash (6V/12V)', () => {
    expect(texOf('T1: transformer 5,3 6V/12V')).toContain('{$\\mathrm{6V\\mbox{/}12V}$}');
  });

  test('sets the decimal point of a value with a unit as text (8.5 V, 4.7 kΩ, 1.5 µF)', () => {
    expect(texOf('V1: sine 2,2 2,4 8.5')).toContain('a^=$8\\mbox{.}5\\,\\mathrm{V}$');
    expect(texOf('R1: resistor 1,1 3,1 4.7k')).toContain('a^=$4\\mbox{.}7\\,\\mathrm{k}\\Omega$');
    expect(texOf('C1: capacitor 1,1 3,1 1.5u')).toContain('a^=$1\\mbox{.}5\\,\\mu\\mathrm{F}$');
  });

  test('leaves the decimal point to siunitx in the written .tex', () => {
    expect(texOf('V1: sine 2,2 2,4 8.5', 'latex')).toContain('\\qty{8.5}{\\volt}');
  });

  test('never leaves . / - bare in math, whatever value carries them', () => {
    const parts = [
      'U1: regulator 6,2 AMS1117-3.3',
      'U1: regulator 6,2 LM2596S-ADJ',
      'T1: transformer 5,3 6V/12V',
      'T1: transformer 5,3 100V/6.3V',
      'D1: diode 1,1 3,1 1N4148',
      'F1: fuse 1,1 3,1 0.5A',
      'R1: resistor 1,1 3,1 1.2k',
      'C1: capacitor 1,1 3,1 0.1u',
      'X1: crystal 1,1 3,1 7.3728M',
      'V1: vsource 1,1 3,1 3.3',
      'F1: fuse 1,1 3,1 1A/250V',
      'D1: diode 1,1 3,1 HZ5.1-B',
    ];
    for (const part of parts) {
      for (const target of ['fence', 'latex'] as const) {
        const tex = texOf(part, target);
        // 値の組を取り出す (部品の名前の `$R_{1}$` などは記号を含まない)。
        for (const math of mathOf(tex)) {
          expect(bareMath(math), `${part} (${target}): $${math}$`).not.toMatch(MATH_FONT_PUNCTUATION);
        }
      }
    }
  });

  test('keeps + % ( ) _ in math, whose glyphs sit at their ASCII numbers in cmr', () => {
    // + は cmr の 0x2B、( ) は 0x28・0x29、\% は cmr の 0x25、\_ は罫線で字ではない。
    // どれも番号が ASCII と同じなので、組み方を変えない (図の見た目を動かさない)。
    expect(texOf('D1: diode 1,1 3,1 BAT54(SOD)')).toContain('$\\mathrm{BAT54(SOD)}$');
    expect(texOf('F1: fuse 1,1 3,1 +5V')).toContain('$\\mathrm{+5V}$');
    expect(texOf('R1: resistor 1,1 3,1 1%')).toContain('$\\mathrm{1\\%}$');
    expect(texOf('D1: diode 1,1 3,1 BZX_5V1')).toContain('$\\mathrm{BZX\\_5V1}$');
  });
});

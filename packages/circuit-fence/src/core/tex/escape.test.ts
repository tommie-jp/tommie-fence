import { describe, expect, test } from 'vitest';
import { escapeTex, hasUnicode, isAscii, isDrawable } from './escape.ts';

describe('isDrawable', () => {
  test('accepts the values a schematic is written with', () => {
    expect(isDrawable('10k', 'fence')).toBe(true);
    expect(isDrawable('100n', 'fence')).toBe(true);
    expect(isDrawable('4.7k', 'fence')).toBe(true);
    expect(isDrawable('+5V', 'fence')).toBe(true);
    expect(isDrawable('1/2W', 'fence')).toBe(true);
  });

  test('accepts an empty text', () => {
    expect(isDrawable('', 'fence')).toBe(true);
  });

  test('rejects a character that would let the writer build their own TeX', () => {
    expect(isDrawable('\\draw', 'fence')).toBe(false);
    expect(isDrawable('${x}', 'fence')).toBe(false);
    expect(isDrawable('a^2', 'fence')).toBe(false);
    expect(isDrawable('a&b', 'fence')).toBe(false);
    expect(isDrawable('#1', 'fence')).toBe(false);
    expect(isDrawable('~', 'fence')).toBe(false);
  });

  test('rejects the two characters circuitikz reads as option separators', () => {
    // to[..., l=..., a=...] の中では区切りとして読まれ、波括弧でも守れない。
    expect(isDrawable('1,5k', 'fence')).toBe(false);
    expect(isDrawable('a=b', 'fence')).toBe(false);
  });

  test('rejects text the fence TeX has no font for', () => {
    expect(isDrawable('入力', 'fence')).toBe(false);
    expect(isDrawable('10µF', 'fence')).toBe(false);
  });

  test('accepts japanese and the unit signs when the target is latex', () => {
    // 書き出した .tex はフォントを積める。フェンスで通らない字はここで通す。
    expect(isDrawable('入力', 'latex')).toBe(true);
    expect(isDrawable('電池 9V', 'latex')).toBe(true);
    expect(isDrawable('ひらがなとカタカナ', 'latex')).toBe(true);
    expect(isDrawable('10µF', 'latex')).toBe(true);
    expect(isDrawable('10kΩ', 'latex')).toBe(true);
  });

  test('takes either spelling of the two unit signs that have a look-alike', () => {
    // データシートから貼った値がどちらで来るかは選べない。
    expect(isDrawable('µF', 'latex')).toBe(true); // micro sign
    expect(isDrawable('μF', 'latex')).toBe(true); // greek small mu
    expect(isDrawable('Ω', 'latex')).toBe(true); // greek capital omega
    expect(isDrawable('Ω', 'latex')).toBe(true); // ohm sign
  });

  test('keeps the gate closed on TeX syntax even when the target is latex', () => {
    // 通す字を広げるのは字の話。任意の TeX を書かせないという約束は動かさない。
    expect(isDrawable('\\draw', 'latex')).toBe(false);
    expect(isDrawable('${x}', 'latex')).toBe(false);
    expect(isDrawable('a&b', 'latex')).toBe(false);
    expect(isDrawable('1,5k', 'latex')).toBe(false);
    expect(isDrawable('a=b', 'latex')).toBe(false);
    // 見た目が近くても、通していない字は通さない。
    expect(isDrawable('한글', 'latex')).toBe(false);
    expect(isDrawable('emoji 🙂', 'latex')).toBe(false);
  });
});

describe('isAscii', () => {
  test('tells apart the text a font is missing for', () => {
    expect(isAscii('10k')).toBe(true);
    expect(isAscii('入力')).toBe(false);
    expect(isAscii('10µF')).toBe(false);
  });
});

describe('hasUnicode', () => {
  test('finds the text that needs a font the standard TeX fonts do not have', () => {
    expect(hasUnicode('電池 9V')).toBe(true);
    expect(hasUnicode('10µF')).toBe(true);
    expect(hasUnicode('10k')).toBe(false);
    expect(hasUnicode('')).toBe(false);
  });
});

describe('escapeTex', () => {
  test('leaves an ordinary value alone', () => {
    expect(escapeTex('10k')).toBe('10k');
  });

  test('escapes the characters TeX would read as its own', () => {
    expect(escapeTex('a_b')).toBe('a\\_b');
    expect(escapeTex('50%')).toBe('50\\%');
  });
});

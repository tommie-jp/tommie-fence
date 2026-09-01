import { describe, expect, test } from 'vitest';
import { BAND_COLORS, DEFAULT_LED_COLOR, LED_COLORS, bandColor, ledColor } from './colors.ts';

describe('ledColor', () => {
  test('looks a colour up whatever case it was written in', () => {
    expect(ledColor('red')).toBe(LED_COLORS.red);
    expect(ledColor('GREEN')).toBe(LED_COLORS.green);
  });

  test('returns null for a colour it does not have, so the caller can decide', () => {
    expect(ledColor('chartreuse')).toBeNull();
  });

  test('cannot be tricked into returning something off Object.prototype', () => {
    // 素の添字だと `constructor` の中身がそのまま fill 属性へ流れ込む。
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(ledColor(name)).toBeNull();
    }
  });
});

describe('bandColor', () => {
  test('gives the colour of a band', () => {
    expect(bandColor('brown')).toBe(BAND_COLORS.brown);
  });

  test('falls back to black rather than leaving a band unpainted', () => {
    expect(bandColor('nosuch')).toBe(BAND_COLORS.black);
    expect(bandColor('constructor')).toBe(BAND_COLORS.black);
  });
});

describe('the tables themselves', () => {
  test('are every one a plain hex colour, so nothing else reaches an attribute', () => {
    for (const table of [BAND_COLORS, LED_COLORS]) {
      for (const value of Object.values(table)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
    expect(DEFAULT_LED_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

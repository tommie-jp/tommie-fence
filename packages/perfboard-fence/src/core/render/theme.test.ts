import { describe, expect, test } from 'vitest';
import { THEME, THEMES, resolveStyle } from './theme.ts';
import { EMPTY_STYLE } from '../parser/style.ts';
import type { StyleSpec } from '../types.ts';
import { THEME_NAMES } from '../limits.ts';

describe('THEMES', () => {
  test('has every theme the parser accepts', () => {
    for (const name of THEME_NAMES) expect(THEMES[name]).toBeDefined();
  });

  test('paints every colour a theme needs', () => {
    for (const theme of Object.values(THEMES)) {
      for (const [name, colour] of Object.entries(theme.palette)) {
        // 地だけは「塗らない」を選べる (透かして貼った先の背景を見せる)。
        if (name === 'canvas' && colour === null) continue;
        expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  test('gives a theme that darkens the page a ground to stand on', () => {
    // **板の外の字は地の上に乗る。** 明るい字を透かした地に置くと、白い紙に
    // 貼ったときに黙って消える。地を変えるテーマは必ず自分で塗る。
    expect(THEMES.dark?.palette.canvas).not.toBeNull();
    expect(THEMES.mono?.palette.canvas).not.toBeNull();
    expect(THEMES.light?.palette.canvas).toBeNull();
  });

  test('keeps the same measurements in every theme, so the drawing does not move', () => {
    // 配色だけがテーマで動く。同じフェンスを別のテーマで出しても位置は変わらない。
    for (const theme of Object.values(THEMES)) {
      expect(theme.metrics).toEqual(THEME.metrics);
    }
  });
});

describe('resolveStyle', () => {
  test('falls back to light when nothing was written', () => {
    expect(resolveStyle(EMPTY_STYLE).theme).toBe(THEME);
  });

  test('picks the theme that was written', () => {
    expect(resolveStyle({ ...EMPTY_STYLE, theme: 'dark' }).theme).toBe(THEMES.dark);
  });

  test('falls back rather than throwing on a theme it does not have', () => {
    // 型では通らない道 (`ThemeName`)。**ライブラリとして呼ぶ側が素の値を
    // 組んでも落ちない**ことを見る — `core` は出口として公開している。
    const written = { ...EMPTY_STYLE, theme: 'nosuch' } as unknown as StyleSpec;

    expect(resolveStyle(written).theme).toBe(THEME);
  });

  test('says notices by default, and stamps nothing', () => {
    expect(resolveStyle(EMPTY_STYLE)).toMatchObject({ debug: true, stamp: false, width: null });
  });

  test('takes what was written', () => {
    expect(resolveStyle({ theme: 'mono', width: 800, debug: false, stamp: true }))
      .toMatchObject({ width: 800, debug: false, stamp: true });
  });
});

import { describe, expect, test } from 'vitest';
import { EMPTY_STYLE } from '../parser/style.ts';
import type { Palette } from './theme.ts';
import { DEFAULT_THEME_NAME, THEMES, THEME_NAMES, resolveStyle } from './theme.ts';

const HEX = /^#[0-9a-f]{6}$/i;

const channel = (value: number): number => {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG のコントラスト比。1 (同じ色) 〜 21 (黒と白)。 */
const contrast = (a: string, b: string): number => {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const themeNamed = (name: string) => THEMES[name] ?? THEMES.classic!;

/** 文字とその下地。読めなくなったら図の意味が無いので、本文と同じ 4.5:1 を要求する。 */
const TEXT_PAIRS: readonly (readonly [keyof Palette, keyof Palette])[] = [
  ['partText', 'plate'],
  ['label', 'plate'],
  ['chipText', 'chipBody'],
  ['deviceText', 'deviceBody'],
  ['errorInk', 'errorPlate'],
];

/** 文字ではない目印。WCAG 1.4.11 と同じ 3:1。 */
const SHAPE_PAIRS: readonly (readonly [keyof Palette, keyof Palette])[] = [
  ['chipPin', 'chipBody'],
  ['positive', 'plate'],
  ['negative', 'plate'],
];

describe('THEMES', () => {
  test('offers the five themes the documentation promises', () => {
    expect(THEME_NAMES).toEqual(['classic', 'dark', 'high-contrast', 'mono', 'presentation']);
  });

  test.each(THEME_NAMES)('%s names itself so the resolved style can be reported', (name) => {
    expect(themeNamed(name).name).toBe(name);
  });

  test.each(THEME_NAMES)('%s writes every colour as a plain hex literal', (name) => {
    for (const [key, value] of Object.entries(themeNamed(name).palette)) {
      if (value === null) continue;
      expect(value, `${name}.${key}`).toMatch(HEX);
    }
  });

  test.each(THEME_NAMES)('%s keeps every caption readable on what it sits on', (name) => {
    const { palette } = themeNamed(name);

    for (const [ink, ground] of TEXT_PAIRS) {
      expect(contrast(palette[ink] as string, palette[ground] as string), `${name}: ${ink} / ${ground}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  test.each(THEME_NAMES)('%s keeps the marks that are not text visible too', (name) => {
    const { palette } = themeNamed(name);

    for (const [mark, ground] of SHAPE_PAIRS) {
      expect(contrast(palette[mark] as string, palette[ground] as string), `${name}: ${mark} / ${ground}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  test.each(THEME_NAMES)('%s separates the holes from the board, by a rim where the fill does not', (name) => {
    const { hole, holeEdge, plate } = themeNamed(name).palette;
    // 穴は格子として読めればよいので、塗りで差が付かないテーマは縁で立たせる。
    const separation = Math.max(contrast(hole, plate), holeEdge === null ? 0 : contrast(holeEdge, plate));

    expect(separation, `${name}: hole (or its rim) / plate`).toBeGreaterThanOrEqual(3);
  });

  test.each(THEME_NAMES)('%s keeps the error ink red so a mistake always reads as one', (name) => {
    const { errorInk } = themeNamed(name).palette;
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => parseInt(errorInk.slice(start, start + 2), 16));

    expect(r > g && r > b, `${name}: errorInk ${errorInk} is the reddest channel`).toBe(true);
  });

  test('leaves classic exactly as the drawing has always been', () => {
    const classic = themeNamed('classic');

    expect(classic.metrics).toEqual({ textSize: 10, boardTextScale: 1, wireWidth: 3.4, holeSize: 5.2 });
    // 透明のまま = 貼り先の地の色が透ける。既存の図の見え方を変えないための約束。
    expect(classic.palette.canvas).toBeNull();
    expect(classic.palette.holeEdge).toBeNull();
    expect(classic.palette.wireHalo).toBeNull();
  });

  test.each(THEME_NAMES.filter((name) => name !== 'classic'))('%s paints a background of its own', (name) => {
    expect(themeNamed(name).palette.canvas).toMatch(HEX);
  });

  test('draws presentation larger than classic without changing its colours', () => {
    const classic = themeNamed('classic');
    const presentation = themeNamed('presentation');

    expect(presentation.metrics.textSize).toBeGreaterThan(classic.metrics.textSize);
    expect(presentation.metrics.wireWidth).toBeGreaterThan(classic.metrics.wireWidth);
    expect(presentation.palette.plate).toBe(classic.palette.plate);
    expect(presentation.palette.partText).toBe(classic.palette.partText);
  });
});

describe('resolveStyle', () => {
  test('draws in the default theme when nothing is asked for', () => {
    const { style, messages } = resolveStyle(EMPTY_STYLE);

    expect(style.theme).toEqual(themeNamed(DEFAULT_THEME_NAME));
    expect(style.width).toBeNull();
    expect(messages).toEqual([]);
  });

  test('defaults to presentation, so a plain fence comes out big enough to paste somewhere', () => {
    // 既定を動かすと `style:` の無い図が全部変わる。変えるなら意識して変える。
    expect(DEFAULT_THEME_NAME).toBe('presentation');
  });

  test('picks the named theme', () => {
    expect(resolveStyle({ ...EMPTY_STYLE, theme: 'dark' }).style.theme).toEqual(themeNamed('dark'));
  });

  test('lists the names it knows when the theme is not one of them', () => {
    const { style, messages } = resolveStyle({ ...EMPTY_STYLE, theme: 'darkk' });

    expect(style.theme.name).toBe(DEFAULT_THEME_NAME);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('high-contrast');
  });

  test('treats a theme name inherited from Object.prototype as unknown', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      const { style, messages } = resolveStyle({ ...EMPTY_STYLE, theme: name });

      expect(style.theme.name).toBe(DEFAULT_THEME_NAME);
      expect(messages).toHaveLength(1);
    }
  });

  test('lets a key win over the theme it was written next to', () => {
    const { style } = resolveStyle({ ...EMPTY_STYLE, theme: 'dark', textSize: 15, holeColor: '#ff0000' });

    expect(style.theme.metrics.textSize).toBe(15);
    expect(style.theme.palette.hole).toBe('#ff0000');
    // 上書きしなかったところはテーマのまま。
    expect(style.theme.palette.plate).toBe(themeNamed('dark').palette.plate);
    expect(style.theme.name).toBe('dark');
  });

  test('moves the halo behind captions with the board colour so it never shows the old one', () => {
    const { style } = resolveStyle({ ...EMPTY_STYLE, boardColor: '#202020' });

    expect(style.theme.palette.plate).toBe('#202020');
    expect(style.theme.palette.textHalo).toBe('#202020');
  });

  test('keeps an explicit text background even when the board colour moves', () => {
    const { style } = resolveStyle({ ...EMPTY_STYLE, boardColor: '#202020', textBackground: '#00ff00' });

    expect(style.theme.palette.textHalo).toBe('#00ff00');
  });

  test('derives the edge and the ravine from a board colour it was given', () => {
    const { style } = resolveStyle({ ...EMPTY_STYLE, boardColor: '#808080' });
    const { plate, plateEdge, ravine } = style.theme.palette;

    // 地の色だけ変えて縁と溝が元の板の色のまま浮くのを防ぐ。どちらも板より暗い側へ寄せる。
    expect(plateEdge).not.toBe(themeNamed('classic').palette.plateEdge);
    expect(luminance(ravine)).toBeLessThan(luminance(plate));
    expect(luminance(plateEdge)).toBeLessThan(luminance(ravine));
    expect(plateEdge).toMatch(HEX);
    expect(ravine).toMatch(HEX);
  });

  test('carries the output width through untouched', () => {
    expect(resolveStyle({ ...EMPTY_STYLE, width: 1200 }).style.width).toBe(1200);
  });
});

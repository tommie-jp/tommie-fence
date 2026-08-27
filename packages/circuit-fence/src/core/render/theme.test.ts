import { describe, expect, test } from 'vitest';
import { DEFAULT_NOTE_SIZE, NOTE_COLORS, notePt } from '../notes.ts';
import { EMPTY_STYLE } from '../parser/style.ts';
import {
  DEFAULT_THEME_NAME, THEME_NAMES, recolorSvg, resizeSvg, resolveTheme, scaleSvgToText,
} from './theme.ts';

/** 何も書かれていない `style:`。写して持つと項目が増えたときにずれる。 */
const EMPTY = EMPTY_STYLE;

const svg = (body: string): string => `<svg viewBox="0 0 10 10" width="100" height="80">${body}</svg>`;

describe('resolveTheme', () => {
  test('follows the editor by default, so the drawing reads in light and dark', () => {
    const { theme, messages } = resolveTheme(EMPTY);

    expect(messages).toEqual([]);
    expect(theme.name).toBe(DEFAULT_THEME_NAME);
    expect(theme.ink).toBe('currentColor');
  });

  test('gives every theme its own ink', () => {
    for (const name of THEME_NAMES) {
      expect(resolveTheme({ ...EMPTY, theme: name }).theme.ink.length).toBeGreaterThan(0);
    }
  });

  test('says which themes it knows when given one it does not', () => {
    const { theme, messages } = resolveTheme({ ...EMPTY, theme: 'solarized' });

    expect(messages[0]).toContain('light');
    expect(theme.name).toBe(DEFAULT_THEME_NAME);
  });

  test('lets a single colour be overridden without leaving the theme', () => {
    const { theme } = resolveTheme({ ...EMPTY, theme: 'light', inkColor: '#ff0000' });

    expect(theme.ink).toBe('#ff0000');
    expect(theme.paper).toBe(resolveTheme({ ...EMPTY, theme: 'light' }).theme.paper);
  });
});

describe('recolorSvg', () => {
  const light = resolveTheme({ ...EMPTY, theme: 'light' }).theme;

  test('paints the circuit with the theme ink', () => {
    expect(recolorSvg(svg('<path stroke="#000"/>'), light)).toContain(`stroke="${light.ink}"`);
  });

  test('paints a filled symbol with the same ink', () => {
    expect(recolorSvg(svg('<path fill="#000"/>'), light)).toContain(`fill="${light.ink}"`);
  });

  test('paints the hollow terminal with the paper colour', () => {
    expect(recolorSvg(svg('<g fill="#fff"/>'), light)).toContain(`fill="${light.paper}"`);
  });

  test('paints the grid with its own colour so it stays behind the circuit', () => {
    const out = recolorSvg(svg('<path stroke="gray"/><path fill="gray"/>'), light);

    expect(out).toContain(`stroke="${light.grid}"`);
    expect(out).toContain(`fill="${light.grid}"`);
  });

  test('leaves none alone, which means "do not paint"', () => {
    expect(recolorSvg(svg('<path fill="none" stroke="none"/>'), light)).toContain('fill="none" stroke="none"');
  });

  test('paints a shape that carries no fill of its own, like the junction dot', () => {
    // circuitikz の circ は塗りを書かずに SVG の既定 (黒) に頼る。
    // 何も当てないと、暗いテーマで地に沈んで消える。
    const out = recolorSvg(svg('<path d="M0 0"/>'), light);

    expect(out).toMatch(new RegExp(`<svg[^>]*fill="${light.ink}"`));
  });

  test('does not touch a colour it was not asked about', () => {
    expect(recolorSvg(svg('<path stroke="#123456"/>'), light)).toContain('stroke="#123456"');
  });

  test('keeps the drawing readable in dark without a second render', () => {
    const dark = resolveTheme({ ...EMPTY, theme: 'dark' }).theme;
    const drawing = svg('<path stroke="#000"/>');

    expect(recolorSvg(drawing, dark)).not.toBe(recolorSvg(drawing, light));
  });
});

describe('resizeSvg', () => {
  test('leaves the drawing at its natural size when no width is asked for', () => {
    expect(resizeSvg(svg(''), null)).toContain('width="100"');
  });

  test('scales the outside while keeping the coordinates', () => {
    const out = resizeSvg(svg(''), 200);

    expect(out).toContain('width="200"');
    expect(out).toContain('height="160"');
    expect(out).toContain('viewBox="0 0 10 10"');
  });

  test('leaves a drawing it cannot measure alone', () => {
    expect(resizeSvg('<svg viewBox="0 0 10 10"></svg>', 200)).toBe('<svg viewBox="0 0 10 10"></svg>');
  });
});

/**
 * 図の大きさを、読み手のプレビューの地の文に合わせる。
 * SVG の viewBox の 1 は、図の中の font-size の 1 と同じ物差し
 * (注釈の `normal` は font-size="8" で出る)。
 */
describe('scaleSvgToText', () => {
  const DRAWING = '<svg viewBox="0 0 80 40" width="106.667" height="53.333"></svg>';

  test('writes the outside size in em, so it follows the reader\'s text size', () => {
    expect(scaleSvgToText(svg(''))).toMatch(/width="[\d.]+em"/);
  });

  // 1 em = normal の注釈。これで書き出しが地の文と同じ大きさで読める。
  // 倍率は表から引く (段をずらしてもテストが古びない)。
  const em = (viewBox: number): string => String(Math.round((viewBox / notePt(DEFAULT_NOTE_SIZE)) * 1000) / 1000);

  test('makes one em the size a normal note is drawn at', () => {
    expect(scaleSvgToText(DRAWING)).toContain(`width="${em(80)}em"`);
  });

  test('takes the height along, so the drawing keeps its shape', () => {
    expect(scaleSvgToText(DRAWING)).toContain(`height="${em(40)}em"`);
  });

  test('leaves the coordinates alone, so the drawing does not move', () => {
    expect(scaleSvgToText(svg(''))).toContain('viewBox="0 0 10 10"');
  });

  // プレビューの CSP は inline style を落とすことがある。属性なら CSP の外にある。
  test('writes the size as an attribute rather than an inline style', () => {
    expect(scaleSvgToText(DRAWING)).not.toContain('style=');
  });

  test('leaves a drawing without a viewBox alone', () => {
    expect(scaleSvgToText('<svg width="100" height="80"></svg>')).toBe('<svg width="100" height="80"></svg>');
  });

  test('leaves a drawing it cannot measure alone', () => {
    expect(scaleSvgToText('<svg viewBox="0 0 80 40"></svg>')).toBe('<svg viewBox="0 0 80 40"></svg>');
  });
});

describe('recolorSvg の mono', () => {
  const mono = resolveTheme({ ...EMPTY_STYLE, theme: 'mono' }).theme;
  const dark = resolveTheme({ ...EMPTY_STYLE, theme: 'dark' }).theme;
  const noted = svg(`<path stroke="${NOTE_COLORS.red}"/><text fill="${NOTE_COLORS.blue}">あ</text>`);

  test('paints the notes with the ink too, because mono means one colour', () => {
    // 「黒一色」と説明している以上、注釈だけ色が残ると説明が嘘になる
    // (資料に貼る・印刷するためのテーマなので、色が漏れると困る)。
    const painted = recolorSvg(noted, mono);

    expect(painted).not.toContain(NOTE_COLORS.red);
    expect(painted).not.toContain(NOTE_COLORS.blue);
    expect(painted).toContain(`stroke="${mono.ink}"`);
    expect(painted).toContain(`fill="${mono.ink}"`);
  });

  test('leaves the notes coloured in every other theme', () => {
    const painted = recolorSvg(noted, dark);

    expect(painted).toContain(NOTE_COLORS.red);
    expect(painted).toContain(NOTE_COLORS.blue);
  });

  test('still paints the circuit with the ink the writer chose', () => {
    const painted = recolorSvg(svg('<path stroke="#000"/>'), { ...mono, ink: '#333333' });

    expect(painted).toContain('stroke="#333333"');
  });
});

describe('recolorSvg の塗り替えは 1 回で決まる', () => {
  // 順に置き換えると、**塗り替えた色をもう一度拾ってしまう**。
  // ink に白を書いた図では、回路も注釈も次の行で地の色に塗り直されて消える。
  const inverted = resolveTheme({
    ...EMPTY_STYLE, theme: 'mono', inkColor: '#ffffff', paperColor: '#000000',
  }).theme;

  test('paints the circuit with the ink even when the ink is the other theme colour', () => {
    expect(recolorSvg(svg('<path stroke="#000000"/>'), inverted)).toContain('stroke="#ffffff"');
  });

  test('paints a note with the ink without painting it again', () => {
    // 根に足す塗りも同じ色なので、字のほうを名指しで見る。
    const painted = recolorSvg(svg(`<text fill="${NOTE_COLORS.red}">あ</text>`), inverted);

    expect(painted).toContain('<text fill="#ffffff">あ</text>');
  });

  test('still paints the hollow terminal with the paper colour', () => {
    expect(recolorSvg(svg('<g fill="#fff"/>'), inverted)).toContain('fill="#000000"');
  });
});

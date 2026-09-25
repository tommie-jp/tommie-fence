import { describe, expect, test } from 'vitest';
import { embedFonts, texFontFamilies } from './fonts.ts';

const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
  '<text font-family="cmr10">10</text>',
  '<text font-family="cmmi10">R</text>',
  '<text font-family="cmr10">¬</text>',
  `<text font-family="'Noto Sans CJK JP',sans-serif">題</text>`,
  '</svg>',
].join('');

describe('texFontFamilies', () => {
  test('lists each TeX font the drawing uses, once, in order of first use', () => {
    expect(texFontFamilies(SVG)).toEqual(['cmr10', 'cmmi10']);
  });

  test('leaves out the ordinary font stacks the notes use', () => {
    // 注釈と題の字は Unicode で、読み手のフォントで正しく出る。埋め込む先は TeX のフォントだけ。
    expect(texFontFamilies(SVG).some((family) => family.includes('Noto'))).toBe(false);
  });
});

describe('embedFonts', () => {
  const fonts = new Map([
    ['cmr10', 'AAAA'],
    ['cmmi10', 'BBBB'],
  ]);

  test('puts a font-face for each font right after the root element', () => {
    const out = embedFonts(SVG, fonts);

    expect(out).toMatch(/^<svg [^>]*><style data-circuit-fonts="">/);
    expect(out).toContain('@font-face{font-family:cmr10;src:url(data:font/ttf;base64,AAAA)}');
    expect(out).toContain('@font-face{font-family:cmmi10;src:url(data:font/ttf;base64,BBBB)}');
  });

  test('embeds only the fonts the drawing uses', () => {
    const out = embedFonts('<svg><text font-family="cmr10">1</text></svg>', fonts);

    expect(out).toContain('font-family:cmr10;');
    expect(out).not.toContain('cmmi10');
  });

  test('leaves the drawing as it is when none of its fonts are at hand', () => {
    expect(embedFonts(SVG, new Map())).toBe(SVG);
  });

  test('does not embed twice when run again on its own output', () => {
    const once = embedFonts(SVG, fonts);

    expect(embedFonts(once, fonts)).toBe(once);
  });

  test('ignores a font name that could break out of the style sheet', () => {
    // 名前は TeX のフォント名の形 (英小文字 + 数字) だけを通す。
    const hostile = '<svg><text font-family="cmr10;}x{">1</text></svg>';

    expect(embedFonts(hostile, new Map([['cmr10;}x{', 'AAAA']]))).toBe(hostile);
  });
});

import { describe, expect, test } from 'vitest';
import { renderSourceListing, sourceBandSize, sourceListing } from './sourceListing.ts';
import { THEME } from './theme.ts';
import { LIMITS } from '../limits.ts';

const band = { x: 20, y: 200, width: 400, height: 100 };

describe('sourceListing', () => {
  test('wraps the fence in its own markers, so the drawing can be copied back', () => {
    expect(sourceListing('board: 12x7\n')).toEqual(['```perfboard', 'board: 12x7', '```']);
  });

  test('drops the blank lines at the end, which the fence never had', () => {
    expect(sourceListing('board: 12x7\n\n\n')).toEqual(['```perfboard', 'board: 12x7', '```']);
  });

  test('keeps the indentation, since that is what YAML reads', () => {
    expect(sourceListing('parts:\n  R1: resistor b3 b6 1k\n')).toContain('  R1: resistor b3 b6 1k');
  });

  test('caps a long fence and says how much it left out, rather than cutting silently', () => {
    const lines = sourceListing(`${'board: 12x7\n'.repeat(LIMITS.sourceLines + 5)}`);

    expect(lines.length).toBe(LIMITS.sourceLines + 3);
    expect(lines[lines.length - 2]).toContain('ほかに 5 行');
  });

  test('adds no line numbers, so what is written can be written back', () => {
    expect(sourceListing('board: 12x7\n').some((line) => /^\s*\d+[:|]/.test(line))).toBe(false);
  });
});

describe('sourceBandSize', () => {
  test('grows with the number of lines', () => {
    const one = sourceBandSize(['board: 12x7'], THEME);
    const three = sourceBandSize(['```perfboard', 'board: 12x7', '```'], THEME);

    expect(three.height).toBeGreaterThan(one.height);
  });

  test('grows with the longest line, so the listing is not cut to fit', () => {
    const short = sourceBandSize(['R1: resistor'], THEME);
    const long = sourceBandSize(['R1: resistor', 'R1: resistor b3 b6 1k and a much longer line'], THEME);

    expect(long.width).toBeGreaterThan(short.width);
  });

  test('takes nothing when there is nothing to write out', () => {
    expect(sourceBandSize([], THEME)).toEqual({ width: 0, height: 0 });
  });
});

describe('renderSourceListing', () => {
  test('writes one line of the fence per line of text', () => {
    const svg = renderSourceListing(['```perfboard', 'board: 12x7', '```'], band, THEME, null);

    expect(svg.match(/<text/g)?.length).toBe(3);
    expect(svg).toContain('board: 12x7');
  });

  test('writes in a monospace face and keeps the spaces, so the indentation reads', () => {
    const svg = renderSourceListing(['  R1: resistor b3 b6 1k'], band, THEME, null);

    expect(svg).toContain('monospace');
    expect(svg).toContain('xml:space="preserve"');
  });

  test('escapes what it writes out — the fence is input, not markup', () => {
    const svg = renderSourceListing(['title: <img src=x>'], band, THEME, null);

    expect(svg).toContain('&lt;img');
    expect(svg).not.toContain('<img');
  });

  test('follows the theme when no colour was written, so mono stays grey', () => {
    const plain = renderSourceListing(['board: 12x7'], band, THEME, null);

    expect(plain).toContain(THEME.palette.caption);
  });

  test('paints the listing in the colour that was written', () => {
    const blue = renderSourceListing(['board: 12x7'], band, THEME, 'blue');

    expect(blue).not.toContain(THEME.palette.caption);
  });

  test('draws nothing when there is nothing to write out', () => {
    expect(renderSourceListing([], band, THEME, null)).toBe('');
  });
});

describe('測り方 (レビューで出た穴)', () => {
  test('does not cut the longest line it just measured room for', () => {
    // 帯の幅から limit を割り戻すと、丸め誤差で**測った当人の行**が `…` になる。
    const line = 'a'.repeat(37) + 'あ'.repeat(30);
    const band = { x: 0, y: 0, ...sourceBandSize([line], THEME) };

    expect(renderSourceListing([line], band, THEME, null)).not.toContain('…');
  });

  test('measures a full-width line wide enough to hold it', () => {
    // 等幅の全角は字の大きさそのまま (1.2em)。比例フォント向けの見積もりのままだと
    // 日本語の行が画布からはみ出して、黙って切れる。
    const cjk = sourceBandSize(['あ'.repeat(20)], THEME);
    const ascii = sourceBandSize(['a'.repeat(20)], THEME);

    expect(cjk.width).toBeGreaterThan(ascii.width * 1.5);
  });

  test('caps how long one line can be, the way the board size is capped', () => {
    const [, line = ''] = sourceListing(`title: ${'あ'.repeat(4000)}\n`);

    expect([...line].length).toBeLessThanOrEqual(LIMITS.sourceLineLength + 1);
    expect(line.endsWith('…')).toBe(true);
  });
});

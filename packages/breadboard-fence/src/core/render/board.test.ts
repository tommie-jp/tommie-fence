import { describe, expect, test } from 'vitest';
import { createBoard, railOrder } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { DEFAULT_BOARD } from '../types.ts';
import type { BoardSpec } from '../types.ts';
import { renderBoard } from './board.ts';
import { THEMES } from './theme.ts';

const board = createBoard('half');
const svg = renderBoard(board, createLayout(board), THEMES.classic!);

const renderSpec = (over: Partial<BoardSpec>): string => {
  const printed = createBoard({ ...DEFAULT_BOARD, ...over });
  return renderBoard(printed, createLayout(printed), THEMES.classic!);
};

const fontSizesOf = (markup: string): number[] =>
  [...markup.matchAll(/font-size="([\d.]+)"/g)].map((match) => Number(match[1]));

const textsOf = (markup: string): string[] =>
  [...markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '');

describe('renderBoard', () => {
  test('draws a hole for every position of the board', () => {
    // 10 行 + 電源レール 4 本を 30 列ぶん。
    const holes = svg.match(/<rect[^>]*rx="1"/g) ?? [];

    expect(holes).toHaveLength(14 * board.columns);
  });

  test('prints the row letter on both sides of the board', () => {
    const texts = textsOf(svg);

    for (const row of 'abcdefghij') {
      expect(texts.filter((text) => text === row)).toHaveLength(2);
    }
  });

  test('prints the column number every five columns on both edges', () => {
    const texts = textsOf(svg);

    for (const column of ['1', '5', '10', '30']) {
      expect(texts.filter((text) => text === column)).toHaveLength(2);
    }
    expect(texts).not.toContain('7');
  });

  test('marks the polarity of all four power rails', () => {
    const texts = textsOf(svg);

    expect(texts.filter((text) => text === '+')).toHaveLength(4);
    expect(texts.filter((text) => text === '−')).toHaveLength(4);
  });

  test('prints everything large enough to read at a glance', () => {
    const sizes = fontSizesOf(svg);

    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  test('prints everything in a bold weight so it stands out from the holes', () => {
    const labels = [...svg.matchAll(/<text[^>]*>/g)].map((match) => match[0]);

    expect(labels.every((label) => /font-weight="(bold|[6-9]00)"/.test(label))).toBe(true);
  });

  test('prints uppercase row letters when the board asks for them', () => {
    const texts = textsOf(renderSpec({ letters: 'upper' }));

    for (const row of 'AJ') {
      expect(texts.filter((text) => text === row)).toHaveLength(2);
    }
    expect(texts).not.toContain('a');
  });

  test('prints every column number when the board asks for all of them', () => {
    const texts = textsOf(renderSpec({ numbers: 'all' }));

    for (const column of ['2', '7', '29']) {
      expect(texts.filter((text) => text === column)).toHaveLength(2);
    }
  });

  test('leaves the rails out entirely when the board has none', () => {
    const markup = renderSpec({ rails: null });
    const holes = markup.match(/<rect[^>]*rx="1"/g) ?? [];
    const texts = textsOf(markup);

    expect(holes).toHaveLength(10 * board.columns);
    expect(texts).not.toContain('+');
    expect(texts).not.toContain('−');
  });

  test('still prints the row letters and column numbers without rails', () => {
    const texts = textsOf(renderSpec({ rails: null }));

    expect(texts.filter((text) => text === 'a')).toHaveLength(2);
    expect(texts.filter((text) => text === '30')).toHaveLength(2);
  });

  test('moves the rail stripes and signs with the configured arrangement', () => {
    const markup = renderSpec({ rails: railOrder('+-+-')! });
    const signYs = (sign: string): number[] =>
      [...markup.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>([+−])<\/text>/g)]
        .filter((match) => match[2] === sign)
        .map((match) => Number(match[1]));

    // +-+- では最下段のレールが − になる。
    expect(Math.max(...signYs('+'))).toBeLessThan(Math.max(...signYs('−')));
  });
});

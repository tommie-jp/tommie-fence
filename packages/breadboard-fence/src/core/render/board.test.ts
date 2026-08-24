import { describe, expect, test } from 'vitest';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { renderBoard } from './board.ts';

const board = createBoard('half');
const svg = renderBoard(board, createLayout(board));

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
});

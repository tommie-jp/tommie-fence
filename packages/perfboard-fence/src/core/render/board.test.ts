import { describe, expect, test } from 'vitest';
import { THEME } from './theme.ts';
import { renderBoard } from './board.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';

const board = createBoard({ cols: 6, rows: 4 });
const layout = createLayout(board);
const svg = renderBoard(board, layout, THEME);

const count = (haystack: string, needle: RegExp): number => haystack.match(needle)?.length ?? 0;

describe('renderBoard', () => {
  test('draws the plate', () => {
    expect(svg).toContain(`fill="${THEME.palette.plate}"`);
  });

  test('draws one hole for every hole on the board', () => {
    // **全穴が独立している**のがこの板なので、穴は 1 つずつ描く。
    expect(count(svg, /<circle /g)).toBe(6 * 4);
  });

  test('names every row down the left and every column across the top', () => {
    for (const label of ['a', 'b', 'c', 'd']) {
      expect(svg).toContain(`>${label}</text>`);
    }
    for (const label of ['1', '2', '3', '4', '5', '6']) {
      expect(svg).toContain(`>${label}</text>`);
    }
    expect(svg).not.toContain('>e</text>');
    expect(svg).not.toContain('>7</text>');
  });

  test('puts the row label to the left of the first hole, on its line', () => {
    const y = layout.rowY(2);
    expect(svg).toMatch(new RegExp(`<text x="[0-9.]+" y="[0-9.]*${y}[0-9.]*"[^>]*>b</text>`));
  });

  test('leaves the hole the size the theme says', () => {
    // SVG の stroke は線の中心から内外へ半分ずつ乗る。半径を穴の半径にすると
    // ランドが穴の内側へ食い込み、**見える穴がテーマの値より小さくなる**。
    const { holeSize, landSize } = THEME.metrics;
    const r = (holeSize + landSize) / 4;
    const width = (landSize - holeSize) / 2;

    expect(svg).toContain(`r="${r}"`);
    expect(svg).toContain(`stroke-width="${width}"`);
    // 内側の縁がちょうど穴の半径、外側の縁がちょうどランドの半径になる。
    expect(r - width / 2).toBe(holeSize / 2);
    expect(r + width / 2).toBe(landSize / 2);
  });

  test('carries the row letters past z, so a tall board still reads', () => {
    const tall = createBoard({ cols: 2, rows: 28 });
    const drawn = renderBoard(tall, createLayout(tall), THEME);

    expect(drawn).toContain('>z</text>');
    expect(drawn).toContain('>aa</text>');
    expect(drawn).toContain('>ab</text>');
  });
});

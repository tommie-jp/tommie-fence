import { describe, expect, test } from 'vitest';
import { THEME } from './theme.ts';
import { renderTitle } from './title.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';

const layout = createLayout(createBoard({ cols: 10, rows: 6 }), { title: true });

describe('renderTitle', () => {
  test('draws nothing when there is no title', () => {
    expect(renderTitle(null, layout, THEME)).toBe('');
  });

  test('puts the title above the board, left aligned', () => {
    const svg = renderTitle('図01 RC ローパス', layout, THEME);

    expect(svg).toContain('>図01 RC ローパス</text>');
    expect(svg).toContain('text-anchor="start"');
  });

  test('escapes the title, so a fence cannot inject markup', () => {
    expect(renderTitle('<img src=x>', layout, THEME)).not.toContain('<img');
    expect(renderTitle('<img src=x>', layout, THEME)).toContain('&lt;img');
  });

  test('cuts a title too wide for the canvas, and marks the cut', () => {
    const svg = renderTitle('あ'.repeat(80), layout, THEME);
    const shown = /<text[^>]*>([^<]*)<\/text>/.exec(svg)?.[1] ?? '';

    expect(shown.endsWith('…')).toBe(true);
  });
});

describe('createLayout with a title', () => {
  test('makes room above the board for it', () => {
    const without = createLayout(createBoard({ cols: 10, rows: 6 }));

    expect(layout.height).toBeGreaterThan(without.height);
    expect(layout.board.y).toBeGreaterThan(without.board.y);
  });

  test('leaves the board the same size', () => {
    const without = createLayout(createBoard({ cols: 10, rows: 6 }));

    expect(layout.board.width).toBe(without.board.width);
    expect(layout.board.height).toBe(without.board.height);
  });
});

import { describe, expect, test } from 'vitest';
import { renderPalette } from './palette.ts';
import { partTypeNames } from '../parts.ts';

const PALETTE = renderPalette();

describe('renderPalette', () => {
  test('offers every part type, so nothing can only be typed', () => {
    const missing = partTypeNames().filter((type) => !PALETTE.includes(`data-type="${type}"`));

    expect(missing).toEqual([]);
  });

  test('draws a shape for the featured twelve and for every row', () => {
    // よく使う 12 個は絵だけの並び、一覧のほうは**名前の前に記号**。
    // 名前を覚えていなくても選べるようにするため (実機で頼まれて足した)。
    const icons = PALETTE.match(/class="cf-icon"/g) ?? [];
    const rows = PALETTE.match(/<li>/g) ?? [];

    expect(icons.length).toBe(12 + rows.length);
    expect(rows.length).toBeGreaterThan(12);
  });

  test('says which parts are drawn between two crossings', () => {
    expect(PALETTE).toContain('data-type="resistor" data-ends="2"');
    expect(PALETTE).not.toContain('data-type="ground" data-ends');
  });

  test('lets a type be found by its name, its spelling or its short form', () => {
    // 覚えている呼び方は人による (抵抗 / resistor / r)。
    expect(PALETTE).toContain('data-find="resistor r 抵抗"');
  });

  test('folds away, so the grid keeps the full width of a narrow panel', () => {
    expect(PALETTE).toContain('<details class="cf-palette">');
    expect(PALETTE).toContain('<summary>部品を置く</summary>');
  });

  test('escapes what it puts in, since the names come from a table', () => {
    expect(PALETTE).not.toContain('<script');
    expect(PALETTE).toContain('<code>resistor</code>');
  });
});

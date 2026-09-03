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
    // 英字は**大文字が既定**。板のシルク (秋月 C タイプの A・E・J・O) に合わせている。
    for (const label of ['A', 'B', 'C', 'D']) {
      expect(svg).toContain(`>${label}</text>`);
    }
    for (const label of ['1', '2', '3', '4', '5', '6']) {
      expect(svg).toContain(`>${label}</text>`);
    }
    expect(svg).not.toContain('>E</text>');
    expect(svg).not.toContain('>7</text>');
  });

  test('puts the row label to the left of the first hole, on its line', () => {
    const y = layout.rowY(2);
    expect(svg).toMatch(new RegExp(`<text x="[0-9.]+" y="[0-9.]*${y}[0-9.]*"[^>]*>B</text>`));
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

    expect(drawn).toContain('>Z</text>');
    expect(drawn).toContain('>AA</text>');
    expect(drawn).toContain('>AB</text>');
  });

  test('takes the kind of name each axis was given, and the case of the letters', () => {
    // 手元の板のシルクに寄せるためのもの。**番地は変わらない** (`b3` のまま)。
    const drawn = renderBoard(board, layout, THEME, { row: 'numeric', col: 'alpha', case: 'lower', sides: ['left', 'top'] });

    expect(drawn).toContain('>2</text>');
    expect(drawn).toContain('>c</text>');
    expect(drawn).not.toContain('>B</text>');
  });
});

describe('名前を出す辺', () => {
  const sidesOf = (sides: readonly ('left' | 'right' | 'top' | 'bottom')[]): string =>
    renderBoard(board, layout, THEME, { row: 'alpha', col: 'numeric', case: 'upper', sides });

  test('writes the names on the left and top only, by default', () => {
    const svg = sidesOf(['left', 'top']);

    expect((svg.match(/>A<\/text>/g) ?? []).length).toBe(1);
    expect((svg.match(/>1<\/text>/g) ?? []).length).toBe(1);
  });

  test('writes them on both sides when both sides were asked for', () => {
    const svg = sidesOf(['left', 'right', 'top', 'bottom']);

    expect((svg.match(/>A<\/text>/g) ?? []).length).toBe(2);
    expect((svg.match(/>1<\/text>/g) ?? []).length).toBe(2);
  });

  test('puts the second row of names past the far edge of the board', () => {
    const svg = sidesOf(['right', 'bottom']);
    const rowAt = /<text x="([0-9.]+)"[^>]*>A<\/text>/.exec(svg);
    const colAt = /<text x="[0-9.]+" y="([0-9.]+)"[^>]*>1<\/text>/.exec(svg);

    expect(Number(rowAt?.[1])).toBeGreaterThan(layout.board.x + layout.board.width);
    expect(Number(colAt?.[1])).toBeGreaterThan(layout.board.y + layout.board.height);
  });

  test('writes none at all when none were asked for', () => {
    expect(sidesOf([])).not.toContain('</text>');
  });
});

describe('スロットの銅箔の番号', () => {
  const numbered = (size: { cols: number; rows: number }, slots: boolean): string => {
    const one = createBoard(size, { slots });
    return renderBoard(one, createLayout(one), THEME);
  };

  test('numbers the copper outside the holes, so a wire can be written to it', () => {
    // 配線の端は銅箔にも付く (`isSolderable`)。**番号が出ていないと書けない**
    // ので、`slots:` を書いた板では穴の並びの外側 1 本にも番号を出す。
    const wide = numbered({ cols: 6, rows: 4 }, true);

    // 横長は左右が銅箔 (`slotEdges` が 'sides')。列は 0 から 7 まで。
    expect(wide).toMatch(/>0<\/text>/);
    expect(wide).toMatch(/>7<\/text>/);
  });

  test('numbers the rows instead when the copper runs along the ends', () => {
    // 縦長は上下が銅箔。行が 0 と最後 + 1 まで伸びる (列は伸びない)。
    const tall = numbered({ cols: 4, rows: 6 }, true);

    expect(tall).toMatch(/>0<\/text>/);
    expect(tall).toMatch(/>G<\/text>/);
    expect(tall).not.toMatch(/>5<\/text>/);
  });

  test('leaves a board without the copper numbered as before', () => {
    const plain = numbered({ cols: 6, rows: 4 }, false);

    expect(plain).not.toMatch(/>0<\/text>/);
    expect(plain).not.toMatch(/>7<\/text>/);
  });
});

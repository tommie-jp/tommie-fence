import { describe, expect, test } from 'vitest';
import { renderSlots } from './slots.ts';
import { THEME } from './theme.ts';
import { createBoard } from '../model/board.ts';
import { PITCH, createLayout } from '../model/layout.ts';

const draw = (cols: number, rows: number, slots = true): string => {
  const board = { ...createBoard({ cols, rows }), slots };
  return renderSlots(board, createLayout(board), THEME);
};

describe('renderSlots', () => {
  test('draws nothing unless the board was written with them', () => {
    expect(draw(12, 7, false)).toBe('');
  });

  test('runs along the two short edges — the left and right of a wide board', () => {
    const board = { ...createBoard({ cols: 12, rows: 7 }), slots: true };
    const layout = createLayout(board);
    const svg = renderSlots(board, layout, THEME);
    const xs = [...svg.matchAll(/<rect x="([0-9.]+)"/g)].map(([, x = '0']) => Number(x));

    // 幅の広い板では短いほうの辺は左右。銅箔は 1 行につき 1 つ、両端に出る。
    expect(xs.length).toBe(7 * 2);
    expect(Math.min(...xs)).toBeLessThan(layout.colX(1));
    expect(Math.max(...xs)).toBeGreaterThan(layout.colX(12));
  });

  test('runs along the top and bottom of a tall board instead', () => {
    const board = { ...createBoard({ cols: 6, rows: 20 }), slots: true };
    const layout = createLayout(board);
    const svg = renderSlots(board, layout, THEME);
    const ys = [...svg.matchAll(/<rect [^>]*y="([0-9.]+)"/g)].map(([, y = '0']) => Number(y));

    expect(ys.length).toBe(6 * 2);
    expect(Math.min(...ys)).toBeLessThan(layout.rowY(1));
    expect(Math.max(...ys)).toBeGreaterThan(layout.rowY(20));
  });

  test('stands the copper one hole-pitch away from the nearest hole', () => {
    // 穴と同じ間隔だけ離す。詰めると穴の列の続きに見えて、挿せると読める。
    const board = { ...createBoard({ cols: 12, rows: 7 }), slots: true };
    const layout = createLayout(board);
    const svg = renderSlots(board, layout, THEME);
    const centres = [...svg.matchAll(/<rect x="([0-9.]+)" y="[0-9.]+" width="([0-9.]+)"/g)]
      .map(([, x = '0', w = '0']) => Number(x) + Number(w) / 2);

    expect(layout.colX(1) - Math.min(...centres)).toBe(PITCH);
    expect(Math.max(...centres) - layout.colX(12)).toBe(PITCH);
  });

  test('keeps the copper inside the board, not over the holes', () => {
    const board = { ...createBoard({ cols: 12, rows: 7 }), slots: true };
    const layout = createLayout(board);
    const svg = renderSlots(board, layout, THEME);
    const rects = [...svg.matchAll(/<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/g)];

    for (const [, x = '0', y = '0', w = '0', h = '0'] of rects) {
      expect(Number(x)).toBeGreaterThanOrEqual(layout.board.x);
      expect(Number(y)).toBeGreaterThanOrEqual(layout.board.y);
      expect(Number(x) + Number(w)).toBeLessThanOrEqual(layout.board.x + layout.board.width);
      expect(Number(y) + Number(h)).toBeLessThanOrEqual(layout.board.y + layout.board.height);
    }
  });
});

describe('裏返した板の銅箔', () => {
  test('stays at the edges of the board, which is where the copper is', () => {
    // 裏返すと列の並びが逆になる。番号で測ると、銅箔が板の内側へ入ってしまう。
    const board = { ...createBoard({ cols: 12, rows: 7 }), slots: true };
    const front = createLayout(board);
    const back = createLayout(board, { mirror: true });
    const centres = (layout: ReturnType<typeof createLayout>): number[] =>
      [...renderSlots(board, layout, THEME).matchAll(/<rect x="([0-9.]+)" y="[0-9.]+" width="([0-9.]+)"/g)]
        .map(([, x = '0', w = '0']) => Number(x) + Number(w) / 2)
        .sort((a, b) => a - b);

    expect(centres(back)).toEqual(centres(front));
  });
});

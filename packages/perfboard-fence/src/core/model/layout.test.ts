import { describe, expect, test } from 'vitest';
import { PITCH, createLayout } from './layout.ts';
import { createBoard } from './board.ts';
import { parseAddress } from './address.ts';

const at = (text: string) => parseAddress(text)!;
const board = createBoard({ cols: 28, rows: 18 });
const layout = createLayout(board);

describe('createLayout', () => {
  test('puts the holes on one even grid', () => {
    // ブレッドボードと違って溝もレールも無いので、行の間隔はどこも同じ。
    expect(layout.colX(2) - layout.colX(1)).toBe(PITCH);
    expect(layout.rowY(2) - layout.rowY(1)).toBe(PITCH);
    expect(layout.rowY(18) - layout.rowY(1)).toBe(PITCH * 17);
  });

  test('places an address where its row and column cross', () => {
    expect(layout.point(at('b3'))).toEqual({ x: layout.colX(3), y: layout.rowY(2) });
  });

  test('leaves the board big enough for every hole', () => {
    expect(layout.board.width).toBeGreaterThanOrEqual(PITCH * 27);
    expect(layout.board.height).toBeGreaterThanOrEqual(PITCH * 17);
  });

  test('keeps every hole inside the canvas', () => {
    for (const address of [at('a1'), at('r28'), at('a28'), at('r1')]) {
      const { x, y } = layout.point(address);
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x).toBeLessThan(layout.width);
      expect(y).toBeLessThan(layout.height);
    }
  });

  test('keeps the board inside the canvas, with room for the labels', () => {
    expect(layout.board.x).toBeGreaterThan(0);
    expect(layout.board.y).toBeGreaterThan(0);
    expect(layout.board.x + layout.board.width).toBeLessThan(layout.width);
    expect(layout.board.y + layout.board.height).toBeLessThan(layout.height);
  });

  test('grows with the board', () => {
    const wide = createLayout(createBoard({ cols: 56, rows: 18 }));

    expect(wide.width).toBeGreaterThan(layout.width);
    expect(wide.height).toBe(layout.height);
  });
});

describe('板の外の機器の帯', () => {
  const board = createBoard({ cols: 10, rows: 6 });
  const plain = createLayout(board);

  test('空けなければ帯は無い', () => {
    expect(plain.deviceBands).toEqual({ top: null, bottom: null });
  });

  test('上に空けると板が下がり、画布が伸びる', () => {
    const withTop = createLayout(board, { deviceTop: true });

    expect(withTop.board.y).toBeGreaterThan(plain.board.y);
    expect(withTop.height).toBeGreaterThan(plain.height);
    expect(withTop.deviceBands.top?.y).toBeLessThan(withTop.board.y);
  });

  test('下に空けても板は動かず、画布だけ伸びる', () => {
    const withBottom = createLayout(board, { deviceBottom: true });

    expect(withBottom.board.y).toBe(plain.board.y);
    expect(withBottom.height).toBeGreaterThan(plain.height);
    expect(withBottom.deviceBands.bottom?.y).toBeGreaterThan(withBottom.board.y);
  });

  test('帯は板と同じ幅', () => {
    const both = createLayout(board, { deviceTop: true, deviceBottom: true });

    expect(both.deviceBands.top?.width).toBe(both.board.width);
    expect(both.deviceBands.bottom?.width).toBe(both.board.width);
  });
});

import { describe, expect, test } from 'vitest';
import { parseAddress } from './address.ts';
import { createBoard } from './board.ts';
import { createLayout } from './layout.ts';

const board = createBoard('half');
const at = (text: string) => parseAddress(text)!;

describe('createLayout', () => {
  test('spaces neighbouring columns by one pitch', () => {
    const layout = createLayout(board);

    expect(layout.colX(6) - layout.colX(5)).toBe(layout.pitch);
  });

  test('orders the top block rows above the bottom block rows', () => {
    const layout = createLayout(board);

    expect(layout.rowY('a')).toBeLessThan(layout.rowY('e'));
    expect(layout.rowY('e')).toBeLessThan(layout.rowY('f'));
    expect(layout.rowY('f')).toBeLessThan(layout.rowY('j'));
  });

  test('puts the ravine between the two blocks', () => {
    const layout = createLayout(board);

    expect(layout.ravineY).toBeGreaterThan(layout.rowY('e'));
    expect(layout.ravineY).toBeLessThan(layout.rowY('f'));
  });

  test('puts the positive rails outside the negative rails', () => {
    const layout = createLayout(board);

    expect(layout.rowY('+t')).toBeLessThan(layout.rowY('-t'));
    expect(layout.rowY('-b')).toBeLessThan(layout.rowY('+b'));
  });

  test('keeps every hole inside the canvas', () => {
    const layout = createLayout(board);

    for (const text of ['a1', 'j30', '+t1', '+b30']) {
      const point = layout.point(at(text));
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(layout.width);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(layout.height);
    }
  });

  test('reserves a band above the board when a top device is present', () => {
    const plain = createLayout(board);
    const withDevice = createLayout(board, { deviceTop: true });

    expect(withDevice.deviceBands.top).not.toBeNull();
    expect(withDevice.height).toBeGreaterThan(plain.height);
    expect(withDevice.deviceBands.top!.y + withDevice.deviceBands.top!.height)
      .toBeLessThanOrEqual(withDevice.board.y);
  });

  test('reserves a band below the board when a bottom device is present', () => {
    const layout = createLayout(board, { deviceBottom: true });

    expect(layout.deviceBands.bottom).not.toBeNull();
    expect(layout.deviceBands.bottom!.y).toBeGreaterThanOrEqual(layout.board.y + layout.board.height);
  });

  test('widens the canvas for a full size board', () => {
    expect(createLayout(createBoard('full')).width).toBeGreaterThan(createLayout(board).width);
  });
});

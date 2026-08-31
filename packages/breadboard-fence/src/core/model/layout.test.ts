import { describe, expect, test } from 'vitest';
import { DEFAULT_BOARD } from '../types.ts';
import { parseAddress } from './address.ts';
import { createBoard, railOrder } from './board.ts';
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

  test('follows the configured rail arrangement', () => {
    const layout = createLayout(createBoard({ ...DEFAULT_BOARD, rails: railOrder('+-+-')! }));

    // +-+- では下側の + が内側 (溝寄り) に来る。番地は極性ベースなので座標だけが入れ替わる。
    expect(layout.rowY('+b')).toBeLessThan(layout.rowY('-b'));
    expect(layout.rowY('+t')).toBeLessThan(layout.rowY('-t'));
    expect(layout.rowY('+b')).toBe(createLayout(board).rowY('-b'));
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

describe('createLayout without power rails', () => {
  const railless = createBoard({ ...DEFAULT_BOARD, rails: null });
  // 列番号は a の上と j の下に出る。板の縁に食い込むと読めないので、この余白は要る。
  const COLUMN_NUMBER_ROOM = 24;

  test('drops the height the four rail rows took', () => {
    expect(createLayout(railless).height).toBeLessThan(createLayout(board).height);
  });

  test('keeps the hole block spaced as it is on a board with rails', () => {
    const layout = createLayout(railless);

    expect(layout.rowY('b') - layout.rowY('a')).toBe(layout.pitch);
    expect(layout.ravineY).toBeGreaterThan(layout.rowY('e'));
    expect(layout.ravineY).toBeLessThan(layout.rowY('f'));
  });

  test('keeps room inside the plate for the column numbers', () => {
    const layout = createLayout(railless);

    expect(layout.rowY('a') - layout.board.y).toBeGreaterThanOrEqual(COLUMN_NUMBER_ROOM);
    expect(layout.board.y + layout.board.height - layout.rowY('j')).toBeGreaterThanOrEqual(COLUMN_NUMBER_ROOM);
  });

  test('still offers a wire lane above and below the hole block', () => {
    // レールが消えてもレールとブロックの間のレーンごと消すと、迂回の逃げ場が無くなる。
    const layout = createLayout(railless);

    expect(layout.lanes.some((lane) => lane.y < layout.rowY('a'))).toBe(true);
    expect(layout.lanes.some((lane) => lane.y > layout.rowY('j'))).toBe(true);
  });

  test('keeps every hole inside the canvas', () => {
    const layout = createLayout(railless);

    for (const text of ['a1', 'j30']) {
      const point = layout.point(at(text));
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(layout.height);
    }
  });
});

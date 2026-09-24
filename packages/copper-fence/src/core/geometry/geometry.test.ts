import { describe, expect, test } from 'vitest';
import { createBoard } from '../model/board.ts';
import type { CopperSpec, LineSpec } from '../types.ts';
import { couplingsOf } from './coupling.ts';
import { cutUnderChips } from './cut.ts';
import { GND, cutZones, islandAt, islandsOf } from './islands.ts';
import { contains, grow, rectsTouch, shapesOf } from './shapes.ts';

const BOARD = createBoard(40, 20);
const line = (id: string, points: [number, number][], width: number, gap: number | null = null): LineSpec =>
  ({ kind: 'line', id, points: points.map(([x, y]) => ({ x, y })), width, gap, line: 1 });

describe('shapesOf', () => {
  test('turns a straight line into one rectangle that ends where it was written', () => {
    const { shapes, errors } = shapesOf([line('L1', [[0, 10], [40, 10]], 3)], BOARD);
    expect(errors).toEqual([]);
    expect(shapes[0]?.pieces).toEqual([{ rect: { x: 0, y: 8.5, width: 40, height: 3 }, axis: 'x', gap: 0.5 }]);
  });

  test('fills the corner of a bent line, but not its ends', () => {
    const { shapes } = shapesOf([line('L1', [[0, 10], [20, 10], [20, 2]], 2)], BOARD);
    expect(shapes[0]?.pieces.map((piece) => piece.rect)).toEqual([
      { x: 0, y: 9, width: 21, height: 2 },
      { x: 19, y: 2, width: 2, height: 9 },
    ]);
  });

  test('refuses a slanted segment and keeps the rest', () => {
    const { shapes, errors } = shapesOf([line('L1', [[0, 10], [10, 10], [20, 5]], 2)], BOARD);
    expect(shapes[0]?.pieces).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/L1 の 10,10 → 20,5 が斜めです/);
  });

  test('says when a shape leaves the board, and when a via has no ground to reach', () => {
    const specs: CopperSpec[] = [
      { kind: 'pad', id: 'P1', at: { x: 39, y: 10 }, width: 4, height: 4, line: 2 },
      { kind: 'slot', id: 'X1', at: { x: 20, y: 19.5 }, width: 4, height: 2, line: 3 },
      { kind: 'via', id: 'V1', at: { x: 5, y: 5 }, drill: 0.8, line: 4 },
    ];
    const onBack = shapesOf(specs, BOARD);
    expect(onBack.errors.map((error) => error.message)).toEqual([
      'P1 が板からはみ出しています', 'X1 が板からはみ出しています',
    ]);
    expect(onBack.slots).toHaveLength(1);
    const onFront = shapesOf(specs, createBoard(40, 20, { ground: 'front' }));
    expect(onFront.errors.some((error) => error.notice === true && /V1: 裏に地が無い/.test(error.message))).toBe(true);
  });

  test('uses the groove of the line, or else of the board', () => {
    const { shapes } = shapesOf([line('L1', [[0, 10], [40, 10]], 1, 0.15), line('L2', [[0, 2], [40, 2]], 1)], createBoard(40, 20, { cut: 0.3 }));
    expect(shapes.map((shape) => shape.pieces[0]?.gap)).toEqual([0.15, 0.3]);
  });
});

describe('rectangles', () => {
  test('touch when their edges meet, and not when a hair apart', () => {
    const a = { x: 0, y: 0, width: 10, height: 2 };
    expect(rectsTouch(a, { x: 10, y: 0, width: 2, height: 2 })).toBe(true);
    expect(rectsTouch(a, { x: 10.02, y: 0, width: 2, height: 2 })).toBe(false);
    expect(contains(a, { x: 10, y: 2 })).toBe(true);
    expect(grow(a, 1)).toEqual({ x: -1, y: -1, width: 12, height: 4 });
  });
});

describe('cutUnderChips', () => {
  const { shapes } = shapesOf([line('L1', [[0, 10], [40, 10]], 3)], BOARD);

  test('splits the line under a chip that lies along it', () => {
    const cut = cutUnderChips(shapes, [{ part: 'C1', at: { x: 20, y: 10 }, axis: null, gap: 0.8 }]);
    expect(cut.shapes[0]?.pieces.map((piece) => piece.rect)).toEqual([
      { x: 0, y: 8.5, width: 19.6, height: 3 },
      { x: 20.4, y: 8.5, width: 19.6, height: 3 },
    ]);
    expect(cut.cuts).toEqual([{ part: 'C1', at: { x: 20, y: 10 }, axis: 'x', gap: 0.8, shape: 'L1', width: 3 }]);
    expect(cut.axes.get('C1')).toBe('x');
  });

  test('leaves the line whole under a chip turned across it (a shunt)', () => {
    const cut = cutUnderChips(shapes, [{ part: 'C2', at: { x: 20, y: 10 }, axis: 'y', gap: 0.8 }]);
    expect(cut.cuts).toEqual([]);
    expect(cut.axes.get('C2')).toBe('y');
    expect(cutUnderChips(shapes, [{ part: 'C3', at: { x: 20, y: 2 }, axis: null, gap: 0.8 }]).axes.get('C3')).toBe('x');
  });

  test('drops a sliver that would be left at the end of the line', () => {
    const cut = cutUnderChips(shapes, [{ part: 'C1', at: { x: 0.2, y: 10 }, axis: 'x', gap: 0.8 }]);
    expect(cut.shapes[0]?.pieces).toHaveLength(1);
  });

  test('cuts a vertical line too', () => {
    const vertical = shapesOf([line('L1', [[20, 0], [20, 20]], 3)], BOARD).shapes;
    const cut = cutUnderChips(vertical, [{ part: 'C1', at: { x: 20, y: 10 }, axis: null, gap: 1 }]);
    expect(cut.shapes[0]?.pieces.map((piece) => piece.rect.height)).toEqual([9.5, 9.5]);
    expect(cut.axes.get('C1')).toBe('y');
  });
});

describe('islandsOf', () => {
  test('joins shapes that touch into one island, named after the first', () => {
    const { shapes } = shapesOf([
      line('L1', [[0, 10], [40, 10]], 3),
      line('S1', [[20, 10], [20, 2]], 2),
      line('L2', [[0, 18], [10, 18]], 1),
    ], BOARD);
    const islands = islandsOf(shapes);
    expect(islands.map((island) => [island.name, island.members])).toEqual([['L1', ['L1', 'S1']], ['L2', ['L2']]]);
    expect(islandAt(islands, { x: 20, y: 3 })?.name).toBe('L1');
    expect(islandAt(islands, { x: 30, y: 3 })).toBeNull();
  });

  test('names the second half of a cut line apart from the first', () => {
    const { shapes } = shapesOf([line('L1', [[0, 10], [40, 10]], 3)], BOARD);
    const cut = cutUnderChips(shapes, [{ part: 'C1', at: { x: 20, y: 10 }, axis: null, gap: 0.8 }]);
    expect(islandsOf(cut.shapes).map((island) => island.strip)).toEqual(['island:L1', 'island:L1~2']);
    expect(GND).toBe('gnd');
  });

  test('gives each island a groove as wide as its gap', () => {
    const { shapes } = shapesOf([line('L1', [[0, 10], [40, 10]], 1, 0.2)], BOARD);
    expect(cutZones(islandsOf(shapes))).toEqual([{ x: -0.2, y: 9.3, width: 40.4, height: 1.4 }]);
  });
});

describe('couplingsOf', () => {
  test('measures the gap between parallel lines side by side', () => {
    const { shapes } = shapesOf([line('A', [[5, 5], [35, 5]], 1.5), line('B', [[10, 6.75], [30, 6.75]], 1.5)], BOARD);
    const [found] = couplingsOf(shapes, BOARD);
    expect(found).toMatchObject({ a: 'A', b: 'B', spacing: 0.25, axis: 'x', overlap: 20, at: { x: 20, y: 5.875 } });
  });

  test('ignores lines that are far apart, crossing, or of the same shape', () => {
    const far = shapesOf([line('A', [[5, 5], [35, 5]], 1), line('B', [[5, 15], [35, 15]], 1)], BOARD).shapes;
    const across = shapesOf([line('A', [[5, 5], [35, 5]], 1), line('B', [[20, 6], [20, 18]], 1)], BOARD).shapes;
    const hairpin = shapesOf([line('H', [[10, 18], [10, 4], [12, 4], [12, 18]], 1)], BOARD).shapes;
    expect(couplingsOf(far, BOARD)).toEqual([]);
    expect(couplingsOf(across, BOARD)).toEqual([]);
    expect(couplingsOf(hairpin, BOARD)).toEqual([]);
  });

  test('measures vertical neighbours and keeps the narrowest gap of a pair', () => {
    const { shapes } = shapesOf([
      line('A', [[5, 2], [5, 18]], 1),
      line('B', [[6.5, 2], [6.5, 10], [7, 10], [7, 18]], 1),
    ], BOARD);
    expect(couplingsOf(shapes, BOARD)).toEqual([expect.objectContaining({ axis: 'y', spacing: 0.5 })]);
  });
});

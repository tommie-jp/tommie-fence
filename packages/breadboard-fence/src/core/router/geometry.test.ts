import { describe, expect, test } from 'vitest';
import { countCrossings, crossings, pathHitsAny, segmentHitsRect } from './geometry.ts';

const rect = { x: 100, y: 100, width: 40, height: 20 };

describe('segmentHitsRect', () => {
  test('reports a vertical segment that runs through the middle of the rectangle', () => {
    expect(segmentHitsRect({ x: 120, y: 0 }, { x: 120, y: 300 }, rect, 0)).toBe(true);
  });

  test('reports a horizontal segment that runs through the middle of the rectangle', () => {
    expect(segmentHitsRect({ x: 0, y: 110 }, { x: 300, y: 110 }, rect, 0)).toBe(true);
  });

  test('lets a segment pass beside the rectangle', () => {
    expect(segmentHitsRect({ x: 200, y: 0 }, { x: 200, y: 300 }, rect, 0)).toBe(false);
  });

  test('lets a segment stop short of the rectangle', () => {
    expect(segmentHitsRect({ x: 120, y: 0 }, { x: 120, y: 90 }, rect, 0)).toBe(false);
  });

  test('does not count a segment that only touches the edge', () => {
    expect(segmentHitsRect({ x: 100, y: 0 }, { x: 100, y: 300 }, rect, 0)).toBe(false);
  });

  test('counts a near miss once a margin is asked for', () => {
    expect(segmentHitsRect({ x: 145, y: 0 }, { x: 145, y: 300 }, rect, 0)).toBe(false);
    expect(segmentHitsRect({ x: 145, y: 0 }, { x: 145, y: 300 }, rect, 10)).toBe(true);
  });
});

describe('pathHitsAny', () => {
  test('finds the one segment of a path that crosses a rectangle', () => {
    const path = [{ x: 0, y: 0 }, { x: 0, y: 110 }, { x: 300, y: 110 }, { x: 300, y: 0 }];

    expect(pathHitsAny(path, [rect], 0)).toBe(true);
  });

  test('passes a path that goes around the rectangle', () => {
    const path = [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 0 }];

    expect(pathHitsAny(path, [rect], 0)).toBe(false);
  });
});

describe('crossings', () => {
  const vertical = (x: number) => [{ x, y: 0 }, { x, y: 200 }];
  const horizontal = (y: number) => [{ x: 0, y }, { x: 200, y }];

  test('counts a vertical wire cutting a horizontal one', () => {
    expect(crossings(vertical(50), horizontal(50))).toBe(1);
  });

  test('does not count two wires that never meet', () => {
    expect(crossings(vertical(50), horizontal(300))).toBe(0);
  });

  test('does not count parallel wires running side by side', () => {
    expect(crossings(vertical(50), vertical(60))).toBe(0);
  });

  test('does not count two wires that meet at a hole they share', () => {
    const first = [{ x: 50, y: 0 }, { x: 50, y: 100 }];
    const second = [{ x: 50, y: 100 }, { x: 200, y: 100 }];

    expect(crossings(first, second)).toBe(0);
  });

  test('counts a wire running straight over the hole where another one ends', () => {
    // 一方にとっては端点でも、素通りしているほうにとってはただの交差。
    const ending = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const passing = [{ x: 200, y: 0 }, { x: 200, y: 300 }];

    expect(crossings(ending, passing)).toBe(1);
  });

  test('counts a wire that ends on the middle of another as a crossing', () => {
    const through = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const ending = [{ x: 50, y: 0 }, { x: 50, y: 100 }, { x: 90, y: 100 }];

    expect(crossings(through, ending)).toBeGreaterThan(0);
  });
});

describe('countCrossings', () => {
  test('adds up every pair of wires in the figure', () => {
    const paths = [
      [{ x: 0, y: 50 }, { x: 200, y: 50 }],
      [{ x: 60, y: 0 }, { x: 60, y: 200 }],
      [{ x: 120, y: 0 }, { x: 120, y: 200 }],
    ];

    expect(countCrossings(paths)).toBe(2);
  });

  test('is zero for a figure whose wires all run the same way', () => {
    const paths = [
      [{ x: 0, y: 50 }, { x: 200, y: 50 }],
      [{ x: 0, y: 80 }, { x: 200, y: 80 }],
    ];

    expect(countCrossings(paths)).toBe(0);
  });
});
